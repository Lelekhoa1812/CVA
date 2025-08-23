"use client";
import { useEffect, useState } from 'react';

export default function GeneratePage() {
  const [company, setCompany] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [shouldSelect, setShouldSelect] = useState(true);
  const [indices, setIndices] = useState<number[] | null>(null);
  const [items, setItems] = useState<Array<{ type: 'project'|'experience'; name: string; summary: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function selectRelevant() {
    setError(null);
    const res = await fetch('/api/generate/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription }) });
    if (!res.ok) { setError('Failed to select relevant items'); return; }
    const data = await res.json();
    setIndices(data.indices);
    setItems(data.items);
  }

  async function generate() {
    setLoading(true);
    setResult('');
    setError(null);
    const res = await fetch('/api/generate/cover-letter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, jobDescription, indices: shouldSelect ? indices : null }) });
    if (!res.ok) { setError('Failed to generate'); setLoading(false); return; }
    const data = await res.json();
    setResult(data.coverLetter);
    setLoading(false);
  }

  useEffect(() => { if (shouldSelect && jobDescription.trim()) { setIndices(null); } }, [jobDescription, shouldSelect]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>AI-Powered Cover Letter Generator</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Create Your Perfect Cover Letter
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your experience into compelling cover letters that stand out to employers
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive animate-bounce-in">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* Main Form */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6 animate-slide-up">
            <div className="bg-card border rounded-xl p-6 shadow-lg backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Job Details</span>
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Company Name *
                  </label>
                  <div className="relative">
                    <input 
                      className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                      placeholder="e.g., Google, Microsoft, Apple"
                      value={company} 
                      onChange={e => setCompany(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Job Description *
                  </label>
                  <textarea 
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 min-h-40 resize-none"
                    placeholder="Paste the job description here to help AI understand the role requirements..."
                    value={jobDescription} 
                    onChange={e => setJobDescription(e.target.value)}
                  />
                </div>

                <div className="flex items-center space-x-3 p-4 bg-accent/50 rounded-lg border border-accent">
                  <input 
                    type="checkbox" 
                    id="shouldSelect"
                    checked={shouldSelect} 
                    onChange={e => setShouldSelect(e.target.checked)}
                    className="w-4 h-4 text-primary border-input rounded focus:ring-primary/20"
                  />
                  <label htmlFor="shouldSelect" className="text-sm font-medium text-foreground">
                    Use AI to prioritize best-matching skills and experiences
                  </label>
                </div>

                {shouldSelect && (
                  <div className="space-y-3">
                    <button 
                      onClick={selectRelevant} 
                      className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg transition-all duration-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span>Identify Relevant Items</span>
                    </button>
                    
                    {indices && items.length > 0 && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center space-x-2 text-green-700 dark:text-green-300 text-sm">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Selected {indices.length} relevant items</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <button 
              onClick={generate} 
              disabled={loading || !company.trim() || !jobDescription.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-lg"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Generating Your Cover Letter...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate Cover Letter</span>
                </div>
              )}
            </button>
          </div>

          {/* Result Section */}
          <div className="space-y-6 animate-slide-up">
            <div className="bg-card border rounded-xl p-6 shadow-lg backdrop-blur-sm min-h-[400px]">
              <h2 className="text-xl font-semibold mb-6 flex items-center space-x-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Generated Cover Letter</span>
              </h2>
              
              {result ? (
                <div className="space-y-4">
                  <div className="bg-muted/30 rounded-lg p-4 whitespace-pre-wrap text-foreground font-medium leading-relaxed">
                    {result}
                  </div>
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => navigator.clipboard.writeText(result)}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors duration-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy to Clipboard</span>
                    </button>
                    <button 
                      onClick={() => setResult('')}
                      className="px-4 py-2 border border-input rounded-lg hover:bg-accent transition-colors duration-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
                  <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium">Your cover letter will appear here</p>
                  <p className="text-sm">Fill in the job details and click generate to get started</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


