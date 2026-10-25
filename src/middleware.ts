import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_ROUTES = ['/login', '/reset-password', '/setup-password'];

export function sanitizeRedirectPath(redirectParam: string | null, role: 'admin' | 'employee'): string {
  const fallback = role === 'admin' ? '/admin' : '/employee';
  if (!redirectParam) return fallback;
  const trimmed = redirectParam.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('://')) {
    return fallback;
  }
  if (role === 'employee' && trimmed.startsWith('/admin')) {
    return '/employee';
  }
  return trimmed;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify active profile and trusted role server-side
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status, deleted_at')
    .eq('id', user.id)
    .single();

  if (!profile || profile.account_status !== 'active' || profile.deleted_at !== null) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=account_inactive', request.url));
  }

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = roleRecord?.role ?? 'employee';

  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/employee', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(role === 'admin' ? '/admin' : '/employee', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)']
};
