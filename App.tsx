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
      // Use the injected environment variable from vite.config.ts
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        You are a Master Technical Recruiter and Mentor. Analyze the following transcript:
        Candidate: ${candidate?.name}
        Role: ${candidate?.field}
        Transcript: 
        ${transcript}
        
        STRICT EVALUATION & LEARNING RULES:
        1. FOR EVERY TECHNICAL QUESTION ASKED: You MUST provide a detailed "candidateAnswerSummary" and "feedback".
        2. TEACHING MOMENT: If the candidate gave a wrong or partial answer, the "feedback" section for that question MUST explain the error and provide the correct technical concept/answer so the user can learn for next time.
        3. SCORING: Total 100 marks. Each of the 5 questions is worth 20 marks.
        4. ATTEMPT BONUS: NEVER give 0 marks for an attempted answer. Award 1-2 marks (5-10%) even for poor or incomplete attempts.
        5. OUTPUT: Return ONLY pure JSON.
        
        JSON STRUCTURE:
        {
          "rating": number (Sum of question scores out of 100),
          "feedback": "Overall summary of performance and learning path.",
          "questions": [
            {
              "question": "The technical question asked",
              "candidateAnswerSummary": "Summary of user's response",
              "rating": number (Score out of 20),
              "feedback": "Deep technical analysis: What was wrong, what is the correct answer, and what to study."
            }
          ]
        }
      `;

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.response.text());
      
      // Fallback to ensure Q&A is never empty on the result screen
      const processedQuestions = data.questions && data.questions.length > 0 
        ? data.questions 
        : [{
            question: "Interview Summary",
            candidateAnswerSummary: "Partial or interrupted attempt recorded.",
            rating: data.rating || 5,
            feedback: "Detailed analysis was unavailable for this transcript. Review the core concepts for " + (candidate?.field || "this role") + " and try again."
          }];

      setResult({
        rating: data.rating || 5, 
        feedback: data.feedback || "Evaluation completed. Please check the Q&A Analysis tab for detailed learning feedback.",
        passed: (data.rating || 0) >= 60,
        questions: processedQuestions,
        terminationReason: terminationReason
      });

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: 5,
        feedback: "The analysis engine encountered an error, but marks have been awarded for your effort.",
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
                <h2 className="text-2xl font-bold">Generating Detailed Learning Report...</h2>
                <p className="text-indigo-200 mt-2 text-center">Identifying areas for improvement.</p>
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
