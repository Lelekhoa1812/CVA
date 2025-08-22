const mongoose = require('mongoose');

let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then((mongooseInstance) => mongooseInstance);
  }
  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const startedAt = Date.now();
  try {
    if (!process.env.MONGO_URI) {
      return res.status(500).json({ ok: false, error: 'MONGO_URI is not configured' });
    }
    await connectDB();
    // simple ping using admin
    const admin = mongoose.connection.db.admin();
    const ping = await admin.ping();
    const latencyMs = Date.now() - startedAt;
    return res.status(200).json({ ok: true, ping, latencyMs, state: mongoose.connection.readyState });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, state: mongoose.connection.readyState });
  }
};
