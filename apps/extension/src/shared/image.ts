import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Short-lived signed-URL cache so re-renders and revisits don't re-sign (mirrors
// the web app's `useSignedImageUrl`, but on the extension's Supabase client).
const signedUrlCache = new Map<string, { url: string; expires: number }>();
const SIGN_TTL_SECONDS = 3600;

/**
 * Resolve a snippet's image to a displayable URL for the side panel. External
 * references (`http…`, saved when the capturing device was signed out) are used
 * as-is; uploaded objects in the private `snippet-images` bucket get a
 * short-lived signed URL. Returns `null` until resolved (or if it can't be).
 */
export function useSignedImageUrl(imagePath: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setUrl(null);
      return;
    }
    if (imagePath.startsWith('http')) {
      setUrl(imagePath);
      return;
    }
    const cached = signedUrlCache.get(imagePath);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }
    if (!supabase) {
      setUrl(null);
      return;
    }
    let active = true;
    void supabase.storage
      .from('snippet-images')
      .createSignedUrl(imagePath, SIGN_TTL_SECONDS)
      .then(({ data }) => {
        if (!active || !data?.signedUrl) return;
        signedUrlCache.set(imagePath, {
          url: data.signedUrl,
          expires: Date.now() + (SIGN_TTL_SECONDS - 60) * 1000,
        });
        setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [imagePath]);

  return url;
}
