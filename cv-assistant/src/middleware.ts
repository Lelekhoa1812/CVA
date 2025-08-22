import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    const { pathname } = req.nextUrl;

    // Allow the login page always
    if (pathname.startsWith('/login')) return NextResponse.next();

    // Only guard app pages; exclude all API routes from middleware
    if (pathname.startsWith('/api')) return NextResponse.next();

    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch {
    // Fail-open to avoid 500s in middleware
    return NextResponse.next();
  }
}

export const config = {
  // Exclude Next internals and static assets; do not run on API
  matcher: ['/((?!_next/|favicon.ico).*)'],
};


