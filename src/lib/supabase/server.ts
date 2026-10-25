import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY
  )!;

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component; middleware refreshes sessions.
        }
      }
    }
  });
}

/**
 * Server-only privileged Supabase Admin client.
 * Supports both SUPABASE_SECRET_KEY (new format) and SUPABASE_SERVICE_ROLE_KEY.
 * Strictly guarded from client bundle imports.
 */
export function createSupabaseServiceRoleClient() {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY_VIOLATION: Secret / Service role client must never run in the browser.');
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
  if (!url || !secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for server-side admin operation.');
  }
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
