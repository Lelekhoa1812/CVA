import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { signAuthToken, attachAuthCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
    }
    
    console.log('Connecting to database...');
    await connectToDatabase();
    console.log('Database connected');
    
    const existing = await UserModel.findOne({ username });
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    
    console.log('Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('Password hashed');
    
    console.log('Creating user...');
    const user = await UserModel.create({ username, passwordHash });
    console.log('User created:', user._id);
    
    console.log('Signing token...');
    const token = signAuthToken({ userId: String(user._id), username });
    console.log('Token signed');
    
    let res = NextResponse.json({ ok: true });
    res = attachAuthCookie(res, token);
    return res;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}


