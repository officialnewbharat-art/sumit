import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { AppStep, CandidateInfo, InterviewResult } from './types';
import { CandidateForm } from './components/CandidateForm';
import { Instructions } from './components/Instructions';
import { InterviewSession } from './components/InterviewSession';
import { ResultScreen } from './components/ResultScreen';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.FORM);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [result, setResult] = useState<InterviewResult | null>(null);

  // --- 1. AUTOMATIC LOGIN & URL CLEANING LOGIC (UPDATED) ---
  useEffect(() => {
    // सबसे पहले चेक करो कि बंदा Forward/Back बटन से तो नहीं आया?
    const navEntry = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (navEntry && navEntry.type === 'back_forward') {
       // अगर Forward बटन दबा के आया है, तो वापस होम पेज भेज दो
       window.location.replace("https://internadda.com/");
       return; 
    }

    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get('name');
    const roleParam = params.get('role');

    if (nameParam && roleParam) {
      console.log("Auto-login detected:", nameParam, roleParam);
      
      setCandidate({
        name: nameParam,
        field: roleParam,
        jobDescription: `Technical interview for the role of ${roleParam}. Assess core competencies, problem solving skills and technical knowledge relevant to ${roleParam}.`,
        language: "English"
      });

      setStep(AppStep.INSTRUCTIONS);

      // --- CHANGE HERE: URL SAAF KARO (Clean the URL) ---
      // इससे क्या होगा कि URL बार से ?name=... हट जाएगा।
      // तो अगर वो फॉरवर्ड भी करेगा तो ये दोबारा नहीं चलेगा।
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // --- 2. STRICT BACK BUTTON PROTECTION (UPDATED) ---
  useEffect(() => {
    // पेज लोड होते ही करंट स्टेट को हिस्ट्री में push करें
    window.history.pushState(null, "", window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // जैसे ही यूजर Back बटन दबाएगा...
      // हम उसे इंटरनेट अड्डा के होम पेज पर भेज देंगे
      window.location.replace("https://internadda.com/"); 
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  // --- END PROTECTION ---

  const handleFormSubmit = (info: CandidateInfo) => {
    setCandidate(info);
    setStep(AppStep.INSTRUCTIONS);
  };

  const startInterview = () => {
    setStep(AppStep.INTERVIEW);
  };

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    
    if (terminationReason && terminationReason !== "Completed" && terminationReason !== "User Requested End") {
        setTimeout(() => {
            setResult({
                rating: 0,
                feedback: "Interview terminated early.",
                passed: false,
                questions: [],
                terminationReason: terminationReason
            });
            setStep(AppStep.RESULT);
        }, 1500);
        return;
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.REACT_APP_GEMINI_API_KEY || '' });
      // Note: Make sure usage of process.env is correct for your build tool (Vite uses import.meta.env)
      
      const prompt = `
        Evaluate this job interview transcript.
        
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Job Description: ${candidate?.jobDescription}
        Interview Language: ${candidate?.language}
        
        TRANSCRIPT:
        ${transcript}
        
        Task:
        1. Analyze the technical accuracy of the candidate's answers.
        2. **IMPORTANT**: Pay attention to how the Interviewer reacted in the transcript. 
           - If the Interviewer corrected the candidate, that is a negative signal.
           - If the Interviewer gave specific praise, that is a positive signal.
           - Ensure your final rating is CONSISTENT with the Interviewer's verbal feedback in the transcript.
        3. Rate the candidate from 1 to 10 (integer) overall.
        4. Provide concise overall feedback (max 3 sentences) focusing on strengths and weaknesses.
        5. Identify each distinct technical question asked (Expect 5 questions). For each question:
           - State the question text.
           - Summarize the candidate's answer.
           - Rate the specific answer (1-10).
           - Provide specific feedback on accuracy and completeness.
        6. A score of 6 or less is a fail.
        
        Output pure JSON.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rating: { type: Type.INTEGER },
              feedback: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    candidateAnswerSummary: { type: Type.STRING },
                    rating: { type: Type.INTEGER },
                    feedback: { type: Type.STRING }
                  },
                  required: ['question', 'candidateAnswerSummary', 'rating', 'feedback']
                }
              }
            },
            required: ['rating', 'feedback', 'questions']
          }
        }
      });

      const jsonText = response.text || '{}';
      const data = JSON.parse(jsonText);
      
      const rating = data.rating || 0;
      const passed = rating > 6;

      setResult({
        rating,
        feedback: data.feedback || "No feedback provided.",
        passed,
        questions: data.questions || []
      });

      setStep(AppStep.RESULT);

    } catch (error) {
      console.error("Evaluation failed", error);
      setResult({
        rating: 0,
        feedback: "An error occurred during evaluation. Please try again.",
        passed: false,
        questions: []
      });
      setStep(AppStep.RESULT);
    }
  };

  const resetApp = () => {
    setCandidate(null);
    setResult(null);
    setStep(AppStep.FORM);
  };

  const steps = [
    { id: AppStep.FORM, label: 'Profile' },
    { id: AppStep.INSTRUCTIONS, label: 'Check' },
    { id: AppStep.INTERVIEW, label: 'Live' },
    { id: AppStep.EVALUATING, label: 'Review' },
    { id: AppStep.RESULT, label: 'Result' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);
  const showHeader = step !== AppStep.INTERVIEW;
  const isLightBackground = step === AppStep.RESULT;

  return (
    <div className="h-[100dvh] w-screen overflow-hidden font-sans text-slate-900 bg-slate-50 flex flex-col relative">
      
      {/* Header */}
      {showHeader && (
        <header className="absolute top-0 left-0 w-full z-50 px-4 py-3 md:px-6 md:py-4 pointer-events-none">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
               <div className="bg-indigo-600 text-white p-1.5 md:p-2 rounded-lg shadow-lg shadow-indigo-600/20 rotate-45 transform hover:rotate-12 transition-transform duration-500">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5 -rotate-45">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5L8.25 15.75" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12c0-4.142 3.358-7.5 7.5-7.5" />
                 </svg>
               </div>
               <h1 className={`text-lg md:text-xl font-bold tracking-tight ${isLightBackground ? 'text-slate-900' : 'text-white'}`}>
                 Interna<span className={isLightBackground ? 'text-indigo-600' : 'text-indigo-400'}>.ai</span>
               </h1>
            </div>

            {/* Stepper (Hidden on Mobile) */}
            <div className="hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm pointer-events-auto">
              {steps.map((s, idx) => {
                const isActive = idx === currentStepIndex;
                const isCompleted = idx < currentStepIndex;
                return (
                  <div key={s.id} className="flex items-center">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all ${
                      isActive ? 'bg-slate-900 text-white' : 
                      isCompleted ? 'text-emerald-600' : 'text-slate-400'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : isCompleted ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        <span className="text-xs font-bold uppercase tracking-wide">{s.label}</span>
                    </div>
                    {idx < steps.length - 1 && (
                        <div className="w-4 h-px bg-slate-200 mx-1"></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && (
            <CandidateForm onSubmit={handleFormSubmit} />
          )}

          {step === AppStep.INSTRUCTIONS && (
            <Instructions onStart={startInterview} />
          )}

          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession 
              candidate={candidate} 
              onComplete={handleInterviewComplete} 
            />
          )}

          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 relative overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
                    <div className="absolute top-0 -right-4 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
                    <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
                </div>
                
                <div className="relative z-10 text-center px-6">
                   <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-8 relative">
                      <div className="absolute inset-0 border-t-4 border-indigo-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-2 border-t-4 border-purple-500 rounded-full animate-spin animation-delay-2000"></div>
                   </div>
                   <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">Interna is Analyzing</h2>
                   <p className="text-indigo-200 text-base md:text-lg max-w-md mx-auto">
                     Comparing transcript against {candidate?.field} competency models...
                   </p>
                </div>
             </div>
          )}

          {step === AppStep.RESULT && result && candidate && (
            <ResultScreen 
              result={result} 
              candidateName={candidate.name} 
              onReset={resetApp} 
            />
          )}
      </main>
    </div>
  );
};

export default App;
