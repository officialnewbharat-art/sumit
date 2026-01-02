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
    // Prevent back navigation by pushing state
    const handlePopState = () => {
      if (step === AppStep.RESULT) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    window.history.pushState(null, "", window.location.href);

    // SILENCE DETECTION: Check if the user actually spoke meaningful words
    const userLines = transcript.split('\n').filter(line => line.startsWith('User:'));
    const totalUserWords = userLines.join(' ').split(/\s+/).filter(word => word.length > 0).length;

    // If less than 5 words spoken, award 0 marks immediately
    if (totalUserWords < 5) {
      setResult({
        rating: 0,
        feedback: "It looks like your microphone wasn't picking up your voice. Please ensure you are in a quiet place with a working mic and try again!",
        passed: false,
        mistakes: ["Microphone connectivity check", "Active participation", "Clear verbal communication"],
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
        Analyze this internship interview transcript:
        Transcript: ${transcript}
        
        TASK:
        1. Evaluate the technical and general answer quality (Quality Weight: 0.1 to 1.0).
        2. Identify 3 soft-skill areas for improvement (e.g., Confidence, Clarity, Real-life examples).
        3. Provide a warm, friendly, and motivating summary.
        
        Output ONLY JSON:
        {
          "qualityWeight": number,
          "motivationalFeedback": "string",
          "mistakesToFix": ["string", "string", "string"]
        }
      `;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      // Weighted score generator (Range: 10 - 59). No one passes 60.
      // Better speaking/answers result in a score closer to 59.
      const base = 10;
      const range = 49;
      const dynamicScore = Math.floor(base + (range * (data.qualityWeight || 0.5)));

      setResult({
        rating: dynamicScore,
        feedback: data.motivationalFeedback || "You have a great spirit! With a bit more preparation, you'll be ready for the internship.",
        passed: false,
        mistakes: data.mistakesToFix || ["Build confidence", "Speak more clearly", "Use real-life examples"],
        terminationReason: terminationReason
      });

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: 22,
        feedback: "Great start! Practice your technical basics and come back for another round soon.",
        passed: false,
        mistakes: ["Speak clearly", "Explain with examples", "Maintain confidence"]
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
            <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Creating your personalized report...</h2>
                <p className="text-indigo-200 mt-2">Almost ready!</p>
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
