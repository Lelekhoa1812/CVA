import { NextResponse } from 'next/server';
import { clearAuthCookieOnResponse } from '@/lib/auth';

export async function POST() {
  let res = NextResponse.json({ ok: true });
  res = clearAuthCookieOnResponse(res);
  return res;
}


