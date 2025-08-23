"use client";
import { useEffect, useState } from 'react';

type Project = { name: string; description: string; summary?: string; _needsSummary?: boolean };
type Experience = { companyName: string; role: string; timeFrom: string; timeTo: string; description: string; summary?: string; _needsSummary?: boolean };
type Profile = { name: string; major: string; school: string; email: string; phone: string; website?: string; linkedin?: string; projects: Project[]; experiences: Experience[]; languages?: string };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: '', major: '', school: '', email: '', phone: '', website: '', linkedin: '', projects: [], experiences: [], languages: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || { name: '', major: '', school: '', email: '', phone: '', website: '', linkedin: '', projects: [], experiences: [], languages: '' });
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

  if (loading) return <div className="p-6 text-foreground">Loading...</div>;

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
            <label className="block text-sm dark:text-white mb-1 text-foreground">Email</label>
            <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={profile.email} onChange={e=>up('email', e.target.value)} />
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
              <div key={index} className="border border-border rounded-lg p-4 bg-card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Project Name</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={project.name} onChange={e => {
                      const newProjects = [...profile.projects];
                      newProjects[index].name = e.target.value;
                      setProfile(p => ({ ...p, projects: newProjects }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Description</label>
                    <textarea className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 min-h-20" value={project.description} onChange={e => {
                      const newProjects = [...profile.projects];
                      newProjects[index].description = e.target.value;
                      setProfile(p => ({ ...p, projects: newProjects }));
                    }} />
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
              <div key={index} className="border border-border rounded-lg p-4 bg-card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Company Name</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.companyName} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].companyName = e.target.value;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                                      <div>
                      <label className="block text-sm dark:text-white mb-2 text-foreground">Role</label>
                      <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.role} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].role = e.target.value;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Time From</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.timeFrom} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].timeFrom = e.target.value;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div>
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Time To</label>
                    <input className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200" value={experience.timeTo} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].timeTo = e.target.value;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm dark:text-white mb-1 text-foreground">Description</label>
                    <textarea className="w-full border border-input rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 min-h-20" value={experience.description} onChange={e => {
                      const newExperiences = [...profile.experiences];
                      newExperiences[index].description = e.target.value;
                      setProfile(p => ({ ...p, experiences: newExperiences }));
                    }} />
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
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
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
            accept=".pdf,.doc,.docx" 
            onChange={uploadResume} 
            disabled={ocrLoading}
            className={`block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 transition-colors duration-200 ${ocrLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
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


