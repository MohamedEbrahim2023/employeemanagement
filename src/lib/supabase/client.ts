import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-safe Supabase client.
 * SECURITY INVARIANT: Never pass SUPABASE_SERVICE_ROLE_KEY to the browser client.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createBrowserClient(url, anonKey);
}
