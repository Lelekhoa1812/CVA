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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await connectDB();
    const decoded = auth(req);

    // For Vercel, we'll need to handle file uploads differently
    // This is a simplified version - in production you might want to use a service like Cloudinary
    
    const { resumeText } = req.body; // We'll send the text content instead of file

    if (!resumeText) {
      return res.status(400).json({ message: 'Resume text is required' });
    }

    // Use Gemini to extract structured information
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const prompt = `Parse this resume text and extract the following information in valid JSON format:
    {
      "name": "Full Name",
      "major": "Major/Field of Study",
      "school": "University/Institution Name",
      "graduationYear": 2024,
      "skills": ["skill1", "skill2", "skill3"],
      "projects": [
        {
          "name": "Project Name",
          "description": "Project description"
        }
      ],
      "experiences": [
        {
          "companyName": "Company Name",
          "timeFrom": "2023-01",
          "timeTo": "2023-12",
          "role": "Job Title",
          "description": "Job description"
        }
      ]
    }

    Resume text:
    ${resumeText}

    Return only the JSON, no additional text.`;

    let attempts = 0;
    let parsedData = null;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        
        // Try to parse JSON
        parsedData = JSON.parse(text);
        break;
      } catch (parseError) {
        attempts++;
        if (attempts >= maxAttempts) {
          return res.status(500).json({ 
            message: 'Failed to parse resume after multiple attempts',
            error: parseError.message 
          });
        }
      }
    }

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('Resume parsing error:', error);
    res.status(500).json({ message: error.message });
  }
};
