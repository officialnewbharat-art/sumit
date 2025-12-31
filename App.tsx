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
    
    // ONLY force 0 for actual security/cheating violations.
    if (terminationReason && terminationReason.includes("Security Violation")) {
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
      // FIX: Use Vite environment variable syntax
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Evaluate this job interview transcript accurately.
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Transcript: 
        ${transcript}
        
        Evaluation Rules:
        1. Identify every question the AI asked and the candidate's response.
        2. If the candidate answered even ONE question, give an honest rating (1-10) for that answer.
        3. DO NOT give a total score of 0 unless the candidate said absolutely nothing. 
        4. Even for poor answers, give 1 or 2 marks for effort if they attempted to speak.
        5. Provide a summary of each Q&A pair.

        Output ONLY valid JSON:
        {
          "rating": number,
          "feedback": "string",
          "questions": [
            {
              "question": "string",
              "candidateAnswerSummary": "string",
              "rating": number,
              "feedback": "string"
            }
          ]
        }
      `;

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.response.text());
      
      setResult({
        rating: data.rating || 1, // Default to 1 instead of 0
        feedback: data.feedback || "Evaluation complete.",
        passed: (data.rating || 0) >= 6,
        questions: data.questions || [],
        terminationReason: terminationReason
      });
      setStep(AppStep.RESULT);

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: 1, // Fallback to 1 if the AI crashes
        feedback: "The system had trouble analyzing the audio, but you have been awarded basic marks for participation.",
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
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Analyzing Your Interview...</h2>
             </div>
          )}
          {step === AppStep.RESULT && result && <ResultScreen result={result} candidateName={candidate?.name || ""} onReset={() => setStep(AppStep.FORM)} />}
      </main>
    </div>
  );
};
export default App;
