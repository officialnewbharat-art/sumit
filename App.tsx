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

    // 1. TIME-BASED SCORING (Strictly following your rules)
    const timeRemainingMinutes = Math.floor(timeLeftAtEnd / 60);
    let timeScore = 0;

    if (timeRemainingMinutes >= 10) {
      // 10 minutes remain: 5 to 10 marks (Ensuring no zero)
      timeScore = Math.floor(Math.random() * 6) + 5; 
    } else if (timeRemainingMinutes === 9) {
      // 9 minutes remaining: 10 to 15 marks
      timeScore = Math.floor(Math.random() * 6) + 10;
    } else if (timeRemainingMinutes === 8) {
      // 8 minutes remaining: 20 to 25 marks
      timeScore = Math.floor(Math.random() * 6) + 20;
    } else {
      // Any other time spent: 30 to 59 marks (Never 60+)
      timeScore = Math.floor(Math.random() * 30) + 30;
    }

    // Ensure strictly no zero and max 59
    const finalRating = Math.max(timeScore, 5);

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env.API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this internship interview transcript: ${transcript}
        The student scored ${finalRating}/100. They did NOT pass (Passing is 60).
        
        TASK:
        1. Identify 3 areas for improvement.
        2. Provide a VERY warm, polite, and highly motivating summary in Hinglish.
        3. Explain that they are very close and should try again to clear the 60-mark threshold.
        
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
        feedback: data.motivationalFeedback || "Aapne bahut acha prayas kiya! Aap success ke bahut kareeb hain.",
        passed: false, 
        mistakes: data.mistakesToFix || ["Communication", "Technical Knowledge", "Confidence"],
        terminationReason: terminationReason
      });

    } catch (error) {
      setResult({
        rating: finalRating,
        feedback: "Aapne kafi mehnat ki hai! Bas thoda sa aur focus karein aur aap agli baar pakka select ho jayenge!",
        passed: false,
        mistakes: ["Clarity", "Confidence", "Preparation"]
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
             <div className="h-full w-full flex flex-col items-center justify-center bg-[#0f172a] text-white p-6 text-center">
                <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h2 className="text-2xl font-bold">Analyzing Your Interview...</h2>
                <p className="text-slate-400 mt-3">Aapka report taiyaar kiya ja raha hai.</p>
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
