import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AppStep, CandidateInfo } from './types';
import { CandidateForm } from './components/CandidateForm';
import { Instructions } from './components/Instructions';
import { InterviewSession } from './components/InterviewSession';
import { ResultScreen } from './components/ResultScreen';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.FORM);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    // Lock back navigation on the Result Screen
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

    // 1. SILENCE DETECTION
    const userLines = transcript.split('\n').filter(line => line.startsWith('User:'));
    const totalUserWords = userLines.join(' ').split(/\s+/).filter(word => word.length > 0).length;

    // 2. TIME-BASED SCORING CALCULATIONS
    const totalDuration = 600; // 10 minutes
    const timeUsedSeconds = totalDuration - timeLeftAtEnd;
    const timeUsedMinutes = Math.floor(timeUsedSeconds / 60);
    
    let timeScore = 0;

    // Scoring based on user persistence/time spent
    if (timeUsedMinutes <= 1) {
      // 9-10 mins remaining: 10-15 marks
      timeScore = Math.floor(Math.random() * 6) + 10;
    } else if (timeUsedMinutes <= 2) {
      // 8-9 mins remaining: 20-25 marks
      timeScore = Math.floor(Math.random() * 6) + 20;
    } else {
      // Significant time spent: 30-50 marks
      timeScore = Math.floor(Math.random() * 21) + 30;
    }

    // 3. FINAL RATING DETERMINATION
    // Force 0 if user didn't speak meaningful words, otherwise cap at 59
    const finalRating = totalUserWords >= 5 ? Math.min(Math.max(timeScore, 10), 59) : 0;

    try {
      // Accessing API Key safely via Vite/Process
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env.API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this internship interview transcript:
        Transcript: ${transcript}
        
        TASK:
        1. Identify 3 general soft-skill areas for improvement (e.g., Clarity, Confidence, Real-life examples).
        2. Provide a warm, polite, and motivating summary for the student.
        
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
        feedback: data.motivationalFeedback || "Aapne acha prayas kiya! Thodi aur taiyari aapko internship dila sakti hai.",
        passed: false, // Hardcoded false for 10-59 range
        mistakes: data.mistakesToFix || ["Build confidence", "Speak more clearly", "Use real-life examples"],
        terminationReason: terminationReason
      });

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: finalRating,
        feedback: "Aapne kafi mehnat ki hai! Apne concepts ko thoda aur majboot karein aur firse koshish karein.",
        passed: false,
        mistakes: ["Clarity", "Confidence", "Real-world examples"]
      });
    }
    setStep(AppStep.RESULT);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-50 flex flex-col relative">
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
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Taiyaar ho raha hai aapka Report...</h2>
                <p className="text-indigo-200 mt-2 italic">Aapke answers ko analyze kiya ja raha hai</p>
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
