"use client";
import { useState } from 'react';
import GlassPanel from "@/components/ui/GlassPanel";

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function redirectToAuthenticatedApp() {
    // Root Cause vs Logic:
    // The login request sets the auth cookie asynchronously in the browser, so an immediate
    // client-side router transition can sometimes reuse stale auth state and strand the user
    // on `/login`. A full document navigation waits for the browser's cookie jar and reloads
    // protected routes against the fresh session without requiring a manual refresh.
    window.location.replace('/profile');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed');
      setSuggestions(data.suggestions || []);
      setLoading(false);
      return;
    }
    
    setLoading(false);
    redirectToAuthenticatedApp();
  }

  return (
    <div className="page-shell flex min-h-[calc(100vh-5rem)] items-center py-10 sm:py-14">
      <div className="grid w-full gap-6 xl:grid-cols-[minmax(0,1.05fr)_440px]">
        <GlassPanel strong className="hero-card hidden overflow-hidden p-8 xl:block xl:p-10">
          {/* Motivation vs Logic:
              Motivation: Authentication is the first impression of the product, so it should reinforce the same premium, theme-aware identity as the rest of the app instead of falling back to a generic form card.
              Logic: pair a story-led editorial panel with the reusable glass system and theme tokens so dark mode feels orbital, light mode feels sunlit, and copy contrast stays correct without per-theme overrides scattered through the component. */}
          <div className="halo-ring" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-5">
              <p className="section-kicker">{isRegister ? "Create Workspace Access" : "Welcome Back"}</p>
              <div className="space-y-4">
                <h1 className="hero-title font-display text-5xl leading-[0.96]">
                  {isRegister ? "Start your career studio with a brighter workspace." : "Return to your application studio in one step."}
                </h1>
                <p className="hero-copy max-w-2xl text-base leading-8">
                  CV Assistant pairs a sunlit editorial workspace in light mode with a deep-space
                  control room in dark mode, so your profile, resume, and cover letter work always
                  feels polished and easy to read.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Workspace", value: "Profile to PDF" },
                { label: "Session", value: isRegister ? "New" : "Active" },
              ].map((item) => (
                <div key={item.label} className="surface-subtle rounded-[1.25rem] px-4 py-4">
                  <div className="text-foreground text-lg font-semibold">{item.value}</div>
                  <div className="text-muted-foreground mt-1 text-xs uppercase tracking-[0.22em]">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="mx-auto w-full max-w-md p-6 sm:p-8">
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-border/80 bg-[hsl(var(--surface-2)/0.86)]">
                  <div className="absolute inset-1 rounded-[1.25rem] bg-[linear-gradient(135deg,hsl(var(--accent)/0.85),hsl(var(--primary)/0.62),hsl(var(--warm)/0.72))] blur-sm" />
                  <div className="bg-[hsl(var(--surface-1)/0.95)] text-foreground relative flex h-11 w-11 items-center justify-center rounded-[1.05rem]">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="section-kicker">Secure Access</p>
                  <h2 className="text-foreground font-display text-3xl">CV Assistant</h2>
                  <p className="text-muted-foreground text-sm leading-6">
                    {isRegister ? 'Create your account to start building tailored application materials.' : 'Sign in to continue shaping your profile, resume, and cover letter workflow.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                {[
                  "Theme-aware surfaces keep copy readable",
                  "One workspace for profile, resume, and letter output",
                ].map((item) => (
                  <div key={item} className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="status-dot" />
                    <span className="text-foreground text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
                <p className="mb-2 flex items-center text-sm text-red-700 dark:text-red-200">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </p>
                {suggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-muted-foreground mb-2 text-xs">Try one of these alternatives:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setUsername(suggestion)}
                          className="rounded-full border border-border/80 bg-[hsl(var(--surface-2)/0.85)] px-3 py-1.5 text-xs text-foreground hover:border-primary/35 hover:text-primary"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-foreground text-sm font-medium">Username</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input 
                  value={username} 
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) {
                      setError(null);
                      setSuggestions([]);
                    }
                  }} 
                  className="input-premium pl-10 pr-4" 
                  placeholder="Enter your username"
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-foreground text-sm font-medium">Password</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="input-premium pl-10 pr-12" 
                  placeholder="Enter your password"
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
                >
                  {showPassword ? (
                    // Eye-off icon
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3.53 2.47a.75.75 0 1 0-1.06 1.06l2.26 2.26C3.56 7.08 2.39 8.68 1.6 10.5a.75.75 0 0 0 0 .6C3.35 14.7 7.33 18 12 18c1.86 0 3.6-.47 5.14-1.28l3.33 3.33a.75.75 0 0 0 1.06-1.06l-18-18ZM12 16.5c-3.9 0-7.26-2.7-8.9-5.7.66-1.28 1.68-2.54 2.93-3.55l2.2 2.2A4.5 4.5 0 0 0 12 16.5Zm0-9a4.5 4.5 0 0 1 4.5 4.5c0 .37-.05.73-.14 1.07l2.3 2.3c1.07-.86 1.99-1.9 2.64-3.07a.75.75 0 0 0 0-.6C20.65 7.3 16.67 4 12 4c-1.02 0-1.99.14-2.9.4l1.64 1.64c.41-.09.84-.14 1.26-.14Z" />
                    </svg>
                  ) : (
                    // Eye icon
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 5c-4.67 0-8.65 3.3-10.4 7.1a.75.75 0 0 0 0 .6C3.35 16.7 7.33 20 12 20s8.65-3.3 10.4-7.1a.75.75 0 0 0 0-.6C20.67 8.3 16.69 5 12 5Zm0 12.5c-3.9 0-7.26-2.7-8.9-5.7 1.64-3 5-5.7 8.9-5.7s7.26 2.7 8.9 5.7c-1.64 3-5 5.7-8.9 5.7Zm0-9a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </div>
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>

            <div className="text-center">
              <button 
                type="button" 
                onClick={() => {
                  setIsRegister(v => !v);
                  setError(null);
                  setSuggestions([]);
                }} 
                className="text-sm text-primary hover:text-primary/80 transition-colors duration-200"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </button>
            </div>
          </form>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
