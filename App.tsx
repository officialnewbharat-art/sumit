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
      if (step === AppStep.RESULT) window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    window.history.pushState(null, "", window.location.href);

    // LOGIC: If transcript is nearly empty or only contains AI lines, score is 0
    const userLines = transcript.split('\n').filter(line => line.startsWith('User:'));
    const totalUserWords = userLines.join(' ').split(' ').length;

    if (totalUserWords < 5 || userLines.length === 0) {
      setResult({
        rating: 0,
        feedback: "We noticed you didn't have a chance to speak. Please ensure your microphone is working and try again when you're ready!",
        passed: false,
        mistakes: ["Microphone check", "Initial greeting", "Active participation"],
        terminationReason: terminationReason
      });
      setStep(AppStep.RESULT);
      return;
    }

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this transcript: ${transcript}
        1. Rate answer quality (0.1 to 1.0).
        2. Identify 3 soft-skill areas for improvement.
        Return ONLY JSON: {"weight": number, "motivation": "string", "mistakes": ["string"]}
      `;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      // Weighted score between 10-59 (Never 60+)
      const dynamicScore = Math.floor(10 + (49 * (data.weight || 0.5)));

      setResult({
        rating: dynamicScore,
        feedback: data.motivation,
        passed: false,
        mistakes: data.mistakes,
        terminationReason
      });

    } catch (error) {
      setResult({ rating: 25, feedback: "Great effort! Keep practicing.", passed: false, mistakes: ["Clarity", "Confidence"] });
    }
    setStep(AppStep.RESULT);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-50 flex flex-col">
      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
          {step === AppStep.INTERVIEW && candidate && <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold animate-pulse">Creating Your Learning Path...</h2>
             </div>
          )}
          {step === AppStep.RESULT && result && <ResultScreen result={result} onReset={() => window.location.reload()} />}
      </main>
    </div>
  );
};

export default App;
