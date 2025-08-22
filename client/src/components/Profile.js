import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Profile.css';

const Profile = () => {
  const [profile, setProfile] = useState({
    name: '',
    major: '',
    school: '',
    graduationYear: new Date().getFullYear(),
    skills: [],
    projects: [],
    experiences: []
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showExperienceForm, setShowExperienceForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingExperience, setEditingExperience] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [showResumeInput, setShowResumeInput] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await axios.get('/api/profile');
      setProfile(response.data);
    } catch (error) {
      if (error.response?.status !== 404) {
        setMessage('Error loading profile');
      }
    }
  };

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    });
  };

  const addSkill = () => {
    if (skillInput.trim() && !profile.skills.includes(skillInput.trim())) {
      setProfile({
        ...profile,
        skills: [...profile.skills, skillInput.trim()]
      });
      setSkillInput('');
    }
  };

  const removeSkill = (skillToRemove) => {
    setProfile({
      ...profile,
      skills: profile.skills.filter(skill => skill !== skillToRemove)
    });
  };

  const handleProjectSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const projectData = {
      name: formData.get('name'),
      description: formData.get('description')
    };

    if (editingProject !== null) {
      // Update existing project
      const updatedProjects = [...profile.projects];
      updatedProjects[editingProject] = projectData;
      setProfile({ ...profile, projects: updatedProjects });
      setEditingProject(null);
    } else {
      // Add new project
      setProfile({
        ...profile,
        projects: [...profile.projects, projectData]
      });
    }
    setShowProjectForm(false);
    e.target.reset();
  };

  const handleExperienceSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const experienceData = {
      companyName: formData.get('companyName'),
      timeFrom: formData.get('timeFrom'),
      timeTo: formData.get('timeTo'),
      role: formData.get('role'),
      description: formData.get('description')
    };

    if (editingExperience !== null) {
      // Update existing experience
      const updatedExperiences = [...profile.experiences];
      updatedExperiences[editingExperience] = experienceData;
      setProfile({ ...profile, experiences: updatedExperiences });
      setEditingExperience(null);
    } else {
      // Add new experience
      setProfile({
        ...profile,
        experiences: [...profile.experiences, experienceData]
      });
    }
    setShowExperienceForm(false);
    e.target.reset();
  };

  const deleteProject = (index) => {
    const updatedProjects = profile.projects.filter((_, i) => i !== index);
    setProfile({ ...profile, projects: updatedProjects });
  };

  const deleteExperience = (index) => {
    const updatedExperiences = profile.experiences.filter((_, i) => i !== index);
    setProfile({ ...profile, experiences: updatedExperiences });
  };

  const editProject = (index) => {
    setEditingProject(index);
    setShowProjectForm(true);
  };

  const editExperience = (index) => {
    setEditingExperience(index);
    setShowExperienceForm(true);
  };

  const parseResumeText = async () => {
    if (!resumeText.trim()) {
      setMessage('Please enter resume text');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/profile/parse-resume', {
        resumeText: resumeText.trim()
      });

      const parsedData = response.data;
      setProfile({
        ...profile,
        name: parsedData.name || profile.name,
        major: parsedData.major || profile.major,
        school: parsedData.school || profile.school,
        graduationYear: parsedData.graduationYear || profile.graduationYear,
        skills: parsedData.skills || profile.skills,
        projects: parsedData.projects || profile.projects,
        experiences: parsedData.experiences || profile.experiences
      });

      setMessage('Resume parsed successfully! Please review and edit the information.');
      setShowResumeInput(false);
      setResumeText('');
    } catch (error) {
      setMessage('Error parsing resume: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage('');

    try {
      await axios.post('/api/profile', profile);
      setMessage('Profile saved successfully!');
    } catch (error) {
      setMessage('Error saving profile: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Your Profile</h1>
        <p className="page-subtitle">
          Build your professional profile to generate personalized cover letters
        </p>
      </div>

      <div className="profile-form">
        {message && (
          <div className={`alert ${message.includes('Error') ? 'alert-error' : 'alert-success'}`}>
            {message}
          </div>
        )}

        {/* Basic Information */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Basic Information</h2>
          </div>
          
          <div className="form-group">
            <label htmlFor="name" className="form-label">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={profile.name}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="major" className="form-label">Major/Field of Study</label>
            <input
              type="text"
              id="major"
              name="major"
              value={profile.major}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="school" className="form-label">University/Institution</label>
            <input
              type="text"
              id="school"
              name="school"
              value={profile.school}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="graduationYear" className="form-label">Graduation Year</label>
            <input
              type="number"
              id="graduationYear"
              name="graduationYear"
              value={profile.graduationYear}
              onChange={handleChange}
              className="form-input"
              min="2000"
              max="2030"
              required
            />
          </div>
        </div>

        {/* Skills */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Skills</h2>
          </div>
          
          <div className="skills-container">
            {profile.skills.map((skill, index) => (
              <div key={index} className="skill-tag">
                {skill}
                <button onClick={() => removeSkill(skill)}>&times;</button>
              </div>
            ))}
          </div>

          <div className="skill-input-container">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              placeholder="Add a skill"
              className="form-input"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
            />
            <button onClick={addSkill} className="btn btn-primary">Add</button>
          </div>
        </div>

        {/* Resume Input */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Resume Information</h2>
          </div>
          
          {!showResumeInput ? (
            <button
              onClick={() => setShowResumeInput(true)}
              className="add-card-btn"
            >
              + Add Resume Information
            </button>
          ) : (
            <div>
              <div className="form-group">
                <label htmlFor="resumeText" className="form-label">Paste your resume text here</label>
                <textarea
                  id="resumeText"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  className="form-input form-textarea"
                  placeholder="Copy and paste your resume text here. We'll use AI to extract the information..."
                  rows="8"
                />
              </div>
              
              <div className="card-actions">
                <button
                  onClick={parseResumeText}
                  className="btn btn-primary"
                  disabled={loading || !resumeText.trim()}
                >
                  {loading ? 'Parsing Resume...' : 'Parse Resume'}
                </button>
                <button
                  onClick={() => {
                    setShowResumeInput(false);
                    setResumeText('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Projects</h2>
          </div>
          
          <div className="card-grid">
            {profile.projects.map((project, index) => (
              <div key={index} className="card-item">
                <h3>{project.name}</h3>
                <p>{project.description}</p>
                <div className="card-actions">
                  <button onClick={() => editProject(index)} className="btn btn-secondary btn-small">
                    Edit
                  </button>
                  <button onClick={() => deleteProject(index)} className="btn btn-danger btn-small">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!showProjectForm && (
            <button
              onClick={() => setShowProjectForm(true)}
              className="add-card-btn"
            >
              + Add Project
            </button>
          )}

          {showProjectForm && (
            <div className="card">
              <h3>{editingProject !== null ? 'Edit Project' : 'Add New Project'}</h3>
              <form onSubmit={handleProjectSubmit}>
                <div className="form-group">
                  <label htmlFor="projectName" className="form-label">Project Name</label>
                  <input
                    type="text"
                    id="projectName"
                    name="name"
                    defaultValue={editingProject !== null ? profile.projects[editingProject]?.name : ''}
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="projectDescription" className="form-label">Description</label>
                  <textarea
                    id="projectDescription"
                    name="description"
                    defaultValue={editingProject !== null ? profile.projects[editingProject]?.description : ''}
                    className="form-input form-textarea"
                    required
                  />
                </div>
                <div className="card-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingProject !== null ? 'Update' : 'Add'} Project
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectForm(false);
                      setEditingProject(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Experiences */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Work Experience</h2>
          </div>
          
          <div className="card-grid">
            {profile.experiences.map((experience, index) => (
              <div key={index} className="card-item">
                <h3>{experience.role}</h3>
                <p><strong>{experience.companyName}</strong></p>
                <p>{experience.timeFrom} - {experience.timeTo}</p>
                <p>{experience.description}</p>
                <div className="card-actions">
                  <button onClick={() => editExperience(index)} className="btn btn-secondary btn-small">
                    Edit
                  </button>
                  <button onClick={() => deleteExperience(index)} className="btn btn-danger btn-small">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!showExperienceForm && (
            <button
              onClick={() => setShowExperienceForm(true)}
              className="add-card-btn"
            >
              + Add Experience
            </button>
          )}

          {showExperienceForm && (
            <div className="card">
              <h3>{editingExperience !== null ? 'Edit Experience' : 'Add New Experience'}</h3>
              <form onSubmit={handleExperienceSubmit}>
                <div className="form-group">
                  <label htmlFor="companyName" className="form-label">Company Name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    defaultValue={editingExperience !== null ? profile.experiences[editingExperience]?.companyName : ''}
                    className="form-input"
                    required
                  />
                </div>
                
                <div className="date-inputs">
                  <div className="form-group">
                    <label htmlFor="timeFrom" className="form-label">Start Date</label>
                    <input
                      type="month"
                      id="timeFrom"
                      name="timeFrom"
                      defaultValue={editingExperience !== null ? profile.experiences[editingExperience]?.timeFrom : ''}
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="timeTo" className="form-label">End Date</label>
                    <input
                      type="month"
                      id="timeTo"
                      name="timeTo"
                      defaultValue={editingExperience !== null ? profile.experiences[editingExperience]?.timeTo : ''}
                      className="form-input"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="role" className="form-label">Job Title/Role</label>
                  <input
                    type="text"
                    id="role"
                    name="role"
                    defaultValue={editingExperience !== null ? profile.experiences[editingExperience]?.role : ''}
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="experienceDescription" className="form-label">Description</label>
                  <textarea
                    id="experienceDescription"
                    name="description"
                    defaultValue={editingExperience !== null ? profile.experiences[editingExperience]?.description : ''}
                    className="form-input form-textarea"
                    required
                  />
                </div>

                <div className="card-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingExperience !== null ? 'Update' : 'Add'} Experience
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExperienceForm(false);
                      setEditingExperience(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="card">
          <button
            onClick={saveProfile}
            className="btn btn-success"
            style={{ width: '100%', fontSize: '18px', padding: '16px' }}
            disabled={saving}
          >
            {saving ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
