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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await connectDB();
    const decoded = auth(req);

    const { jobDescription, reasonWithSkills } = req.body;
    
    if (!jobDescription) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    const Profile = mongoose.model('Profile', profileSchema);
    const profile = await Profile.findOne({ userId: decoded.user.id });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    if (!reasonWithSkills) {
      // If not reasoning with skills, return all projects and experiences
      return res.status(200).json({
        relevantProjects: profile.projects,
        relevantExperiences: profile.experiences
      });
    }

    // Use Gemini to analyze job description and find relevant skills
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const prompt = `Analyze this job description and identify which projects and experiences from the user's profile are most relevant:

    Job Description:
    ${jobDescription}

    User Profile:
    - Skills: ${profile.skills.join(', ')}
    - Projects: ${profile.projects.map(p => `${p.name}: ${p.summary}`).join(' | ')}
    - Experiences: ${profile.experiences.map(e => `${e.role} at ${e.companyName}: ${e.summary}`).join(' | ')}

    Return a JSON response with only the most relevant items:
    {
      "relevantProjects": [array of relevant project IDs or indices],
      "relevantExperiences": [array of relevant experience IDs or indices],
      "reasoning": "Brief explanation of why these items are most relevant"
    }`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    try {
      const analysis = JSON.parse(text);
      
      // Filter projects and experiences based on analysis
      const relevantProjects = profile.projects.filter((_, index) => 
        analysis.relevantProjects.includes(index) || analysis.relevantProjects.includes(index.toString())
      );
      
      const relevantExperiences = profile.experiences.filter((_, index) => 
        analysis.relevantExperiences.includes(index) || analysis.relevantExperiences.includes(index.toString())
      );

      res.status(200).json({
        relevantProjects,
        relevantExperiences,
        reasoning: analysis.reasoning || 'Analysis completed'
      });
    } catch (parseError) {
      // If JSON parsing fails, return all items
      res.status(200).json({
        relevantProjects: profile.projects,
        relevantExperiences: profile.experiences,
        reasoning: 'Analysis completed (fallback to all items)'
      });
    }
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: error.message });
  }
};
