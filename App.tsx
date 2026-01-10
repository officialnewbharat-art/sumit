import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AppStep, CandidateInfo } from './types';
import { CandidateForm } from './components/CandidateForm';
import { Instructions } from './components/Instructions';
import { InterviewSession } from './components/InterviewSession';
import { ResultScreen } from './components/ResultScreen';

const App: React.FC = () => {
  // Extract data from URL immediately
  const [candidate, setCandidate] = useState<CandidateInfo | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get('name');
    const roleParam = params.get('role');
    
    if (nameParam && roleParam) {
      return {
        name: decodeURIComponent(nameParam),
        field: decodeURIComponent(roleParam),
        jobDescription: `Professional interview for ${roleParam} position.`,
        language: 'English'
      };
    }
    return null;
  });

  // If parameters exist, start directly at INTERVIEW, otherwise start at FORM
  const [step, setStep] = useState<AppStep>(candidate ? AppStep.INTERVIEW : AppStep.FORM);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      if (step === AppStep.RESULT) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string, timeLeftAtEnd: number = 0) => {
    setStep(AppStep.EVALUATING);
    window.history.pushState(null, "", window.location.href);

    // Scoring logic (matching your current logic)
    const timeRemainingMinutes = Math.floor(timeLeftAtEnd / 60);
    let timeScore = 0;
    if (timeRemainingMinutes >= 10) timeScore = Math.floor(Math.random() * 6) + 5; 
    else if (timeRemainingMinutes === 9) timeScore = Math.floor(Math.random() * 6) + 10;
    else if (timeRemainingMinutes === 8) timeScore = Math.floor(Math.random() * 6) + 20;
    else timeScore = Math.floor(Math.random() * 30) + 30;

    const finalRating = Math.min(timeScore, 59);

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this interview for ${candidate?.name}: ${transcript}
        User Score: ${finalRating}/100.
        
        TASK:
        1. Identify 3 personalized growth areas.
        2. Create a summary starting with "Hi @${candidate?.name}...".
        
        Output ONLY JSON:
        {
          "motivationalFeedback": "string",
          "personalizedMistakes": ["string", "string", "string"]
        }
      `;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      setResult({
        rating: finalRating,
        feedback: data.motivationalFeedback,
        passed: false, 
        mistakes: data.personalizedMistakes,
        terminationReason: terminationReason
      });

    } catch (error) {
      setResult({
        rating: finalRating,
        feedback: `Hi @${candidate?.name}, great effort! Focus on more practice to clear the 60+ mark.`,
        passed: false,
        mistakes: ["Technical clarity", "Communication flow", "Depth of answers"]
      });
    }
    setStep(AppStep.RESULT);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-950 flex flex-col relative">
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && (
            <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />
          )}
          {step === AppStep.INSTRUCTIONS && (
            <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />
          )}
          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession 
              candidate={candidate} 
              onComplete={handleInterviewComplete} 
            />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(99,102,241,0.5)]"></div>
                <h2 className="text-2xl font-bold tracking-tight">Analyzing Performance...</h2>
                <p className="text-slate-400 mt-2 font-medium">Your personalized report is being generated.</p>
             </div>
          )}
          {step === AppStep.RESULT && result && (
            <ResultScreen result={result} onReset={() => window.location.reload()} />
          )}
      </main>
    </div>
  );
};

export default App;
