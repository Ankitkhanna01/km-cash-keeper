import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const URL_CACHE_DURATION = 55 * 60 * 1000; // 55 minutes (signed URLs valid for 1 hour)

interface CachedUrl {
  url: string;
  expiry: number;
}

// In-memory cache for signed URLs
const urlCache = new Map<string, CachedUrl>();

/**
 * Hook for securely accessing files from private storage buckets.
 * Generates signed URLs on-demand with caching to minimize API calls.
 */
export function useSecureStorage() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  /**
   * Get a signed URL for a file in a private bucket.
   * Uses caching to avoid regenerating URLs unnecessarily.
   * 
   * @param bucket - The storage bucket name
   * @param filePath - The path to the file (not a full URL)
   * @param expirySeconds - URL validity in seconds (default 1 hour)
   * @returns The signed URL or null if file doesn't exist
   */
  const getSignedUrl = useCallback(async (
    bucket: string,
    filePath: string | null | undefined,
    expirySeconds: number = 60 * 60
  ): Promise<string | null> => {
    if (!filePath) return null;
    
    // Skip if already a signed URL or external URL
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // If it's a Supabase signed URL that might be expired, extract the path and regenerate
      if (filePath.includes('/storage/v1/object/sign/')) {
        try {
          const urlObj = new URL(filePath);
          const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+)/);
          if (pathMatch) {
            const extractedBucket = pathMatch[1];
            const extractedPath = decodeURIComponent(pathMatch[2]);
            return getSignedUrl(extractedBucket, extractedPath, expirySeconds);
          }
        } catch {
          // If URL parsing fails, return original
          return filePath;
        }
      }
      return filePath;
    }

    const cacheKey = `${bucket}:${filePath}`;
    const cached = urlCache.get(cacheKey);
    
    // Return cached URL if still valid
    if (cached && cached.expiry > Date.now()) {
      return cached.url;
    }

    setLoading(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expirySeconds);

      if (error) {
        console.error('Error creating signed URL:', error);
        return null;
      }

      // Cache the URL
      urlCache.set(cacheKey, {
        url: data.signedUrl,
        expiry: Date.now() + URL_CACHE_DURATION,
      });

      return data.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);

  /**
   * Clear the URL cache (useful when files are deleted)
   */
  const clearCache = useCallback((bucket?: string, filePath?: string) => {
    if (bucket && filePath) {
      urlCache.delete(`${bucket}:${filePath}`);
    } else if (bucket) {
      for (const key of urlCache.keys()) {
        if (key.startsWith(`${bucket}:`)) {
          urlCache.delete(key);
        }
      }
    } else {
      urlCache.clear();
    }
  }, []);

  return {
    getSignedUrl,
    clearCache,
    loading,
  };
}
