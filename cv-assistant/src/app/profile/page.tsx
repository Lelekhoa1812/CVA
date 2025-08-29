"use client";
import { useEffect, useState } from 'react';

type Project = { name: string; description: string; summary?: string; _needsSummary?: boolean };
type Experience = { companyName: string; role: string; timeFrom: string; timeTo: string; description: string; summary?: string; _needsSummary?: boolean };
type Profile = { name: string; major: string; school: string; studyPeriod?: string; email: string; workEmail?: string; phone: string; website?: string; linkedin?: string; projects: Project[]; experiences: Experience[]; languages?: string };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: '', major: '', school: '', studyPeriod: '', email: '', workEmail: '', phone: '', website: '', linkedin: '', projects: [], experiences: [], languages: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [enhancingProject, setEnhancingProject] = useState<number | null>(null);
  const [enhancingExperience, setEnhancingExperience] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || { name: '', major: '', school: '', studyPeriod: '', email: '', workEmail: '', phone: '', website: '', linkedin: '', projects: [], experiences: [], languages: '' });
      }
      setLoading(false);
    })();
  }, []);

  function up<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  function addProject() {
    setProfile(p => ({ ...p, projects: [...p.projects, { name: '', description: '', _needsSummary: true }] }));
  }
  function addExperience() {
    setProfile(p => ({ ...p, experiences: [...p.experiences, { companyName: '', role: '', timeFrom: '', timeTo: '', description: '', _needsSummary: true }] }));
  }

  function deleteProject(index: number) {
    setProfile(p => ({ ...p, projects: p.projects.filter((_, i) => i !== index) }));
  }

  function deleteExperience(index: number) {
    setProfile(p => ({ ...p, experiences: p.experiences.filter((_, i) => i !== index) }));
  }

  async function enhanceProject(index: number) {
    const project = profile.projects[index];
    if (!project.description.trim()) {
      setError('Please add a description before enhancing');
      return;
    }

    setEnhancingProject(index);
    setError(null);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'project',
          name: project.name,
          description: project.description
        })
      });

      if (!res.ok) {
        setError('Failed to enhance project description');
        return;
      }

      const data = await res.json();
      const newProjects = [...profile.projects];
      newProjects[index].description = data.enhancedDescription;
      setProfile(p => ({ ...p, projects: newProjects }));
    } catch {
      setError('Failed to enhance project description');
    } finally {
      setEnhancingProject(null);
    }
  }

  async function enhanceExperience(index: number) {
    const experience = profile.experiences[index];
    if (!experience.description.trim()) {
      setError('Please add a description before enhancing');
      return;
    }

    setEnhancingExperience(index);
    setError(null);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'experience',
          name: `${experience.companyName} - ${experience.role}`,
          description: experience.description
        })
      });

      if (!res.ok) {
        setError('Failed to enhance experience description');
        return;
      }

      const data = await res.json();
      const newExperiences = [...profile.experiences];
      newExperiences[index].description = data.enhancedDescription;
      setProfile(p => ({ ...p, experiences: newExperiences }));
    } catch {
      setError('Failed to enhance experience description');
    } finally {
      setEnhancingExperience(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
    if (!res.ok) {
      const data = await res.json().catch(()=>({}));
      setError(data.error || 'Failed to save');
    } else {
      const data = await res.json();
      setProfile(data.profile);
    }
    setSaving(false);
  }

  async function uploadResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setOcrLoading(true);
    setError(null);
    
    const form = new FormData();
    form.append('file', file);
    
    try {
    const res = await fetch('/api/ocr', { method: 'POST', body: form });
    if (!res.ok) {
      setError('Failed to parse resume');
      return;
    }
      
    const data: { data?: { projects?: Array<{ name?: string; description?: string }>; experiences?: Array<{ companyName?: string; role?: string; timeFrom?: string; timeTo?: string; description?: string }> } } = await res.json();
    const o = data.data || {};
      
    setProfile(p => ({
      ...p,
      projects: [...(p.projects||[]), ...((o.projects||[]).map((x)=>({ name: x.name||'', description: x.description||'', _needsSummary: true })))],
      experiences: [...(p.experiences||[]), ...((o.experiences||[]).map((x)=>({ companyName: x.companyName||'', role: x.role||'', timeFrom: x.timeFrom||'', timeTo: x.timeTo||'', description: x.description||'', _needsSummary: true })))],
    }));
    } catch {
      setError('Failed to parse resume. Please try again.');
    } finally {
      setOcrLoading(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-primary/50 rounded-full animate-[spin_1.2s_linear_infinite_reverse]"></div>
        </div>
        <div className="text-sm text-foreground dark:text-gray-100 animate-pulse">Loading your profile...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold dark:text-white text-foreground">Profile</h1>
          <button onClick={save} className="bg-primary text-primary-foreground rounded px-4 py-2 hover:bg-primary/90 transition-colors duration-200" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
      </div>
        {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Name</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.name} onChange={e=>up('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Major</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.major} onChange={e=>up('major', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">School</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.school} onChange={e=>up('school', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Study Period <span className="text-muted-foreground dark:text-white text-xs">(start year - end year)</span></label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" placeholder="2019 - 2023" value={profile.studyPeriod || ''} onChange={e=>up('studyPeriod', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Email</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.email} onChange={e=>up('email', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Work Email <span className="text-muted-foreground dark:text-white text-xs">(optional, preferred)</span></label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" placeholder="you@company.com" value={profile.workEmail || ''} onChange={e=>up('workEmail', e.target.value)} />
        </div>
        <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Website URL <span className="text-muted-foreground dark:text-white text-xs">(optional)</span></label>
            <input 
              className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" 
              placeholder="https://yourwebsite.com"
              value={profile.website || ''} 
              onChange={e=>up('website', e.target.value)} 
            />
        </div>
        <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">LinkedIn URL <span className="text-muted-foreground dark:text-white text-xs">(optional)</span></label>
            <input 
              className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" 
              placeholder="https://linkedin.com/in/yourprofile"
              value={profile.linkedin || ''} 
              onChange={e=>up('linkedin', e.target.value)} 
            />
        </div>
        <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Phone Number</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.phone} onChange={e=>up('phone', e.target.value)} />
        </div>
        <div>
            <label className="block text-sm dark:text-white mb-1 text-foreground">Languages <span className="text-muted-foreground dark:text-white text-xs">(optional, separate by commas)</span></label>
            <input 
              className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" 
              placeholder="English, Spanish, French"
              value={profile.languages || ''} 
              onChange={e=>up('languages', e.target.value)} 
            />
        </div>
      </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl dark:text-white font-semibold text-foreground">Projects</h2>
            <button onClick={addProject} className="bg-secondary text-secondary-foreground px-3 py-1 rounded text-sm hover:bg-secondary/80 transition-colors duration-200">Add Project</button>
          </div>
      <div className="space-y-4">
            {profile.projects.map((project, index) => (
              <div key={index} className="border border-border rounded-lg p-4 bg-card relative">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Project Name</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={project.name} onChange={e => {
                      const newProjects = [...profile.projects];
                      newProjects[index].name = e.target.value;
                      newProjects[index]._needsSummary = true;
                      setProfile(p => ({ ...p, projects: newProjects }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Description</label>
                    <textarea className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 min-h-20" value={project.description} onChange={e => {
                      const newProjects = [...profile.projects];
                      newProjects[index].description = e.target.value;
                      newProjects[index]._needsSummary = true;
                      setProfile(p => ({ ...p, projects: newProjects }));
                    }} />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this project?')) {
                      deleteProject(index);
                    }
                  }} 
                  className="absolute top-2 right-2 p-2 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full transition-all duration-200"
                  title="Delete Project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <div className="absolute bottom-2 right-2 group">
                  <button 
                    onClick={() => enhanceProject(index)} 
                    disabled={enhancingProject === index}
                    className={`relative p-2 rounded-full transition-all duration-300 transform group-hover:scale-110 group-hover:shadow-lg ${
                      enhancingProject === index 
                        ? 'text-muted-foreground cursor-not-allowed' 
                        : 'text-primary hover:text-primary/80 hover:bg-primary/10'
                    }`}
                  >
                    {enhancingProject === index ? (
                      <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" stroke="none" viewBox="0 0 24 24">
                        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                    Enhance your description
                    <div className="absolute top-full right-3 w-0 h-0 border-l-2 border-r-2 border-t-4 border-transparent border-t-gray-900"></div>
                  </div>
        </div>
            </div>
          ))}
        </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl dark:text-white font-semibold text-foreground">Experience</h2>
            <button onClick={addExperience} className="bg-secondary text-secondary-foreground px-3 py-1 rounded text-sm hover:bg-secondary/80 transition-colors duration-200">Add Experience</button>
      </div>
      <div className="space-y-4">
            {profile.experiences.map((experience, index) => (
              <div key={index} className="border border-border rounded-lg p-4 bg-card relative">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Company Name</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.companyName} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].companyName = e.target.value;
                      newExperiences[index]._needsSummary = true;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm mb-2 text-foreground">Role</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.role} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].role = e.target.value;
                      newExperiences[index]._needsSummary = true;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Time From</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.timeFrom} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].timeFrom = e.target.value;
                      newExperiences[index]._needsSummary = true;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Time To</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder-text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.timeTo} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].timeTo = e.target.value;
                      newExperiences[index]._needsSummary = true;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1 text-foreground">Description</label>
                    <textarea className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 min-h-20" value={experience.description} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].description = e.target.value;
                      newExperiences[index]._needsSummary = true;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this experience?')) {
                      deleteExperience(index);
                    }
                  }} 
                  className="absolute top-2 right-2 p-2 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full transition-all duration-200"
                  title="Delete Experience"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <div className="absolute bottom-2 right-2 group">
                  <button 
                    onClick={() => enhanceExperience(index)} 
                    disabled={enhancingExperience === index}
                    className={`relative p-2 rounded-full transition-all duration-300 transform group-hover:scale-110 group-hover:shadow-lg ${
                      enhancingExperience === index 
                        ? 'text-muted-foreground cursor-not-allowed' 
                        : 'text-primary hover:text-primary/80 hover:bg-primary/10'
                    }`}
                  >
                    {enhancingExperience === index ? (
                      <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" stroke="none" viewBox="0 0 24 24">
                        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                    Enhance your description
                    <div className="absolute top-full right-3 w-0 h-0 border-l-2 border-r-2 border-t-4 border-transparent border-t-gray-900"></div>
                  </div>
        </div>
            </div>
          ))}
        </div>
        </section>

        <section>
          <h2 className="text-xl dark:text-white font-semibold text-foreground mb-4">Upload Resume</h2>
          
          {/* OCR Loading State */}
          {ocrLoading && (
            <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                  <div className="absolute inset-0 w-6 h-6 border-2 border-transparent border-r-primary/60 rounded-full animate-ping"></div>
                </div>
                <div className="flex-1">
                  <p className="text-primary font-medium">Processing Resume...</p>
                  <p className="text-sm text-muted-foreground">Please wait while we extract information from your document</p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-3 w-full bg-primary/20 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }}></div>
      </div>

              {/* Processing Steps */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <span>Extracting text from document...</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                  <span>Identifying projects and experiences...</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                  <span>Preparing data for your profile...</span>
                </div>
              </div>
            </div>
          )}
          
          <input 
            type="file" 
            accept=".pdf,.png,.jpg,.jpeg,.docx,.doc" 
            onChange={uploadResume} 
            disabled={ocrLoading}
            className={`block w-full text-sm text-black dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 transition-colors duration-200 ${ocrLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
          />
          
          {ocrLoading && (
            <p className="mt-2 text-sm text-muted-foreground">
              ⚠️ Please don&apos;t close this page or navigate away while processing your resume
            </p>
          )}
        </section>
      </div>
    </div>
  );
}


