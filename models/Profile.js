const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  summary: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const experienceSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  timeFrom: {
    type: Date,
    required: true
  },
  timeTo: {
    type: Date,
    required: true
  },
  role: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  summary: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const profileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  major: {
    type: String,
    required: true,
    trim: true
  },
  school: {
    type: String,
    required: true,
    trim: true
  },
  graduationYear: {
    type: Number,
    required: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  projects: [projectSchema],
  experiences: [experienceSchema],
  resumeUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Profile', profileSchema);
