import mongoose from 'mongoose';

function getMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI in environment');
  return uri;
}

declare global {
  var mongoose: { conn: typeof import('mongoose') | null; promise: Promise<typeof import('mongoose')> | null } | undefined;
}

if (!global.mongoose) {
  global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  const state = global.mongoose!;
  if (state.conn) {
    return state.conn as unknown as typeof mongoose;
  }
  if (!state.promise) {
    state.promise = mongoose.connect(getMongoUri(), { dbName: 'cv_assistant' });
  }
  state.conn = await state.promise;
  return state.conn as unknown as typeof mongoose;
}


