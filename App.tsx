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
        jobDescription: `Technical interview for ${roleParam}. Assess core competencies and problem solving.`,
        language: "English"
      });
      setStep(AppStep.INSTRUCTIONS);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.location.replace("https://internadda.com/"); 
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleFormSubmit = (info: CandidateInfo) => {
    setCandidate(info);
    setStep(AppStep.INSTRUCTIONS);
  };

  const startInterview = () => {
    setStep(AppStep.INTERVIEW);
  };

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    
    // Only force zero for actual security breaches. 
    // If the user ends early or answers 1 question, we MUST evaluate honestly.
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
      // FIX: Use import.meta.env for Vite projects
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const ai = new GoogleGenAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
        Evaluate this job interview transcript accurately.
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Transcript: 
        ${transcript}
        
        Evaluation Guidelines:
        1. Identify every question asked by the interviewer.
        2. If the candidate answered even ONE question, provide an honest rating (1-10) for that answer.
        3. DO NOT give a total score of 0 if they attempted to answer. Give at least 1-2 marks for participation.
        4. Be accurate and fair. If the answer was good, give a high score.
        5. Provide a summary for each question asked.

        Output ONLY pure valid JSON:
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
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.response.text());
      
      setResult({
        rating: data.rating || 1, // Default to 1 instead of 0 for participation
        feedback: data.feedback || "Evaluation completed based on transcript.",
        passed: (data.rating || 0) >= 6,
        questions: data.questions || [],
        terminationReason: terminationReason
      });

      setStep(AppStep.RESULT);

    } catch (error) {
      console.error("Evaluation failed", error);
      setResult({
        rating: 1,
        feedback: "The AI had trouble processing the transcript, but marks have been awarded for your effort.",
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

  return (
    <div className="h-[100dvh] w-screen overflow-hidden font-sans text-slate-900 bg-slate-50 flex flex-col relative">
      {showHeader && (
        <header className="absolute top-0 left-0 w-full z-50 px-4 py-3 md:px-6 md:py-4 pointer-events-none">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
               <div className="bg-indigo-600 text-white p-1.5 md:p-2 rounded-lg shadow-lg rotate-45 transform">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5 -rotate-45">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                 </svg>
               </div>
               <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900">
                 Interna<span className="text-indigo-600">.ai</span>
               </h1>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={handleFormSubmit} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={startInterview} />}
          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white text-center px-6">
                <div className="w-16 h-16 border-t-4 border-indigo-500 rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl md:text-4xl font-bold mb-4">Interna is Analyzing</h2>
                <p className="text-indigo-200">Generating your technical Q&A analysis...</p>
             </div>
          )}
          {step === AppStep.RESULT && result && candidate && (
            <ResultScreen result={result} candidateName={candidate.name} onReset={resetApp} />
          )}
      </main>
    </div>
  );
};

export default App;
