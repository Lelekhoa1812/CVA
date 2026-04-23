import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    const { pathname } = req.nextUrl;
    const basePath = req.nextUrl.basePath || "";
    const relativePath = pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;

    // Root Cause vs Logic:
    // Root Cause: deployments mounted under a scoped basePath hit this middleware with prefixed URLs,
    // so the unmatched hard-coded `/login`/`/api` checks redirected legitimate routes to NEXT’s 404.
    // Logic: strip the basePath before evaluating guards and reinstate it when issuing redirects.
    if (relativePath.startsWith('/login')) return NextResponse.next();

    // Only guard app pages; exclude all API routes from middleware
    if (relativePath.startsWith('/api')) return NextResponse.next();

    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = `${basePath}/login`;
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


