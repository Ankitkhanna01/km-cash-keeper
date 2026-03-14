import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Download a file from storage and return as ArrayBuffer
 */
async function downloadFile(path: string): Promise<ArrayBuffer | null> {
  try {
    const { data, error } = await supabase.storage.from('receipts').download(path);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Extract file path from signed URL or return path as-is
 */
function extractPath(url: string): string | null {
  if (!url) return null;
  if (url.includes('/storage/v1/object/sign/receipts/')) {
    try {
      const match = url.match(/\/storage\/v1\/object\/sign\/receipts\/(.+?)(\?|$)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }
  if (url.startsWith('http')) return null;
  return url;
}

/**
 * Recursively list all user files in storage
 */
async function listAllUserFiles(userId: string): Promise<string[]> {
  const queue: string[] = [userId];
  const visited = new Set<string>();
  const paths: string[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath || visited.has(currentPath)) continue;
    visited.add(currentPath);

    const { data, error } = await supabase.storage
      .from('receipts')
      .list(currentPath, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (error) continue;

    for (const entry of data || []) {
      if (!entry?.name || entry.name === '.emptyFolderPlaceholder') continue;
      const fullPath = `${currentPath}/${entry.name}`;
      if (!entry.id) {
        queue.push(fullPath);
      } else {
        paths.push(fullPath);
      }
    }
  }
  return paths;
}

/**
 * Compress an image via canvas, returning JPEG ArrayBuffer
 * Target max dimension 1200px, JPEG quality 0.5
 */
async function compressImage(imageData: ArrayBuffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageData]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1200;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const s = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => {
          if (!b) return reject(new Error('Canvas toBlob failed'));
          b.arrayBuffer().then(resolve).catch(reject);
        },
        'image/jpeg',
        0.5
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * Convert an image (JPG/PNG/WEBP) to a single-page PDF as ArrayBuffer
 * Compresses via canvas to keep file size small
 */
async function imageToPdfPage(imageData: ArrayBuffer, fileName: string): Promise<ArrayBuffer | null> {
  try {
    // Compress image to JPEG first
    let jpegData: ArrayBuffer;
    try {
      jpegData = await compressImage(imageData);
    } catch {
      jpegData = imageData; // fallback to original
    }

    const pdfDoc = await PDFDocument.create();
    let image;
    try {
      image = await pdfDoc.embedJpg(jpegData);
    } catch {
      try {
        image = await pdfDoc.embedPng(imageData);
      } catch {
        return null;
      }
    }

    const { width, height } = image;
    const maxW = 555;
    const maxH = 802;
    const scale = Math.min(maxW / width, maxH / height, 1);
    const scaledW = width * scale;
    const scaledH = height * scale;

    const page = pdfDoc.addPage([595, 842]);
    page.drawImage(image, {
      x: (595 - scaledW) / 2,
      y: 842 - 20 - scaledH,
      width: scaledW,
      height: scaledH,
    });

    return (await pdfDoc.save()).buffer as ArrayBuffer;
  } catch (e) {
    console.warn('Failed to convert image to PDF:', fileName, e);
    return null;
  }
}

/**
 * Merge multiple PDF ArrayBuffers into one
 */
async function mergePdfs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(page => merged.addPage(page));
    } catch (e) {
      console.warn('Failed to merge a PDF:', e);
    }
  }

  return await merged.save();
}

/**
 * Generate combined receipts PDF - all receipt images ordered by date Jan-Dec
 */
export async function generateReceiptsPdf(year: number): Promise<void> {
  toast.loading('Collecting receipt images...', { id: 'receipts-pdf' });

  try {
    // Get all expenses with receipts for the year
    const { data: yearExpenses } = await supabase
      .from('expenses')
      .select('id, date, vendor_name, amount, receipt_url')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .is('deleted_at', null)
      .not('receipt_url', 'is', null)
      .order('date', { ascending: true });

    if (!yearExpenses || yearExpenses.length === 0) {
      toast.error('No receipts found for this year', { id: 'receipts-pdf' });
      return;
    }

    // Also scan storage for unlinked receipt images
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    const addedPaths = new Set<string>();

    // Collect linked receipt files with dates
    interface ReceiptFile {
      path: string;
      date: string; // YYYY-MM-DD for sorting
      label: string;
    }

    const receiptFiles: ReceiptFile[] = [];

    for (const e of yearExpenses) {
      if (!e.receipt_url) continue;
      const filePath = extractPath(e.receipt_url);
      if (!filePath) continue;
      
      const lower = filePath.toLowerCase();
      if (lower.endsWith('.pdf')) continue; // Skip PDFs, only images
      
      addedPaths.add(filePath);
      receiptFiles.push({
        path: filePath,
        date: e.date,
        label: `${e.date} - ${e.vendor_name} - $${e.amount}`,
      });
    }

    // Add unlinked images from storage
    if (userId) {
      const storagePaths = await listAllUserFiles(userId);
      for (const fp of storagePaths) {
        if (addedPaths.has(fp)) continue;
        const lower = fp.toLowerCase();
        if (lower.endsWith('.pdf')) continue;
        if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png') && !lower.endsWith('.webp')) continue;

        addedPaths.add(fp);
        // Try to extract date from filename or use mid-year as fallback
        const dateMatch = fp.match(/(\d{4}-\d{2}-\d{2})/);
        receiptFiles.push({
          path: fp,
          date: dateMatch ? dateMatch[1] : `${year}-06-15`,
          label: fp.split('/').pop() || fp,
        });
      }
    }

    if (receiptFiles.length === 0) {
      toast.error('No receipt images found', { id: 'receipts-pdf' });
      return;
    }

    // Sort by date
    receiptFiles.sort((a, b) => a.date.localeCompare(b.date));

    toast.loading(`Converting ${receiptFiles.length} receipts to PDF...`, { id: 'receipts-pdf' });

    const pdfBuffers: ArrayBuffer[] = [];
    let processed = 0;

    for (let i = 0; i < receiptFiles.length; i += 5) {
      const batch = receiptFiles.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (rf) => {
          const data = await downloadFile(rf.path);
          if (!data) return null;
          return await imageToPdfPage(data, rf.path);
        })
      );
      
      for (const buf of results) {
        if (buf) pdfBuffers.push(buf);
      }
      
      processed += batch.length;
      toast.loading(`Converted ${processed}/${receiptFiles.length} receipts...`, { id: 'receipts-pdf' });
    }

    if (pdfBuffers.length === 0) {
      toast.error('No receipts could be converted', { id: 'receipts-pdf' });
      return;
    }

    toast.loading('Merging into single PDF...', { id: 'receipts-pdf' });
    const merged = await mergePdfs(pdfBuffers);

    const blob = new Blob([merged.buffer as ArrayBuffer], { type: 'application/pdf' });
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    
    if (blob.size > 23 * 1024 * 1024) {
      toast.warning(`Receipts PDF is ${sizeMB}MB (over 23MB limit). Try reducing receipt count.`, { id: 'receipts-pdf', duration: 8000 });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `All_Receipts_${year}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Receipts PDF created! ${pdfBuffers.length} receipts (${sizeMB}MB)`, { id: 'receipts-pdf', duration: 6000 });
  } catch (error) {
    console.error('Receipts PDF error:', error);
    toast.error('Failed to create receipts PDF', { id: 'receipts-pdf' });
  }
}

/**
 * Generate combined statements PDF - all PDFs grouped by platform/name then by month
 */
export async function generateStatementsPdf(year: number): Promise<void> {
  toast.loading('Collecting statement PDFs...', { id: 'statements-pdf' });

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      toast.error('Not authenticated', { id: 'statements-pdf' });
      return;
    }

    // Get linked documents
    const { data: yearDocs } = await supabase
      .from('documents')
      .select('id, period_year, period_month, platform, document_url, document_type')
      .eq('period_year', year)
      .not('document_url', 'is', null);

    // Also get expense PDFs
    const { data: yearExpenses } = await supabase
      .from('expenses')
      .select('id, date, vendor_name, receipt_url')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .is('deleted_at', null)
      .not('receipt_url', 'is', null);

    interface StatementFile {
      path: string;
      group: string; // Platform/vendor name for grouping
      month: number; // 1-12 for sorting within group
      label: string;
    }

    const statementFiles: StatementFile[] = [];
    const addedPaths = new Set<string>();

    // Linked documents
    for (const d of yearDocs || []) {
      if (!d.document_url) continue;
      const filePath = extractPath(d.document_url);
      if (!filePath) continue;
      if (!filePath.toLowerCase().endsWith('.pdf')) continue;

      addedPaths.add(filePath);
      const platform = d.platform || 'Other';
      const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
      statementFiles.push({
        path: filePath,
        group: platformLabel,
        month: d.period_month,
        label: `${platformLabel} - Month ${d.period_month}`,
      });
    }

    // Expense receipt PDFs
    for (const e of yearExpenses || []) {
      if (!e.receipt_url) continue;
      const filePath = extractPath(e.receipt_url);
      if (!filePath || addedPaths.has(filePath)) continue;
      if (!filePath.toLowerCase().endsWith('.pdf')) continue;

      addedPaths.add(filePath);
      const monthNum = parseInt(e.date.split('-')[1]);
      statementFiles.push({
        path: filePath,
        group: e.vendor_name || 'Unknown',
        month: monthNum,
        label: `${e.vendor_name} - ${e.date}`,
      });
    }

    // Unlinked PDFs from storage
    const storagePaths = await listAllUserFiles(userId);
    for (const fp of storagePaths) {
      if (addedPaths.has(fp)) continue;
      if (!fp.toLowerCase().endsWith('.pdf')) continue;

      addedPaths.add(fp);

      // Try to determine group name from filename/path
      const fileName = fp.split('/').pop() || '';
      const cleanName = fileName.replace(/\.\w+$/, '').replace(/[_-]/g, ' ');
      
      // Extract platform/bank name from filename
      let group = 'Other';
      const knownNames = ['tangerine', 'uber', 'doordash', 'skip', 'td', 'rbc', 'bmo', 'scotiabank', 'cibc', 'simplii'];
      const lowerName = cleanName.toLowerCase();
      for (const name of knownNames) {
        if (lowerName.includes(name)) {
          group = name.charAt(0).toUpperCase() + name.slice(1);
          break;
        }
      }
      
      // Also check path segments
      if (group === 'Other') {
        const pathLower = fp.toLowerCase();
        for (const name of knownNames) {
          if (pathLower.includes(name)) {
            group = name.charAt(0).toUpperCase() + name.slice(1);
            break;
          }
        }
      }

      // Try to extract month from filename
      let month = 6; // default mid-year
      const monthMatch = cleanName.match(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
      if (monthMatch) {
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const idx = monthNames.indexOf(monthMatch[0].toLowerCase().substring(0, 3));
        if (idx >= 0) month = idx + 1;
      }
      // Also try numeric month patterns like 2025-03 or 2025_03
      const numMonthMatch = fp.match(/(?:2025|2024)[_-](\d{1,2})/);
      if (numMonthMatch) {
        const m = parseInt(numMonthMatch[1]);
        if (m >= 1 && m <= 12) month = m;
      }

      statementFiles.push({
        path: fp,
        group,
        month,
        label: cleanName,
      });
    }

    if (statementFiles.length === 0) {
      toast.error('No PDF statements found', { id: 'statements-pdf' });
      return;
    }

    // Sort: by group name (alphabetical), then by month within group
    statementFiles.sort((a, b) => {
      const groupCmp = a.group.localeCompare(b.group);
      if (groupCmp !== 0) return groupCmp;
      return a.month - b.month;
    });

    toast.loading(`Downloading ${statementFiles.length} PDFs...`, { id: 'statements-pdf' });

    const pdfBuffers: ArrayBuffer[] = [];
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < statementFiles.length; i += 5) {
      const batch = statementFiles.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (sf) => {
          const data = await downloadFile(sf.path);
          return data;
        })
      );

      for (const buf of results) {
        if (buf) {
          pdfBuffers.push(buf);
        } else {
          failed++;
        }
      }

      processed += batch.length;
      toast.loading(`Downloaded ${processed}/${statementFiles.length} PDFs...`, { id: 'statements-pdf' });
    }

    if (pdfBuffers.length === 0) {
      toast.error('No PDFs could be downloaded', { id: 'statements-pdf' });
      return;
    }

    toast.loading('Merging all PDFs into one document...', { id: 'statements-pdf' });
    const merged = await mergePdfs(pdfBuffers);

    const blob = new Blob([merged.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `All_Statements_${year}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(
      `Statements PDF created! ${pdfBuffers.length} PDFs merged${failed > 0 ? ` (${failed} failed)` : ''}`,
      { id: 'statements-pdf', duration: 6000 }
    );
  } catch (error) {
    console.error('Statements PDF error:', error);
    toast.error('Failed to create statements PDF', { id: 'statements-pdf' });
  }
}
