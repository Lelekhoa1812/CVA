const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const Profile = require('../models/Profile');

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// Get user profile
router.get('/', auth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.user.id });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Create or update profile
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      major,
      school,
      graduationYear,
      skills,
      projects,
      experiences
    } = req.body;

    let profile = await Profile.findOne({ userId: req.user.user.id });

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
        userId: req.user.user.id,
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
    res.json(profile);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Parse resume PDF
router.post('/parse-resume', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Parse PDF content
    const pdfData = await pdf(req.file.buffer);
    const textContent = pdfData.text;

    // Use Gemini to extract structured information
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
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
    ${textContent}

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

    res.json(parsedData);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
