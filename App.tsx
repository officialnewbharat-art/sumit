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
    const handlePopState = () => {
      if (step === AppStep.RESULT) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleInterviewComplete = async (transcript: string, timeLeft: number, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    window.history.pushState(null, "", window.location.href);

    // TIME-BASED SCORING LOGIC
    // totalTime = 600s (10 mins)
    const totalDuration = 600;
    const timeUsedSeconds = totalDuration - timeLeft;
    const timeUsedMinutes = Math.floor(timeUsedSeconds / 60);
    
    let baseScore = 0;

    // Scoring based on time spent (User effort)
    if (timeUsedMinutes < 1) {
      // 9-10 mins remaining: 1-5 marks
      baseScore = Math.floor(Math.random() * 5) + 1;
    } else if (timeUsedMinutes < 2) {
      // 8-9 mins remaining: 10-15 marks
      baseScore = Math.floor(Math.random() * 6) + 10;
    } else if (timeUsedMinutes < 3) {
      // 7-8 mins remaining: 20-25 marks
      baseScore = Math.floor(Math.random() * 6) + 20;
    } else {
      // More time used: 30-50 marks
      baseScore = Math.floor(Math.random() * 21) + 30;
    }

    // Ensure final score is strictly 10-59 if any words were spoken
    const userWords = transcript.split('\n').filter(l => l.startsWith('User:')).join(' ');
    const finalRating = userWords.trim().length > 0 ? Math.min(Math.max(baseScore, 10), 59) : 0;

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this internship interview transcript:
        Transcript: ${transcript}
        
        TASK:
        1. Identify 3 general soft-skill improvements (e.g., Confidence, Clarity, Real-life examples).
        2. Provide a warm, motivating summary in a polite manner.
        
        Output ONLY JSON:
        {
          "motivationalFeedback": "string",
          "mistakesToFix": ["string", "string", "string"]
        }
      `;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      setResult({
        rating: finalRating,
        feedback: data.motivationalFeedback || "Aapka prayas prashansaniya hai! Thodi aur taiyari aapko manchahi internship dila sakti hai.",
        passed: false,
        mistakes: data.mistakesToFix || ["Build confidence", "Speak more clearly", "Use real-life examples"],
        terminationReason: terminationReason
      });

    } catch (error) {
      setResult({
        rating: finalRating > 0 ? finalRating : 12,
        feedback: "Aapne acha perform kiya! Basics par thoda aur dhyan dein aur firse koshish karein.",
        passed: false,
        mistakes: ["Clarity in explanation", "Self-confidence", "Real-world examples"]
      });
    }
    setStep(AppStep.RESULT);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden font-sans text-slate-900 bg-slate-50 flex flex-col relative">
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession 
              candidate={candidate} 
              onComplete={(transcript, reason, timeLeftAtEnd) => handleInterviewComplete(transcript, timeLeftAtEnd || 0, reason)} 
            />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Taiyaar ho raha hai aapka Result...</h2>
             </div>
          )}
          {step === AppStep.RESULT && result && (
            <ResultScreen result={result} />
          )}
      </main>
    </div>
  );
};

export default App;
