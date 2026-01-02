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

    // 1. INPUT ANALYSIS
    const userLines = transcript.split('\n').filter(line => line.startsWith('User:'));
    const totalUserWords = userLines.join(' ').split(/\s+/).filter(word => word.length > 0).length;

    // 2. TIME-BASED SCORING (As per specific request)
    const totalDuration = 600; // 10 minutes total
    const timeRemainingMinutes = Math.floor(timeLeftAtEnd / 60);
    
    let timeScore = 0;

    if (timeRemainingMinutes >= 10) {
      // 10 minutes completely remain: 0 to 10 marks
      timeScore = Math.floor(Math.random() * 11); 
    } else if (timeRemainingMinutes === 9) {
      // 9 minutes remaining: 10 to 15 marks
      timeScore = Math.floor(Math.random() * 6) + 10;
    } else if (timeRemainingMinutes === 8) {
      // 8 minutes remaining: 20 to 25 marks
      timeScore = Math.floor(Math.random() * 6) + 20;
    } else {
      // Any other time: Random score between 30 and 59
      // This ensures they stay below the 60 passing mark
      timeScore = Math.floor(Math.random() * 30) + 30;
    }

    // 3. FINAL RATING DETERMINATION
    // Force 0 if user didn't speak meaningful words, otherwise cap strictly at 59
    const finalRating = totalUserWords >= 3 ? Math.min(timeScore, 59) : 0;

    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env.API_KEY || "";
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Analyze this internship interview transcript:
        Transcript: ${transcript}
        
        CONTEXT:
        The student scored ${finalRating}/100. The passing mark is 60.
        They did NOT pass. 
        
        TASK:
        1. Identify 3 specific areas for improvement.
        2. Provide a VERY warm, polite, and highly motivating summary in Hinglish.
        3. Tell them they are very close and just need a little more practice to clear it next time.
        
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
        feedback: data.motivationalFeedback || "Aapne bahut acha prayas kiya! Aap success ke bahut kareeb hain. Thodi aur practice se aap agli baar zaroor pass ho jayenge.",
        passed: false, // Force false since max score is 59
        mistakes: data.mistakesToFix || ["Technical depth", "Communication flow", "Confidence"],
        terminationReason: terminationReason
      });

    } catch (error) {
      console.error("Evaluation failed:", error);
      setResult({
        rating: finalRating,
        feedback: "Aapne kafi mehnat ki hai! Aapka dedication kamaal ka hai. Bas thoda sa aur focus karein aur aap agli baar pakka select ho jayenge!",
        passed: false,
        mistakes: ["Clarity", "Confidence", "Practical examples"]
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
                <h2 className="text-2xl font-bold tracking-tight">Analyzing Your Interview...</h2>
                <p className="text-slate-400 mt-3 max-w-xs mx-auto">Hum aapke answers aur performance ko check kar rahe hain taaki aapko behtareen feedback de sakein.</p>
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
