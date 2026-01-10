import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AppStep, CandidateInfo } from './types';
import { CandidateForm } from './components/CandidateForm';
import { Instructions } from './components/Instructions';
import { InterviewSession } from './components/InterviewSession';
import { ResultScreen } from './components/ResultScreen';

const App: React.FC = () => {
  // Use a lazy initializer for state to check URL parameters immediately on load
  const [candidate, setCandidate] = useState<CandidateInfo | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const field = params.get('domain') || params.get('field'); // Support both 'domain' and 'field' keys
    
    if (name && field) {
      return {
        name: decodeURIComponent(name),
        field: decodeURIComponent(field),
        jobDescription: params.get('jd') ? decodeURIComponent(params.get('jd')!) : `Technical interview for ${field} role.`,
        language: params.get('lang') || 'English'
      };
    }
    return null;
  });

  // Set initial step based on whether candidate info was found in URL
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

    const timeRemainingMinutes = Math.floor(timeLeftAtEnd / 60);
    let timeScore = 0;

    if (timeRemainingMinutes >= 10) {
      timeScore = Math.floor(Math.random() * 6) + 5; 
    } else if (timeRemainingMinutes === 9) {
      timeScore = Math.floor(Math.random() * 6) + 10;
    } else if (timeRemainingMinutes === 8) {
      timeScore = Math.floor(Math.random() * 6) + 20;
    } else {
      timeScore = Math.floor(Math.random() * 30) + 30;
    }

    const finalRating = Math.min(timeScore, 59);

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env.API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this interview for ${candidate?.name}: ${transcript}
        User Score: ${finalRating}/100.
        
        TASK:
        1. Identify 3 personalized growth areas (e.g., "Confidence missing when discussing technical stacks").
        2. Create a summary starting with "Hi @${candidate?.name}...".
        3. Make the feedback warm, highly motivating, and urge them to try again for 60+.
        
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
        feedback: data.motivationalFeedback || `Hi @${candidate?.name}, aapne acha prayas kiya! Thodi aur practice se aap 60+ clear kar lenge.`,
        passed: false, 
        mistakes: data.personalizedMistakes || ["Confidence during questions", "Technical clarity", "Project depth"],
        terminationReason: terminationReason
      });

    } catch (error) {
      setResult({
        rating: finalRating,
        feedback: `Hi @${candidate?.name}, aap success ke bahut kareeb hain! Bas thodi si aur mehnat aur internship aapki hogi.`,
        passed: false,
        mistakes: ["Professional communication", "Conceptual depth", "Problem solving"]
      });
    }
    setStep(AppStep.RESULT);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-950 flex flex-col relative">
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
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
                <p className="text-slate-400 mt-2 font-medium">Aapka personalized report generate ho raha hai.</p>
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
