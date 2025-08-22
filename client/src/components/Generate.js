import React, { useState } from 'react';
import axios from 'axios';
import './Generate.css';

const Generate = () => {
  const [formData, setFormData] = useState({
    companyName: '',
    jobDescription: ''
  });
  const [reasonWithSkills, setReasonWithSkills] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [relevantProjects, setRelevantProjects] = useState([]);
  const [relevantExperiences, setRelevantExperiences] = useState([]);
  const [analysisReasoning, setAnalysisReasoning] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const analyzeJobDescription = async () => {
    if (!formData.jobDescription.trim()) {
      setMessage('Please enter a job description first');
      return;
    }

    setAnalyzing(true);
    setMessage('');

    try {
      const response = await axios.post('/api/generate/analyze', {
        jobDescription: formData.jobDescription,
        reasonWithSkills
      });

      setRelevantProjects(response.data.relevantProjects);
      setRelevantExperiences(response.data.relevantExperiences);
      setAnalysisReasoning(response.data.reasoning || 'Analysis completed');

      if (reasonWithSkills) {
        setMessage(`Analysis complete! Found ${response.data.relevantProjects.length} relevant projects and ${response.data.relevantExperiences.length} relevant experiences.`);
      } else {
        setMessage('All projects and experiences will be included in the cover letter.');
      }
    } catch (error) {
      setMessage('Error analyzing job description: ' + (error.response?.data?.message || error.message));
    } finally {
      setAnalyzing(false);
    }
  };

  const generateCoverLetter = async () => {
    if (!formData.companyName.trim() || !formData.jobDescription.trim()) {
      setMessage('Please fill in both company name and job description');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/generate/cover-letter', {
        companyName: formData.companyName,
        jobDescription: formData.jobDescription,
        relevantProjects,
        relevantExperiences
      });

      setCoverLetter(response.data.coverLetter);
      setShowPreview(true);
      setMessage('Cover letter generated successfully!');
    } catch (error) {
      setMessage('Error generating cover letter: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(coverLetter).then(() => {
      setMessage('Cover letter copied to clipboard!');
    }).catch(() => {
      setMessage('Failed to copy to clipboard');
    });
  };

  const downloadAsText = () => {
    const element = document.createElement('a');
    const file = new Blob([coverLetter], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `cover-letter-${formData.companyName.toLowerCase().replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Generate Cover Letter</h1>
        <p className="page-subtitle">
          Create a personalized cover letter using AI and your profile information
        </p>
      </div>

      <div className="generate-form">
        {message && (
          <div className={`alert ${message.includes('Error') ? 'alert-error' : 'alert-success'}`}>
            {message}
          </div>
        )}

        {/* Job Information Form */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Job Information</h2>
          </div>
          
          <div className="form-group">
            <label htmlFor="companyName" className="form-label">Company Name</label>
            <input
              type="text"
              id="companyName"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              className="form-input"
              placeholder="e.g., Google, Microsoft, Apple"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="jobDescription" className="form-label">Job Description</label>
            <textarea
              id="jobDescription"
              name="jobDescription"
              value={formData.jobDescription}
              onChange={handleChange}
              className="form-input form-textarea"
              placeholder="Paste the job description here..."
              required
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reasonWithSkills}
                onChange={(e) => setReasonWithSkills(e.target.checked)}
                className="checkbox-input"
              />
              <span className="checkbox-text">
                Use AI to analyze and match relevant skills, projects, and experiences
              </span>
            </label>
            <p className="form-hint">
              When enabled, AI will analyze the job description and select only the most relevant 
              projects and experiences for your cover letter.
            </p>
          </div>

          <div className="form-actions">
            <button
              onClick={analyzeJobDescription}
              className="btn btn-secondary"
              disabled={analyzing || !formData.jobDescription.trim()}
            >
              {analyzing ? 'Analyzing...' : 'Analyze Job Description'}
            </button>
          </div>
        </div>

        {/* Analysis Results */}
        {relevantProjects.length > 0 || relevantExperiences.length > 0 ? (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Relevant Information</h2>
              {analysisReasoning && (
                <p className="analysis-reasoning">{analysisReasoning}</p>
              )}
            </div>
            
            {relevantProjects.length > 0 && (
              <div className="relevant-section">
                <h3>Relevant Projects ({relevantProjects.length})</h3>
                <div className="relevant-items">
                  {relevantProjects.map((project, index) => (
                    <div key={index} className="relevant-item">
                      <strong>{project.name}</strong>
                      <p>{project.summary || project.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {relevantExperiences.length > 0 && (
              <div className="relevant-section">
                <h3>Relevant Experiences ({relevantExperiences.length})</h3>
                <div className="relevant-items">
                  {relevantExperiences.map((experience, index) => (
                    <div key={index} className="relevant-item">
                      <strong>{experience.role} at {experience.companyName}</strong>
                      <p>{experience.summary || experience.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Generate Button */}
        <div className="card">
          <button
            onClick={generateCoverLetter}
            className="btn btn-primary generate-btn"
            disabled={loading || !formData.companyName.trim() || !formData.jobDescription.trim()}
          >
            {loading ? 'Generating Cover Letter...' : 'Generate Cover Letter'}
          </button>
        </div>

        {/* Cover Letter Preview */}
        {showPreview && coverLetter && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Generated Cover Letter</h2>
            </div>
            
            <div className="cover-letter-preview">
              {coverLetter}
            </div>

            <div className="cover-letter-actions">
              <button onClick={copyToClipboard} className="btn btn-secondary">
                Copy to Clipboard
              </button>
              <button onClick={downloadAsText} className="btn btn-primary">
                Download as Text
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Generate;
