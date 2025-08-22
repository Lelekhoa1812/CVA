import jwt from 'jsonwebtoken';
import type { NextRequest, NextResponse } from 'next/server';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET in environment');
  return secret;
}

export type AuthTokenPayload = {
  userId: string;
  username: string;
};

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function attachAuthCookie<T>(res: NextResponse<T>, token: string): NextResponse<T> {
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export function clearAuthCookieOnResponse<T>(res: NextResponse<T>): NextResponse<T> {
  res.cookies.delete('auth_token');
  return res;
}

export function getAuthFromCookies(req: NextRequest): AuthTokenPayload | null {
  const token = req.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}


