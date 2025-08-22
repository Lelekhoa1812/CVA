const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// MongoDB connection
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
};

// Auth middleware
const auth = (req) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No token, authorization denied');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('Token is not valid');
  }
};

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Profile Schema
const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true },
  major: { type: String, required: true, trim: true },
  school: { type: String, required: true, trim: true },
  graduationYear: { type: Number, required: true },
  skills: [{ type: String, trim: true }],
  projects: [{
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    summary: { type: String, trim: true }
  }],
  experiences: [{
    companyName: { type: String, required: true, trim: true },
    timeFrom: { type: Date, required: true },
    timeTo: { type: Date, required: true },
    role: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    summary: { type: String, trim: true }
  }]
}, { timestamps: true });

module.exports = async (req, res) => {
  try {
    await connectDB();
    const decoded = auth(req);

    if (req.method === 'GET') {
      const Profile = mongoose.model('Profile', profileSchema);
      const profile = await Profile.findOne({ userId: decoded.user.id });
      
      if (!profile) {
        return res.status(404).json({ message: 'Profile not found' });
      }
      
      res.status(200).json(profile);
    } else if (req.method === 'POST') {
      const Profile = mongoose.model('Profile', profileSchema);
      const {
        name,
        major,
        school,
        graduationYear,
        skills,
        projects,
        experiences
      } = req.body;

      let profile = await Profile.findOne({ userId: decoded.user.id });

      if (profile) {
        // Update existing profile
        profile.name = name;
        profile.major = major;
        profile.school = school;
        profile.graduationYear = graduationYear;
        profile.skills = skills;
        profile.projects = projects;
        profile.experiences = experiences;
      } else {
        // Create new profile
        profile = new Profile({
          userId: decoded.user.id,
          name,
          major,
          school,
          graduationYear,
          skills,
          projects,
          experiences
        });
      }

      // Generate summaries for projects and experiences using Gemini
      if (projects && projects.length > 0) {
        for (let project of profile.projects) {
          if (!project.summary || project.summary.trim() === '') {
            try {
              const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
              const prompt = `Generate a concise, professional summary (2-3 sentences) for this project: ${project.name} - ${project.description}. Focus on key achievements and technologies used.`;
              const result = await model.generateContent(prompt);
              const response = await result.response;
              project.summary = response.text().trim();
            } catch (error) {
              console.error('Error generating project summary:', error);
              project.summary = project.description.substring(0, 150) + '...';
            }
          }
        }
      }

      if (experiences && experiences.length > 0) {
        for (let experience of profile.experiences) {
          if (!experience.summary || experience.summary.trim() === '') {
            try {
              const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
              const prompt = `Generate a concise, professional summary (2-3 sentences) for this work experience: ${experience.role} at ${experience.companyName} - ${experience.description}. Focus on key responsibilities and achievements.`;
              const result = await model.generateContent(prompt);
              const response = await result.response;
              experience.summary = response.text().trim();
            } catch (error) {
              console.error('Error generating experience summary:', error);
              experience.summary = experience.description.substring(0, 150) + '...';
            }
          }
        }
      }

      await profile.save();
      res.status(200).json(profile);
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: error.message });
  }
};
