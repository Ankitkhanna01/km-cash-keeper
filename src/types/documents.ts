export type DocumentType = 'paystub' | 'tax_form' | 'bank_record' | 'receipt' | 'other';
export type SourceType = 'primary' | 'secondary';
export type GigPlatform = 'uber' | 'doordash' | 'skip' | 'other' | null;
export type GapStatus = 'pending' | 'confirmed' | 'dismissed';
export type GapCategory = 'personal' | 'commute' | 'business' | 'other';

export interface Document {
  id: string;
  user_id: string;
  document_type: DocumentType;
  source_type: SourceType;
  platform: GigPlatform;
  period_year: number;
  period_month: number;
  income_amount: number | null;
  kilometres: number | null;
  has_verified_km: boolean;
  estimated_km: number | null;
  document_url: string | null;
  raw_ocr_data: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceRatio {
  id: string;
  user_id: string;
  year: number;
  platform: GigPlatform | 'combined';
  km_per_dollar: number;
  source_document_count: number;
  total_km: number;
  total_income: number;
  last_calculated_at: string;
  created_at: string;
}

export interface OdometerGap {
  id: string;
  user_id: string;
  year: number;
  logged_business_km: number;
  logged_personal_km: number;
  odometer_total_km: number;
  gap_km: number;
  gap_status: GapStatus;
  gap_category: GapCategory;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  paystub: 'Paystub / Earnings Statement',
  tax_form: 'Official Tax Form',
  bank_record: 'Bank Statement',
  receipt: 'Receipt / Invoice',
  other: 'Other Document',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  primary: 'Primary Source (Official)',
  secondary: 'Secondary Source (Supporting)',
};

export const PLATFORM_LABELS: Record<NonNullable<GigPlatform>, string> = {
  uber: 'Uber / Uber Eats',
  doordash: 'DoorDash',
  skip: 'Skip The Dishes',
  other: 'Other Platform',
};

export const GAP_CATEGORY_LABELS: Record<GapCategory, string> = {
  personal: 'Personal Use',
  commute: 'Commute',
  business: 'Business (Unlogged)',
  other: 'Other',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
