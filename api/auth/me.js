const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

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

const getUserModel = () => {
  const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    password: { type: String, required: true, minlength: 6 }
  }, { timestamps: true });
  return mongoose.models.User || mongoose.model('User', UserSchema);
};

const auth = (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('No token, authorization denied');
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    if (!process.env.MONGO_URI) {
      return res.status(500).json({ message: 'MONGO_URI is not configured' });
    }

    await connectDB();
    const User = getUserModel();

    const decoded = auth(req);
    const user = await User.findById(decoded.user.id).select('-password');
    res.status(200).json(user);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: error.message || 'Unauthorized' });
  }
};
