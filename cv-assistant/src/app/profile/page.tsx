"use client";
import { useEffect, useState } from 'react';

type Project = { name: string; description: string; summary?: string; _needsSummary?: boolean };
type Experience = { companyName: string; role: string; timeFrom: string; timeTo: string; description: string; summary?: string; _needsSummary?: boolean };
type Profile = { name: string; major: string; school: string; email: string; phone: string; projects: Project[]; experiences: Experience[] };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: '', major: '', school: '', email: '', phone: '', projects: [], experiences: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || { name: '', major: '', school: '', email: '', phone: '', projects: [], experiences: [] });
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
    const form = new FormData();
    form.append('file', file);
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
  }

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <button onClick={save} className="bg-black text-white rounded px-4 py-2" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Name</label>
          <input className="w-full border rounded px-3 py-2" value={profile.name} onChange={e=>up('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Major</label>
          <input className="w-full border rounded px-3 py-2" value={profile.major} onChange={e=>up('major', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">School</label>
          <input className="w-full border rounded px-3 py-2" value={profile.school} onChange={e=>up('school', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border rounded px-3 py-2" value={profile.email} onChange={e=>up('email', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Phone</label>
          <input className="w-full border rounded px-3 py-2" value={profile.phone} onChange={e=>up('phone', e.target.value)} />
        </div>
      </section>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Projects</h2>
          <button onClick={addProject} className="text-sm text-blue-700">Add</button>
        </div>
        <div className="space-y-3">
          {profile.projects.map((p, i) => (
            <div key={i} className="border rounded p-3 space-y-2">
              <input className="w-full border rounded px-3 py-2" placeholder="Name" value={p.name} onChange={e=>setProfile(prev=>{ const arr=[...prev.projects]; arr[i]={...arr[i], name:e.target.value, _needsSummary:true}; return {...prev, projects:arr}; })} />
              <textarea className="w-full border rounded px-3 py-2" placeholder="Description" value={p.description} onChange={e=>setProfile(prev=>{ const arr=[...prev.projects]; arr[i]={...arr[i], description:e.target.value, _needsSummary:true}; return {...prev, projects:arr}; })} />
              {p.summary && <p className="text-sm text-gray-600">Summary: {p.summary}</p>}
              <button className="text-red-600 text-sm" onClick={()=>setProfile(prev=>({ ...prev, projects: prev.projects.filter((_,idx)=>idx!==i) }))}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Experiences</h2>
          <button onClick={addExperience} className="text-sm text-blue-700">Add</button>
        </div>
        <div className="space-y-3">
          {profile.experiences.map((ex, i) => (
            <div key={i} className="border rounded p-3 space-y-2">
              <input className="w-full border rounded px-3 py-2" placeholder="Company" value={ex.companyName} onChange={e=>setProfile(prev=>{ const arr=[...prev.experiences]; arr[i]={...arr[i], companyName:e.target.value, _needsSummary:true}; return {...prev, experiences:arr}; })} />
              <input className="w-full border rounded px-3 py-2" placeholder="Role" value={ex.role} onChange={e=>setProfile(prev=>{ const arr=[...prev.experiences]; arr[i]={...arr[i], role:e.target.value, _needsSummary:true}; return {...prev, experiences:arr}; })} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="w-full border rounded px-3 py-2" value={ex.timeFrom} onChange={e=>setProfile(prev=>{ const arr=[...prev.experiences]; arr[i]={...arr[i], timeFrom:e.target.value, _needsSummary:true}; return {...prev, experiences:arr}; })} />
                <input type="date" className="w-full border rounded px-3 py-2" value={ex.timeTo} onChange={e=>setProfile(prev=>{ const arr=[...prev.experiences]; arr[i]={...arr[i], timeTo:e.target.value, _needsSummary:true}; return {...prev, experiences:arr}; })} />
              </div>
              <textarea className="w-full border rounded px-3 py-2" placeholder="Description" value={ex.description} onChange={e=>setProfile(prev=>{ const arr=[...prev.experiences]; arr[i]={...arr[i], description:e.target.value, _needsSummary:true}; return {...prev, experiences:arr}; })} />
              {ex.summary && <p className="text-sm text-gray-600">Summary: {ex.summary}</p>}
              <button className="text-red-600 text-sm" onClick={()=>setProfile(prev=>({ ...prev, experiences: prev.experiences.filter((_,idx)=>idx!==i) }))}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Resume PDF</h2>
        <input type="file" accept="application/pdf" onChange={uploadResume} />
        <p className="text-xs text-gray-500">We will parse to prefill projects and experiences. You can edit them before saving.</p>
      </div>
    </div>
  );
}


