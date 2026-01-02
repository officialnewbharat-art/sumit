import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AppStep, CandidateInfo, InterviewResult } from './types';
import { CandidateForm } from './components/CandidateForm';
import { Instructions } from './components/Instructions';
import { InterviewSession } from './components/InterviewSession';
import { ResultScreen } from './components/ResultScreen';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.FORM);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    // Prevent back navigation logic
    const handlePopState = (e: PopStateEvent) => {
      if (step === AppStep.RESULT) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    
    // Lock user on the result page once evaluation starts
    window.history.pushState(null, "", window.location.href);

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this internship interview transcript:
        Transcript: ${transcript}
        
        TASK:
        1. Evaluate how well the candidate answered (Quality Weight: 0.1 to 1.0).
        2. Identify 3 general areas for improvement (e.g., Confidence, Clarity, Real-life examples, Topic depth).
        3. Provide a warm, motivating summary.
        
        Output ONLY JSON:
        {
          "qualityWeight": number,
          "motivationalFeedback": "string",
          "mistakesToFix": ["string", "string", "string"]
        }
      `;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      // Random generator logic: Score between 10 and 59 based on transcript quality
      // Higher quality weight = closer to 59. Lower = closer to 10.
      const base = 10;
      const range = 49;
      const dynamicScore = Math.floor(base + (range * (data.qualityWeight || 0.5)));

      setResult({
        rating: dynamicScore,
        feedback: data.motivationalFeedback || "You have great potential! Focus on your presentation and try again.",
        passed: false, // Hardcoded false as per 10-59 requirement
        mistakes: data.mistakesToFix || ["Build confidence", "Speak more clearly", "Use real-life examples"],
        terminationReason: terminationReason
      });

    } catch (error) {
      setResult({
        rating: Math.floor(Math.random() * 20) + 20,
        feedback: "Keep going! You are learning and improving every day.",
        passed: false,
        mistakes: ["Clarity in explanation", "Confidence building", "Real-world examples"]
      });
    }
    setStep(AppStep.RESULT);
  };

  const resetApp = () => {
    window.location.reload(); // Hard refresh to clear session and state
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden font-sans text-slate-900 bg-slate-50 flex flex-col relative">
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Analysing your performance...</h2>
                <p className="text-indigo-200 mt-2">Almost there!</p>
             </div>
          )}
          {step === AppStep.RESULT && result && (
            <ResultScreen result={result} onReset={resetApp} />
          )}
      </main>
    </div>
  );
};

export default App;
