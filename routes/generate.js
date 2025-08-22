const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const Profile = require('../models/Profile');

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Analyze job description and match skills
router.post('/analyze', auth, async (req, res) => {
  try {
    const { jobDescription, reasonWithSkills } = req.body;
    
    if (!jobDescription) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    const profile = await Profile.findOne({ userId: req.user.user.id });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    if (!reasonWithSkills) {
      // If not reasoning with skills, return all projects and experiences
      return res.json({
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

      res.json({
        relevantProjects,
        relevantExperiences,
        reasoning: analysis.reasoning || 'Analysis completed'
      });
    } catch (parseError) {
      // If JSON parsing fails, return all items
      res.json({
        relevantProjects: profile.projects,
        relevantExperiences: profile.experiences,
        reasoning: 'Analysis completed (fallback to all items)'
      });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Generate cover letter
router.post('/cover-letter', auth, async (req, res) => {
  try {
    const { 
      companyName, 
      jobDescription, 
      relevantProjects, 
      relevantExperiences 
    } = req.body;

    if (!companyName || !jobDescription) {
      return res.status(400).json({ message: 'Company name and job description are required' });
    }

    const profile = await Profile.findOne({ userId: req.user.user.id });
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

    res.json({ coverLetter });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
