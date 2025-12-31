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

  useEffect(() => {
    const navEntry = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (navEntry && navEntry.type === 'back_forward') {
       window.location.replace("https://internadda.com/");
       return; 
    }
    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get('name');
    const roleParam = params.get('role');
    if (nameParam && roleParam) {
      setCandidate({
        name: nameParam,
        field: roleParam,
        jobDescription: `Technical interview for ${roleParam}.`,
        language: "English"
      });
      setStep(AppStep.INSTRUCTIONS);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    
    // Only fail automatically for security violations
    if (terminationReason && terminationReason.includes("Violation")) {
        setResult({
            rating: 0,
            feedback: "Interview terminated due to security violation.",
            passed: false,
            questions: [],
            terminationReason: terminationReason
        });
        setStep(AppStep.RESULT);
        return;
    }
    
    try {
      // FIX: Use import.meta.env for Vite
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Evaluate this interview transcript.
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Transcript: ${transcript}
        
        Task:
        1. Rate the candidate 1-10.
        2. Provide feedback (max 3 sentences).
        3. Identify EVERY technical question. For each:
           - "question": string
           - "candidateAnswerSummary": string
           - "rating": integer 1-10
           - "feedback": string
        
        Output ONLY valid JSON.
      `;

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { 
            responseMimeType: "application/json" 
        }
      });

      const data = JSON.parse(response.response.text());
      
      setResult({
        rating: data.rating || 0,
        feedback: data.feedback || "Evaluation complete.",
        passed: (data.rating || 0) >= 6,
        questions: data.questions || [],
        terminationReason: terminationReason
      });
      setStep(AppStep.RESULT);

    } catch (error) {
      console.error("Evaluation Error:", error);
      setResult({
        rating: 0,
        feedback: "The AI could not process the transcript. Ensure you completed the interview.",
        passed: false,
        questions: []
      });
      setStep(AppStep.RESULT);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-slate-50 flex flex-col overflow-hidden">
      <main className="flex-1 relative">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
          {step === AppStep.INTERVIEW && candidate && <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-bold">Analyzing Your Interview...</h2>
             </div>
          )}
          {step === AppStep.RESULT && result && candidate && <ResultScreen result={result} candidateName={candidate.name} onReset={() => setStep(AppStep.FORM)} />}
      </main>
    </div>
  );
};
export default App;
