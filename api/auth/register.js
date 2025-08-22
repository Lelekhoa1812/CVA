const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Cached connection across invocations
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

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    if (!process.env.MONGO_URI) {
      return res.status(500).json({ message: 'MONGO_URI is not configured' });
    }

    await connectDB();
    const User = getUserModel();

    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    let existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ username, password: hashedPassword });

    const payload = { user: { id: user.id, username: user.username } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    // Handle duplicate key error
    if (error && error.code === 11000) {
      return res.status(400).json({ message: 'Username is already taken' });
    }
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
