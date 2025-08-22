import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function GET() {
  try {
    console.log('Testing MongoDB connection...');
    await connectToDatabase();
    console.log('MongoDB connected successfully');
    return NextResponse.json({ status: 'ok', message: 'MongoDB connected' });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
