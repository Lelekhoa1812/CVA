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
  const [enhance, setEnhance] = useState<boolean>(false);
  const [stylingCustomization, setStylingCustomization] = useState<boolean>(false);
  const [contentCustomization, setContentCustomization] = useState<boolean>(false);
  const [stylingMessages, setStylingMessages] = useState<Array<{ role: 'user'|'assistant'; content: string }>>([]);
  const [contentMessages, setContentMessages] = useState<Array<{ role: 'user'|'assistant'; content: string }>>([]);
  const [coachInput, setCoachInput] = useState<string>('');
  const [currentAgent, setCurrentAgent] = useState<'styling' | 'content' | null>(null);
  const [stylePreferences, setStylePreferences] = useState<{
    fontSize?: string;
    useBold?: boolean;
    useItalic?: boolean;
    boldSections?: string[];
    italicSections?: string[];
    contentDensity?: string;
    additionalNotes?: string;
  } | null>(null);

  // Function to enhance specific targeted projects/experiences
  async function enhanceTargetedItems(userResponse: string) {
    if (!userResponse || userResponse.toLowerCase().includes('none')) {
      return; // Fallback to original settings
    }

    try {
      // Parse user response to identify which items to enhance
      const enhanceRes = await fetch('/api/resume/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: userResponse, 
          contentType: 'targeted_enhancement',
          qaContext: [...stylingMessages, ...contentMessages].map(m => `${m.role}: ${m.content}`).join('\n')
        })
      });
      
      if (enhanceRes.ok) {
        const enhanceData = await enhanceRes.json();
        // The enhanced content will be used when generating the PDF
        console.log('Enhanced targeted items:', enhanceData);
      }
    } catch (error) {
      console.error('Failed to enhance targeted items:', error);
    }
  }

  // Function to start styling questions
  function startStylingQuestions() {
    // No need to call AI - questions are hard-coded in the UI
    setStylingMessages([]);
  }

  // Function to start content questions
  function startContentQuestions() {
    // No need to call AI - questions are hard-coded in the UI
    setContentMessages([]);
  }

  // Function to handle question submission
  function handleQuestionSubmit() {
    if (!coachInput.trim()) return;
    
    const currentMessages = currentAgent === 'styling' ? stylingMessages : contentMessages;
    const newMessages = [...currentMessages, { role: 'user' as const, content: coachInput.trim() }];
    
    if (currentAgent === 'styling') {
      setStylingMessages(newMessages);
      
      // Process styling preferences when all 3 questions are answered
      if (newMessages.length >= 3) {
        // Parse styling preferences manually
        const preferences = parseStylingPreferences(newMessages);
        setStylePreferences(preferences);
        
        // Show completion message
        setStylingMessages(m => [...m, { role: 'assistant', content: 'Styling preferences set successfully! ✅' }]);
        
        // If content customization is also enabled, transition to content agent
        if (contentCustomization) {
          setTimeout(() => {
            setCurrentAgent('content');
            startContentQuestions();
          }, 1500); // Wait 1.5 seconds before transitioning
        }
      }
    } else {
      setContentMessages(newMessages);
      
      // Process content preferences when all 2 questions are answered
      if (newMessages.length >= 2) {
        // Parse content preferences manually
        const preferences = parseContentPreferences(newMessages);
        setStylePreferences(prev => ({ ...prev, ...preferences }));
        
        // Show completion message
        setContentMessages(m => [...m, { role: 'assistant', content: 'Content preferences set successfully! ✅' }]);
      }
    }
    
    setCoachInput('');
  }

  // Function to manually parse styling preferences
  function parseStylingPreferences(messages: Array<{ role: string; content: string }>) {
    const userAnswers = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
    
    let fontSize = '11pt';
    let useBold = false;
    let useItalic = false;
    let contentDensity = 'balanced';
    
    // Parse font size from first answer
    if (userAnswers[0]) {
      if (userAnswers[0].includes('10pt') || userAnswers[0].includes('smaller')) {
        fontSize = '10pt';
      } else if (userAnswers[0].includes('12pt') || userAnswers[0].includes('larger')) {
        fontSize = '12pt';
      }
      
      // Parse bold/italic preferences
      if (userAnswers[0].includes('bold')) {
        useBold = true;
      }
      if (userAnswers[0].includes('italic')) {
        useItalic = true;
      }
    }
    
    // Parse layout style from second answer
    // This could be used for future layout customization
    
    // Parse color preferences from third answer
    // This could be used for future color customization
    
    return {
      fontSize,
      useBold,
      useItalic,
      boldSections: [],
      italicSections: [],
      contentDensity,
      additionalNotes: 'Manually parsed preferences'
    };
  }

  // Function to manually parse content preferences
  function parseContentPreferences(messages: Array<{ role: string; content: string }>) {
    const userAnswers = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
    
    let contentDensity = 'balanced';
    
    // Parse content density from first answer
    if (userAnswers[0]) {
      if (userAnswers[0].includes('concise')) {
        contentDensity = 'concise';
      } else if (userAnswers[0].includes('detailed')) {
        contentDensity = 'detailed';
      }
      // 'balanced' is default
    }
    
    // Parse achievements from second answer
    // Store for potential future use in content enhancement
    
    return {
      contentDensity,
      additionalNotes: 'Manually parsed content preferences'
    };
  }

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
  const limitReached = totalSelected > 7;

  function toggle(index: number, list: number[], setList: (v: number[]) => void) {
    setList(list.includes(index) ? list.filter(i => i !== index) : [...list, index]);
  }

  async function generate() {
    if (!profile) return;
    if (limitReached) {
      setError('You can include at most 7 items across projects and experiences.');
      return;
    }
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    
    // Debug: Log what we're sending
    console.log('Generating resume with:', {
      skills,
      selectedProjects,
      selectedExperiences,
      enhance,
      qa: [...stylingMessages, ...contentMessages],
      stylePreferences
    });
    
    const res = await fetch('/api/resume/harvard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills, selectedProjects, selectedExperiences, enhance, qa: [...stylingMessages, ...contentMessages], stylePreferences })
    });
    
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.error('PDF generation failed:', d);
      setError(d.error || 'Failed to generate PDF');
      setLoading(false);
      return;
    }
    
    try {
      const blob = await res.blob();
      if (blob.size === 0) {
        console.error('PDF blob is empty');
        setError('Generated PDF is empty. Please check your selections and try again.');
        setLoading(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setLoading(false);
    } catch (error) {
      console.error('Error processing PDF response:', error);
      setError('Error processing generated PDF');
      setLoading(false);
    }
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
              <p className="text-xs text-muted-foreground mt-2">Tips: Don&apos;t overcrowd this section. Keep it concise and relevant.</p>
            </div>

            <div className="bg-card border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Projects</h2>
                <span className={`text-sm ${limitReached ? 'text-destructive' : 'text-muted-foreground'}`}>{totalSelected}/7 selected</span>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto pr-2">
                {profile.projects?.map((p, i) => (
                  <label key={i} className={`flex items-start space-x-3 p-2 rounded cursor-pointer transition-all duration-200 ${
                    selectedProjects.includes(i) 
                      ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700' 
                      : 'hover:bg-accent'
                  }`}>
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
                <span className={`text-sm ${limitReached ? 'text-destructive' : 'text-muted-foreground'}`}>{totalSelected}/7 selected</span>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto pr-2">
                {profile.experiences?.map((ex, i) => (
                  <label key={i} className={`flex items-start space-x-3 p-2 rounded cursor-pointer transition-all duration-200 ${
                    selectedExperiences.includes(i) 
                      ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700' 
                      : 'hover:bg-accent'
                  }`}>
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
                <div className="mt-2 text-xs text-destructive">You can include at most 7 items. Please deselect some.</div>
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
                <button onClick={reset} className="px-4 py-2 border rounded bg-purple-500 text-white hover:bg-purple-900">Retry</button>
                <a href={pdfUrl} download="resume.pdf" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">Download PDF</a>
              </div>
            )}
            
            <div className="flex items-center gap-2 mt-4">
              <input id="enhance" type="checkbox" className="w-4 h-4" checked={enhance} onChange={e=>setEnhance(e.target.checked)} />
              <label htmlFor="enhance" className="text-sm dark:text-gray-100 text-foreground">Enhance with AI</label>
            </div>
            {enhance && (
              <div className="mt-3 border rounded-lg p-3">
                <div className="text-sm dark:text-white text-foreground font-medium mb-2">AI Coaching</div>
                
                {/* Initial Selection */}
                {!currentAgent && (
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox" 
                        id="styling" 
                        checked={stylingCustomization} 
                        onChange={e => setStylingCustomization(e.target.checked)} 
                        className="w-4 h-4"
                      />
                      <label htmlFor="styling" className="text-sm dark:text-gray-100 text-foreground">Customize styling preferences</label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox" 
                        id="content" 
                        checked={contentCustomization} 
                        onChange={e => setContentCustomization(e.target.checked)} 
                        className="w-4 h-4"
                      />
                      <label htmlFor="content" className="text-sm dark:text-gray-100 text-foreground">Enhance your content</label>
                    </div>
                    <button
                      onClick={() => {
                        if (stylingCustomization) {
                          setCurrentAgent('styling');
                          startStylingQuestions();
                        } else if (contentCustomization) {
                          setCurrentAgent('content');
                          startContentQuestions();
                        }
                      }}
                      disabled={!stylingCustomization && !contentCustomization}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
                    >
                      Start Questions
                    </button>
                  </div>
                )}

                {/* Question Interface */}
                {currentAgent && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-green-400">
                        {currentAgent === 'styling' ? '🎨 Styling Questions' : '📝 Content Questions'}
                      </div>
                      {contentCustomization && stylingCustomization && currentAgent === 'styling' && (
                        <div className="text-xs text-gray-300">
                          Next: Content Questions
                        </div>
                      )}
                    </div>
                    
                    {/* Display current question */}
                    {currentAgent === 'styling' && (
                      <div className="mb-4">
                        {stylingMessages.length === 0 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground">
                            Question 1: What's your preferred font size - Reccomended: small (10pt) for content, or large (12pt) for readability. Also, do you want any text to be bold or italic for emphasis?
                          </div>
                        )}
                        {stylingMessages.length === 1 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground">
                            Question 2: Do you prefer a traditional professional style or a more modern creative layout?
                          </div>
                        )}
                        {stylingMessages.length === 2 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground">
                            Question 3: Any specific color preferences or section emphasis you'd like to highlight?
                          </div>
                        )}
                        {stylingMessages.length >= 3 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-green-600">
                            ✅ All styling questions answered! Processing preferences...
                          </div>
                        )}
                      </div>
                    )}
                    
                    {currentAgent === 'content' && (
                      <div className="mb-4">
                        {contentMessages.length === 0 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground">
                            Question 1: How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded with more context and achievements)?
                          </div>
                        )}
                        {contentMessages.length === 1 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground">
                            Question 2: For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8 developers', 'Reduced costs by $50K'). If you don't want to enhance any, reply 'None'.
                          </div>
                        )}
                        {contentMessages.length >= 2 && (
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-green-600">
                            ✅ All content questions answered! Processing preferences...
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Display conversation history */}
                    <div className="max-h-48 overflow-auto space-y-2 bg-background/50 dark:bg-black p-2 rounded mb-3">
                      {(currentAgent === 'styling' ? stylingMessages : contentMessages).length === 0 && (
                        <div className="text-xs dark:text-gray-100 text-muted-foreground">
                          {currentAgent === 'styling' 
                            ? 'Answer the styling questions above to customize your resume appearance.' 
                            : 'Answer the content questions above to enhance your resume content.'}
                        </div>
                      )}
                      {(currentAgent === 'styling' ? stylingMessages : contentMessages).map((m, idx) => (
                        <div key={idx} className={`${m.role==='assistant'?'text-foreground':'text-foreground'} dark:text-gray-100 text-sm`}>
                          <span className="font-semibold mr-1">{m.role==='assistant'?'System:':'You:'}</span>
                          <span>{m.content}</span>
                        </div>
                      ))}

                    </div>
                    
                    {/* Answer input */}
                    {(currentAgent === 'styling' ? stylingMessages.length < 3 : contentMessages.length < 2) && (
                      <div className="mt-2 flex gap-2">
                        <textarea 
                          value={coachInput} 
                          onChange={e=>setCoachInput(e.target.value)} 
                          onKeyDown={e=>{
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleQuestionSubmit();
                            }
                          }}
                          className="flex-1 border rounded px-2 py-1 bg-background resize-none" 
                          placeholder="Type your answer... (Enter to send, Shift+Enter for new line)" 
                          rows={2}
                      />
                        <button
                          onClick={handleQuestionSubmit}
                          className="px-3 py-1 bg-secondary rounded text-sm"
                        >
                          Submit
                        </button>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs dark:text-gray-100 text-muted-foreground">
                        {currentAgent === 'styling' 
                          ? 'Answer all 3 styling questions to customize your resume appearance.'
                          : 'Answer all 2 content questions to enhance your resume content.'}
                      </p>
                      <button
                        onClick={() => {
                          setCurrentAgent(null);
                          setStylingCustomization(false);
                          setContentCustomization(false);
                          setStylingMessages([]);
                          setContentMessages([]);
                        }}
                        className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Reset
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


