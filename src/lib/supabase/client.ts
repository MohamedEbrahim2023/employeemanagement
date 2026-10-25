import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-safe Supabase client.
 * Supports both NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * SECURITY INVARIANT: Never pass SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createBrowserClient(url, publishableKey);
}
