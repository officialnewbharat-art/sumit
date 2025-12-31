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
        jobDescription: `Technical interview for ${roleParam}. Assess technical accuracy and logic.`,
        language: "English"
      });
      setStep(AppStep.INSTRUCTIONS);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleInterviewComplete = async (transcript: string, terminationReason?: string) => {
    setStep(AppStep.EVALUATING);
    
    // Only force 0 for actual security/proctoring violations
    if (terminationReason && terminationReason.includes("Security Violation")) {
        setResult({
            rating: 0,
            feedback: "Interview terminated due to proctoring violation.",
            passed: false,
            questions: [],
            terminationReason: terminationReason
        });
        setStep(AppStep.RESULT);
        return;
    }
    
    try {
      // FIX: Using the correct key from your vite.config.ts define block
      const apiKey = (process.env as any).GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Evaluate this job interview transcript professionally in English.
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Transcript: 
        ${transcript}
        
        Task:
        1. Identify every technical question the AI asked.
        2. For each question, analyze the candidate's answer summary, provide a technical rating (1-10), and specific feedback.
        3. Even if only one question was answered, provide a full analysis for it.
        4. Give an overall score (1-10) and an executive summary. Do not give 0 if the user spoke; give honest credit.
        
        Output ONLY pure JSON in this format:
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
        rating: data.rating || 1, 
        feedback: data.feedback || "Evaluation completed based on available transcript.",
        passed: (data.rating || 0) >= 6,
        questions: data.questions || [],
        terminationReason: terminationReason
      });

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: 1,
        feedback: "The AI was unable to generate a full report. Marks awarded for participation.",
        passed: false,
        questions: []
      });
    }
    setStep(AppStep.RESULT);
  };

  const resetApp = () => {
    setCandidate(null);
    setResult(null);
    setStep(AppStep.FORM);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden font-sans text-slate-900 bg-slate-50 flex flex-col relative">
      {step !== AppStep.INTERVIEW && (
        <header className="absolute top-0 left-0 w-full z-50 px-4 py-3 md:px-6 md:py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
               <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-lg rotate-45 transform">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 -rotate-45">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15" />
                 </svg>
               </div>
               <h1 className="text-xl font-bold">Interna<span className="text-indigo-600">.ai</span></h1>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 w-full relative overflow-hidden">
          {step === AppStep.FORM && <CandidateForm onSubmit={(info) => { setCandidate(info); setStep(AppStep.INSTRUCTIONS); }} />}
          {step === AppStep.INSTRUCTIONS && <Instructions onStart={() => setStep(AppStep.INTERVIEW)} />}
          {step === AppStep.INTERVIEW && candidate && (
            <InterviewSession candidate={candidate} onComplete={handleInterviewComplete} />
          )}
          {step === AppStep.EVALUATING && (
             <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-bold">Generating English Analysis...</h2>
                <p className="text-indigo-200 mt-2 text-center">We are reviewing your answers now.</p>
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
