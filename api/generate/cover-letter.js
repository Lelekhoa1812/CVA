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

    const { 
      companyName, 
      jobDescription, 
      relevantProjects, 
      relevantExperiences 
    } = req.body;

    if (!companyName || !jobDescription) {
      return res.status(400).json({ message: 'Company name and job description are required' });
    }

    const Profile = mongoose.model('Profile', profileSchema);
    const profile = await Profile.findOne({ userId: decoded.user.id });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Use Gemini to generate cover letter
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    
    const prompt = `Generate a professional cover letter for this job application:

    Company: ${companyName}
    Job Description: ${jobDescription}

    Candidate Information:
    - Name: ${profile.name}
    - Education: ${profile.major} at ${profile.school} (Graduation: ${profile.graduationYear})
    - Skills: ${profile.skills.join(', ')}

    Relevant Projects: ${relevantProjects.map(p => `${p.name}: ${p.summary}`).join(' | ')}
    Relevant Experiences: ${relevantExperiences.map(e => `${e.role} at ${e.companyName}: ${e.summary}`).join(' | ')}

    Generate a professional, compelling cover letter that:
    1. Addresses the hiring manager professionally
    2. Shows enthusiasm for the company and position
    3. Highlights relevant skills and experiences
    4. Connects the candidate's background to the job requirements
    5. Ends with a strong call to action
    6. Is approximately 300-400 words
    7. Has a professional tone and structure

    Format the response as a proper cover letter with paragraphs.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const coverLetter = response.text().trim();

    res.status(200).json({ coverLetter });
  } catch (error) {
    console.error('Cover letter generation error:', error);
    res.status(500).json({ message: error.message });
  }
};
