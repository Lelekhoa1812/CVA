"use client";
import { useEffect, useState } from 'react';

type Project = { name: string; summary?: string };
type Experience = { companyName: string; role: string; summary?: string };
type Profile = { name: string; major: string; school: string; studyPeriod?: string; email: string; workEmail?: string; phone: string; website?: string; linkedin?: string; projects: Project[]; experiences: Experience[]; languages?: string };

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
  const [contentSelectedItems, setContentSelectedItems] = useState<Array<{ type: 'project' | 'experience', index: number, name: string }>>([]);
  const [currentContentItem, setCurrentContentItem] = useState<number>(0);
  const [contentEnhancementData, setContentEnhancementData] = useState<Record<string, string>>({});
  const [contentEnhancementStarted, setContentEnhancementStarted] = useState<boolean>(false);
  type FontSize = '8pt' | '10pt' | '11pt' | '12pt' | '14pt';
  
  // Debug agent changes
  useEffect(() => {
    console.log('Agent changed to:', currentAgent);
    if (currentAgent === 'content') {
      console.log('Content agent activated - checking state:', { contentEnhancementStarted, contentSelectedItems: contentSelectedItems.length });
    }
  }, [currentAgent, contentEnhancementStarted, contentSelectedItems.length]);
  
  // Debug content items selection changes
  useEffect(() => {
    console.log('Content selected items changed:', contentSelectedItems);
  }, [contentSelectedItems]);
  
  // Debug content enhancement state changes
  useEffect(() => {
    console.log('Content enhancement started changed to:', contentEnhancementStarted);
  }, [contentEnhancementStarted]);
  const [stylePreferences, setStylePreferences] = useState<{
    fontSize?: string;
    useBold?: boolean;
    useItalic?: boolean;
    boldSections?: string[];
    italicSections?: string[];
    contentDensity?: string;
    additionalNotes?: string;
    accentColor?: 'black' | 'dark-blue' | 'dark-gray';
  } | null>(null);

  // Local UI state for styling controls
  const [uiFontSize, setUiFontSize] = useState<FontSize>('11pt');
  const [uiUseBold, setUiUseBold] = useState<boolean>(false);
  const [uiUseItalic, setUiUseItalic] = useState<boolean>(false);
  const [uiAccentColor, setUiAccentColor] = useState<'black' | 'dark-blue' | 'dark-gray'>('black');
  const [selectedStyle, setSelectedStyle] = useState<'style1' | 'style2' | 'style3'>('style1');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState<boolean>(false);
  const [modalSelectedStyle, setModalSelectedStyle] = useState<'style1' | 'style2' | 'style3' | null>(null);



  // Function to start styling questions
  function startStylingQuestions() {
    // Switch to styling agent and show UI controls
    setStylingMessages([]);
  }

  // Function to start content questions
  function startContentQuestions() {
    // Reset content enhancement state to show item selection first
    setContentEnhancementStarted(false);
    setContentSelectedItems([]);
    setCurrentContentItem(0);
    setContentMessages([]);
    console.log('Content questions started - reset to item selection mode');
  }

    // Function to handle question submission
  async function handleQuestionSubmit() {
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
            startContentQuestions(); // This will reset to item selection mode
          }, 1500); // Wait 1.5 seconds before transitioning
        }
      }
    } else if (currentAgent === 'content') {
      setContentMessages(newMessages);
      
      // Process content enhancement when both questions are answered for current item
      if (newMessages.length >= 2) {
        try {
          // Get current item details
          const currentItem = contentSelectedItems[currentContentItem];
          if (!currentItem) return;
          
          // Get the original content
          let originalContent = '';
          let itemName = '';
          
          if (currentItem.type === 'project') {
            const p = profile?.projects?.[currentItem.index];
            if (p) {
              originalContent = (p as { description?: string; summary?: string }).description || p.summary || '';
              itemName = p.name || 'Untitled Project';
            }
          } else {
            const ex = profile?.experiences?.[currentItem.index];
            if (ex) {
              originalContent = (ex as { description?: string; summary?: string }).description || ex.summary || '';
              itemName = `${ex.companyName || 'Company'} - ${ex.role || 'Role'}`;
            }
          }
          
          if (!originalContent) {
            setContentMessages(m => [...m, { role: 'assistant', content: '⚠️ No content found for this item. Moving to next item...' }]);
            moveToNextContentItem();
            return;
          }
          
          // Show processing message
          setContentMessages(m => [...m, { role: 'assistant', content: 'Processing your enhancement request...' }]);
          
          // Send to LLM for enhancement
          const enhancementResponse = await fetch('/api/resume/enhance-targeted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemType: currentItem.type,
              itemName,
              originalContent,
              userPreferences: {
                format: newMessages[0].content, // First answer: concise/preserve/enhance
                modifications: newMessages[1].content // Second answer: specific aspects
              }
            })
          });
          
          if (enhancementResponse.ok) {
            const enhancementData = await enhancementResponse.json();
            
            // Optionally beautify with bold/italic touches if enabled in styling preferences
            let finalEnhancedContent: string = enhancementData.enhancedContent;
            const wantsEmphasis = !!(stylePreferences?.useBold || stylePreferences?.useItalic);
            if (wantsEmphasis) {
              try {
                const beautifyRes = await fetch('/api/resume/beautify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: enhancementData.enhancedContent,
                    contentType: currentItem.type,
                    stylePreferences
                  })
                });
                if (beautifyRes.ok) {
                  const beautified = await beautifyRes.json();
                  if (beautified?.formattedContent) {
                    finalEnhancedContent = beautified.formattedContent;
                  }
                }
              } catch (e) {
                console.warn('Beautify step failed, using raw enhanced content');
              }
            }

            // Store enhanced (and possibly beautified) content
            const key = `${currentItem.type}-${currentItem.index}`;
            setContentEnhancementData(prev => ({
              ...prev,
              [key]: finalEnhancedContent
            }));
            
            // Remove processing message and show success
            setContentMessages(m => m.filter(msg => !msg.content.includes('Processing')));
                                          setContentMessages(m => [...m, { role: 'assistant', content: `✅ Enhanced content for &quot;${itemName}&quot;!` }]);
            
            // Move to next item or complete
            setTimeout(() => {
              moveToNextContentItem();
            }, 1000);
          } else {
            throw new Error('Failed to enhance content');
          }
        } catch (error) {
          console.error('Content enhancement failed:', error);
          setContentMessages(m => m.filter(msg => !msg.content.includes('Processing')));
          setContentMessages(m => [...m, { role: 'assistant', content: '⚠️ Enhancement failed. Moving to next item...' }]);
          setTimeout(() => {
            moveToNextContentItem();
          }, 1000);
        }
      }
    }
    
    setCoachInput('');
  }

  // Function to move to next content item
  function moveToNextContentItem() {
    if (currentContentItem + 1 < contentSelectedItems.length) {
      setCurrentContentItem(currentContentItem + 1);
      setContentMessages([]);
    } else {
      // All items completed
      setCurrentContentItem(contentSelectedItems.length);
      setContentMessages([]);
    }
  }

  // Function to check if coaching is in progress
  function isCoachingInProgress() {
    // Check if any agent is active
    if (!currentAgent) return false;
    
    if (currentAgent === 'styling') {
      // Styling is in progress if preferences not set yet
      return stylingCustomization && !stylePreferences;
    } else if (currentAgent === 'content') {
      // Content is in progress if items are selected, enhancement has started, but not all completed
      if (contentSelectedItems.length === 0 || !contentEnhancementStarted) {
        console.log('Content coaching not in progress:', { contentSelectedItems: contentSelectedItems.length, contentEnhancementStarted });
        return false;
      }
      const inProgress = currentContentItem < contentSelectedItems.length;
      console.log('Content coaching in progress:', { currentContentItem, totalItems: contentSelectedItems.length, inProgress });
      return inProgress;
    }
    
    return false;
  }

  // Function to check if ALL coaching is complete (both agents if enabled)
  function isAllCoachingComplete() {
    // If no coaching is enabled, return true
    if (!stylingCustomization && !contentCustomization) return true;
    
    // Check styling agent
    if (stylingCustomization) {
      if (!stylePreferences) return false;
    }
    
    // Check content agent
    if (contentCustomization) {
      if (currentAgent === 'content') {
        // Content is complete if enhancement has started and all items are processed
        if (contentSelectedItems.length === 0 || !contentEnhancementStarted) return false;
        return currentContentItem >= contentSelectedItems.length;
      }
      // If content is not the current agent but was enabled, check if it's complete
      if (contentSelectedItems.length === 0 || !contentEnhancementStarted) return false;
      if (currentContentItem < contentSelectedItems.length) return false;
    }
    
    return true;
  }



  // Function to manually parse styling preferences
  function parseStylingPreferences(messages: Array<{ role: string; content: string }>) {
    const userAnswers = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
    
    let fontSize = '11pt';
    let useBold = false;
    let useItalic = false;
    const contentDensity = 'balanced';
    
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
      stylePreferences,
      contentEnhancementData
    });
    
    const res = await fetch(`/api/resume/${selectedStyle}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        skills, 
        selectedProjects, 
        selectedExperiences, 
        enhance, 
        qa: [...stylingMessages, ...contentMessages], 
        stylePreferences,
        contentEnhancementData
      })
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

  if (!profile) return (
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
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold dark:text-white text-foreground">Resume</h1>
        </div>

        {isStyleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border rounded-xl w-full max-w-5xl p-4 relative shadow-2xl">
              <button
                aria-label="Close"
                onClick={() => { setIsStyleModalOpen(false); setModalSelectedStyle(null); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-gray-100 flex items-center justify-center hover:bg-red-700 hover:text-white"
              >
                ×
              </button>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-foreground dark:text-black">Choose a Resume Style</h2>
                <p className="text-sm text-muted-foreground dark:text-gray-800">Preview all three styles and select your preferred layout.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  className={`border rounded-lg overflow-hidden hover:ring-2 ${modalSelectedStyle==='style1' ? 'ring-2 ring-primary' : 'ring-0'}`}
                  onClick={() => setModalSelectedStyle('style1')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Style 1 - Harvard</span>
                    {modalSelectedStyle==='style1' && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Selected</span>}
                  </div>
                  <div className="relative w-full h-[500px] bg-white border border-gray-200 rounded overflow-hidden">
                    <iframe 
                      src="/style1.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.8" 
                      className="w-full h-full border-0"
                      title="Style 1 Preview"
                      onError={(e) => console.error('Style 1 PDF failed to load:', e)}
                      style={{ 
                        width: '100%',
                        height: '100%'
                      }}
                    />
                  </div>
                </div>
                <div
                  className={`border rounded-lg overflow-hidden hover:ring-2 ${modalSelectedStyle==='style2' ? 'ring-2 ring-primary' : 'ring-0'}`}
                  onClick={() => setModalSelectedStyle('style2')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Style 2 - Chronological</span>
                    {modalSelectedStyle==='style2' && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Selected</span>}
                  </div>
                  <div className="relative w-full h-[500px] bg-white border border-gray-200 rounded overflow-hidden">
                    <iframe 
                      src="/style2.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.8" 
                      className="w-full h-full border-0"
                      title="Style 2 Preview"
                      onError={(e) => console.error('Style 2 PDF failed to load:', e)}
                      style={{ 
                        width: '100%',
                        height: '100%'
                      }}
                    />
                  </div>
                </div>
                <div
                  className={`border rounded-lg overflow-hidden hover:ring-2 ${modalSelectedStyle==='style3' ? 'ring-2 ring-primary' : 'ring-0'}`}
                  onClick={() => setModalSelectedStyle('style3')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Style 3 - Modernised</span>
                    {modalSelectedStyle==='style3' && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Selected</span>}
                  </div>
                  <div className="relative w-full h-[500px] bg-white border border-gray-200 rounded overflow-hidden">
                    <iframe 
                      src="/style3.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.8" 
                      className="w-full h-full border-0"
                      title="Style 3 Preview"
                      onError={(e) => console.error('Style 3 PDF failed to load:', e)}
                      style={{ 
                        width: '100%',
                        height: '100%'
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => { setIsStyleModalOpen(false); setModalSelectedStyle(null); }}
                  className="px-4 py-2 border rounded bg-muted text-foreground hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  disabled={!modalSelectedStyle}
                  onClick={async () => {
                    if (!modalSelectedStyle) return;
                    setLoading(true);
                    setError(null);
                    setPdfUrl(null);
                    const chosenStyle = modalSelectedStyle; // Store the selected style
                    setSelectedStyle(chosenStyle);
                    setIsStyleModalOpen(false);
                    setModalSelectedStyle(null);
                    // Use the stored value directly instead of relying on state update
                    const res = await fetch(`/api/resume/${chosenStyle}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        skills, 
                        selectedProjects, 
                        selectedExperiences, 
                        enhance, 
                        qa: [...stylingMessages, ...contentMessages], 
                        stylePreferences,
                        contentEnhancementData
                      })
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
                  }}
                  className={`px-4 py-2 rounded ${!modalSelectedStyle ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        )}

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

            {/* Coaching Status Indicator */}
            {!isAllCoachingComplete() && (
              <div className="mb-3 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-yellow-800 font-medium">
                    AI Coaching in Progress
                  </span>
                </div>
                <p className="text-xs text-yellow-700 mt-1">
                  Please complete your coaching session or click Reset to cancel
                </p>
              </div>
            )}

            <button
              onClick={!isAllCoachingComplete() ? () => alert('Please complete your AI coaching session first, or click Reset to cancel') : () => setIsStyleModalOpen(true)}
              disabled={loading || limitReached || !isAllCoachingComplete()}
              className={`w-full rounded px-4 py-3 transition-all duration-200 ${
                !isAllCoachingComplete() 
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              } ${loading ? 'opacity-75' : ''}`}
              title={!isAllCoachingComplete() ? 'Please complete your AI coaching session first, or click Reset to cancel' : ''}
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
                            console.log('Starting styling agent');
                            setCurrentAgent('styling');
                            startStylingQuestions();
                          } else if (contentCustomization) {
                            console.log('Starting content agent');
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
                    
                    {/* Progress Indicator */}
                    <div className="mb-3 p-2 bg-gray-700 rounded text-xs text-gray-300">
                      {currentAgent === 'styling' ? (
                        <div className="flex items-center justify-between">
                          <span>Styling Progress:</span>
                          <span>{stylePreferences ? 2 : 0}/2 tasks completed</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span>Content Progress:</span>
                          <span>
                            {contentSelectedItems.length === 0 
                              ? 'Select items to enhance' 
                              : !contentEnhancementStarted 
                                ? `${contentSelectedItems.length} item(s) selected - Click Start to begin`
                                : `${currentContentItem + 1}/${contentSelectedItems.length} items enhanced`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Display current question */}
                    {currentAgent === 'styling' && (
                      <div className="mb-4 space-y-3">
                        <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground p-3 rounded">
                          Styling Preferences
                          </div>

                        {/* Font size dropdown */}
                        <div className="flex items-center gap-3">
                          <label className="text-sm dark:text-gray-100 text-foreground w-40">Font size</label>
                          <select
                            className="border rounded px-2 py-1 bg-background text-foreground"
                            value={uiFontSize}
                            onChange={e => setUiFontSize(e.target.value as FontSize)}
                          >
                            <option value="8pt">extra-small (8pt)</option>
                            <option value="10pt">small (10pt)</option>
                            <option value="12pt">large (12pt)</option>
                            <option value="14pt">extra-large (14pt)</option>
                          </select>
                          </div>

                        {/* Bold/Italic checkboxes */}
                        <div className="flex items-center gap-6">
                          <label className="text-sm dark:text-gray-100 text-foreground w-40">Emphasis</label>
                          <label className="flex items-center gap-2 text-sm text-foreground dark:text-white">
                            <input type="checkbox" className="w-4 h-4" checked={uiUseBold} onChange={e=>setUiUseBold(e.target.checked)} /> Bold
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground dark:text-white">
                            <input type="checkbox" className="w-4 h-4" checked={uiUseItalic} onChange={e=>setUiUseItalic(e.target.checked)} /> Italic
                          </label>
                          </div>

                        {/* Accent color selection */}
                        <div className="flex items-center gap-6">
                          <label className="text-sm dark:text-gray-100 text-foreground w-40">Accent color</label>
                          <div className="flex items-center gap-4 text-sm text-foreground dark:text-white">
                            <label className="flex items-center gap-2">
                              <input type="radio" name="accent" className="w-4 h-4" checked={uiAccentColor==='black'} onChange={()=>setUiAccentColor('black')} /> Default (black)
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="radio" name="accent" className="w-4 h-4" checked={uiAccentColor==='dark-blue'} onChange={()=>setUiAccentColor('dark-blue')} /> Dark blue
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="radio" name="accent" className="w-4 h-4" checked={uiAccentColor==='dark-gray'} onChange={()=>setUiAccentColor('dark-gray')} /> Dark gray
                            </label>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
                            onClick={() => {
                              setStylePreferences({
                                fontSize: uiFontSize,
                                useBold: uiUseBold,
                                useItalic: uiUseItalic,
                                boldSections: [],
                                italicSections: [],
                                contentDensity: 'balanced',
                                additionalNotes: 'Set via UI',
                                accentColor: uiAccentColor
                              });
                              if (contentCustomization) {
                                setTimeout(() => {
                                  setCurrentAgent('content');
                                  startContentQuestions();
                                }, 500);
                              }
                            }}
                          >
                            Save Preferences
                          </button>
                        </div>

                        {/* Completion banners */}
                        {stylePreferences && !contentCustomization && (
                          <div className="text-sm font-medium mt-3 bg-green-600 text-white p-3 rounded">
                            🎉 All stylings enhancements complete!
                            <div className="mt-2 text-sm">
                              ✅ You can now click the &quot;Generate PDF&quot; button to create your customized resume with enhanced stylings.
                            </div>
                          </div>
                        )}
                        {stylePreferences && contentCustomization && (
                          <div className="text-sm font-medium mt-3 bg-gray-700 text-gray-100 p-3 rounded">
                            Styling preferences set successfully! ✅
                          </div>
                        )}
                      </div>
                    )}
                    
                                        {currentAgent === 'content' && (
                      <div className="mb-4">
                        {/* Content Item Selection - Always show this first */}
                        <div className="space-y-3">
                          <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground p-3 rounded">
                            Select up to 3 projects or experiences to enhance (maximum 3):
                          </div>
                          
                          {/* Projects */}
                          {profile.projects && selectedProjects.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-300">Projects:</div>
                              {selectedProjects.map((idx) => {
                                const p = profile.projects[idx];
                                if (!p) return null;
                                const itemKey = `project-${idx}`;
                                const isSelected = contentSelectedItems.some(item => item.type === 'project' && item.index === idx);
                                
                                return (
                                  <label key={itemKey} className="flex items-center space-x-3 p-2 rounded cursor-pointer hover:bg-gray-700/50">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          if (contentSelectedItems.length < 3) {
                                            console.log('Project checkbox checked - adding to selection');
                                            setContentSelectedItems(prev => [...prev, { type: 'project', index: idx, name: p.name || 'Untitled Project' }]);
                                            console.log('Project selected, contentEnhancementStarted should remain false:', !contentEnhancementStarted);
                                          }
                                        } else {
                                          console.log('Project checkbox unchecked - removing from selection');
                                          setContentSelectedItems(prev => prev.filter(item => !(item.type === 'project' && item.index === idx)));
                                        }
                                      }}
                                      disabled={!isSelected && contentSelectedItems.length >= 3}
                                      className="w-4 h-4"
                                    />
                                    <div className="text-sm text-gray-100">
                                      <div className="font-medium">{p.name || 'Untitled Project'}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* Experiences */}
                          {profile.experiences && selectedExperiences.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-300">Experiences:</div>
                              {selectedExperiences.map((idx) => {
                                const ex = profile.experiences[idx];
                                if (!ex) return null;
                                const itemKey = `experience-${idx}`;
                                const isSelected = contentSelectedItems.some(item => item.type === 'experience' && item.index === idx);
                                
                                return (
                                  <label key={itemKey} className="flex items-center space-x-3 p-2 rounded cursor-pointer hover:bg-gray-700/50">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          if (contentSelectedItems.length < 3) {
                                            console.log('Experience checkbox checked - adding to selection');
                                            const experienceName = `${ex.companyName || 'Company'} - ${ex.role || 'Role'}`;
                                            setContentSelectedItems(prev => [...prev, { type: 'experience', index: idx, name: experienceName }]);
                                            console.log('Experience selected, contentEnhancementStarted should remain false:', !contentEnhancementStarted);
                                          }
                                        } else {
                                          console.log('Experience checkbox unchecked - removing from selection');
                                          setContentSelectedItems(prev => prev.filter(item => !(item.type === 'experience' && item.index === idx)));
                                        }
                                      }}
                                      disabled={!isSelected && contentSelectedItems.length >= 3}
                                      className="w-4 h-4"
                                    />
                                    <div className="text-sm text-gray-100">
                                      <div className="font-medium">{ex.companyName || 'Company'} - {ex.role || 'Role'}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* Start Button - Show when items are selected */}
                          {contentSelectedItems.length > 0 && (
                            <button
                              onClick={() => {
                                console.log('Start Button clicked, setting contentEnhancementStarted to true');
                                setContentEnhancementStarted(true);
                                setCurrentContentItem(0);
                                setContentMessages([]);
                              }}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Start Enhancing {contentSelectedItems.length} Item{contentSelectedItems.length > 1 ? 's' : ''}
                            </button>
                          )}
                          
                          {/* Status Message */}
                          {contentSelectedItems.length === 0 && (
                            <div className="text-sm text-gray-400 text-center py-2">
                              Select projects or experiences above to begin enhancement
                            </div>
                          )}
                        </div>
                        
                        {/* Content Enhancement Questions - Only show after Start Button is clicked */}
                        {contentEnhancementStarted && contentSelectedItems.length > 0 && currentContentItem < contentSelectedItems.length && (
                          <div className="space-y-3 mt-4">
                            <div className="text-sm font-medium mb-2 bg-gray-700 text-gray-100 text-foreground p-3 rounded">
                              Enhancing: {contentSelectedItems[currentContentItem].name}
                            </div>
                            
                            {contentMessages.length === 0 && (
                              <div className="text-sm font-medium mb-2 bg-gray-600 text-gray-100 p-3 rounded">
                                Question 1: How would you like this content formatted? Choose: &apos;concise&apos; (shorter, focused bullets), &apos;preserve&apos; (keep current length), or &apos;enhance&apos; (expand with more context and achievements)?
                              </div>
                            )}
                            
                            {contentMessages.length === 1 && (
                              <div className="text-sm font-medium mb-2 bg-gray-600 text-gray-100 p-3 rounded">
                                Question 2: What specific aspects would you like to emphasize or modify? (e.g., &quot;Focus on technical skills&quot;, &quot;Highlight leadership&quot;, &quot;Add metrics&quot;, &quot;Make it more ATS-friendly&quot;)
                              </div>
                            )}
                            
                            {contentMessages.length >= 2 && (
                              <div className="text-sm font-medium mb-2 bg-green-600 text-white p-3 rounded">
                                ✅ Content enhancement complete! {currentContentItem + 1 < contentSelectedItems.length ? 'Moving to next item...' : 'All items enhanced!'}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* All Items Complete */}
                        {contentEnhancementStarted && contentSelectedItems.length > 0 && currentContentItem >= contentSelectedItems.length && (
                          <div className="text-sm font-medium mb-2 bg-green-600 text-white p-3 rounded">
                            🎉 All content enhancements complete! 
                            <div className="mt-2 text-sm">
                              ✅ You can now click the &quot;Generate PDF&quot; button to create your customized resume with enhanced content.
                            </div>
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
                            : currentAgent === 'content' && !contentEnhancementStarted
                              ? 'Select items to enhance and click Start to begin the enhancement process.'
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
                    {(currentAgent === 'styling' ? false : (currentAgent === 'content' && contentEnhancementStarted && contentMessages.length < 2)) && (
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
                          setContentSelectedItems([]);
                          setCurrentContentItem(0);
                          setContentEnhancementData({});
                          setContentEnhancementStarted(false);
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


