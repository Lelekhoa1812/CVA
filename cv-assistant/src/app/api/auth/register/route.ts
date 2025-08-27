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
    
    // Check if username already exists
    const existing = await UserModel.findOne({ username });
    if (existing) {
      // Generate some alternative username suggestions
      const suggestions = [
        `${username}123`,
        `${username}_${Math.floor(Math.random() * 1000)}`,
        `${username}${new Date().getFullYear().toString().slice(-2)}`,
        `${username}${Math.random().toString(36).substring(2, 5)}`
      ];
      
      return NextResponse.json({ 
        error: `Username "${username}" is already taken. Please choose a different username.`,
        suggestions: suggestions
      }, { status: 409 });
    }
    
    // Additional validation
    if (username.length < 3) {
      return NextResponse.json({ 
        error: 'Username must be at least 3 characters long' 
      }, { status: 400 });
    }
    
    if (username.length > 20) {
      return NextResponse.json({ 
        error: 'Username must be no more than 20 characters long' 
      }, { status: 400 });
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json({ 
        error: 'Username can only contain letters, numbers, hyphens, and underscores' 
      }, { status: 400 });
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


