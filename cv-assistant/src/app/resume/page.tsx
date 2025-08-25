"use client";
import { useEffect, useMemo, useState } from 'react';

type Project = { name: string; summary?: string };
type Experience = { companyName: string; role: string; summary?: string };
type Profile = { name: string; major: string; school: string; email: string; phone: string; website?: string; linkedin?: string; projects: Project[]; experiences: Experience[]; languages?: string };

export default function ResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [skills, setSkills] = useState<string>("");
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [selectedExperiences, setSelectedExperiences] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      }
    })();
  }, []);

  const totalSelected = selectedProjects.length + selectedExperiences.length;
  const limitReached = totalSelected > 10;

  function toggle(index: number, list: number[], setList: (v: number[]) => void) {
    setList(list.includes(index) ? list.filter(i => i !== index) : [...list, index]);
  }

  async function generate() {
    if (!profile) return;
    if (limitReached) {
      setError('You can include at most 10 items across projects and experiences.');
      return;
    }
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    const res = await fetch('/api/resume/harvard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills, selectedProjects, selectedExperiences })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to generate PDF');
      setLoading(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    setLoading(false);
  }

  function reset() {
    setPdfUrl(null);
  }

  if (!profile) return <div className="p-6 text-foreground">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold dark:text-white text-foreground">Resume (Harvard Style)</h1>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">{error}</div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-card border rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Skills</h2>
              <textarea
                className="w-full px-3 py-2 border rounded bg-background text-foreground min-h-24"
                placeholder="e.g., JavaScript, React, Node.js, Python, SQL"
                value={skills}
                onChange={e => setSkills(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">Comma-separated list. Will appear under Skills.</p>
            </div>

            <div className="bg-card border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Projects</h2>
                <span className={`text-sm ${limitReached ? 'text-destructive' : 'text-muted-foreground'}`}>{totalSelected}/10 selected</span>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto pr-2">
                {profile.projects?.map((p, i) => (
                  <label key={i} className="flex items-start space-x-3 p-2 rounded hover:bg-accent cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedProjects.includes(i)}
                      onChange={() => toggle(i, selectedProjects, setSelectedProjects)}
                    />
                    <div>
                      <div className="font-medium text-foreground">{p.name || 'Untitled Project'}</div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{p.summary || ''}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-card border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Experiences</h2>
                <span className={`text-sm ${limitReached ? 'text-destructive' : 'text-muted-foreground'}`}>{totalSelected}/10 selected</span>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto pr-2">
                {profile.experiences?.map((ex, i) => (
                  <label key={i} className="flex items-start space-x-3 p-2 rounded hover:bg-accent cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedExperiences.includes(i)}
                      onChange={() => toggle(i, selectedExperiences, setSelectedExperiences)}
                    />
                    <div>
                      <div className="font-medium text-foreground">{ex.companyName} — {ex.role}</div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{ex.summary || ''}</div>
                    </div>
                  </label>
                ))}
              </div>
              {limitReached && (
                <div className="mt-2 text-xs text-destructive">You can include at most 10 items. Please deselect some.</div>
              )}
            </div>

            <button
              onClick={generate}
              disabled={loading || limitReached}
              className="w-full bg-primary text-primary-foreground rounded px-4 py-3 hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Generating PDF...' : 'Generate PDF'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-4 min-h-[400px] flex items-center justify-center">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-[600px] rounded" />
              ) : (
                <div className="text-muted-foreground text-center">
                  <p className="font-medium">Your generated resume preview will appear here</p>
                  <p className="text-sm">Fill the form and click Generate PDF</p>
                </div>
              )}
            </div>
            {pdfUrl && (
              <div className="flex gap-3">
                <button onClick={reset} className="px-4 py-2 border rounded hover:bg-accent">Retry</button>
                <a href={pdfUrl} download="resume.pdf" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">Download PDF</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


