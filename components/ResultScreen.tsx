import React, { useEffect } from 'react';

interface ResultScreenProps {
  result: {
    rating: number;
    feedback: string;
    passed: boolean;
    mistakes: string[];
    terminationReason?: string;
  };
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ result }) => {
  
  useEffect(() => {
    // Lock the back button to keep user on the result page
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleRedirect = () => {
    window.location.href = "https://internadda.com";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto overscroll-contain flex flex-col items-center">
      <div className="min-h-full w-full max-w-2xl flex flex-col items-center py-10 px-4 md:px-6">
        
        <div className="w-full bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden transform transition-all animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Top Decorative Header */}
          <div className="bg-slate-900 p-8 text-center relative">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
            <h2 className="text-white text-lg font-bold tracking-tight">Personal Growth Report</h2>
          </div>

          <div className="p-8 md:p-12 text-center">
            
            {/* Score Visualization */}
            <div className="relative inline-flex flex-col items-center justify-center w-48 h-48 rounded-full border-[10px] border-slate-50 mb-8 bg-white shadow-inner">
                {/* SVG Progress Circle Background */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="86"
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="10"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r="86"
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="10"
                    strokeDasharray="540"
                    strokeDashoffset={540 - (540 * result.rating) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <span className="text-7xl font-black text-slate-900 leading-none z-10">{result.rating}</span>
                <span className="text-slate-400 font-bold text-[10px] mt-2 uppercase tracking-[0.2em] z-10">Score / 100</span>
            </div>

            {/* Status Message */}
            <div className="mb-10">
               <div className="inline-block px-8 py-3 rounded-2xl bg-rose-50 border border-rose-100 mb-5">
                  <span className="text-rose-600 font-black uppercase tracking-widest text-xs">Not Qualified Yet</span>
               </div>
               <h3 className="text-slate-900 text-xl font-bold mb-3">Keep your head up!</h3>
               <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-sm mx-auto">
                 {result.rating === 0 
                    ? "We noticed your microphone wasn't active. Let's fix that before your next try!" 
                    : "You've taken the first step toward your internship. Follow the roadmap below to reach the 60% qualification mark."}
               </p>
            </div>

            {/* Personalized Roadmap */}
            <div className="space-y-4 text-left mb-10">
              <h4 className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] text-center mb-6">Key Areas to Strengthen</h4>
              {result.mistakes?.map((m: string, i: number) => (
                <div key={i} className="flex items-center gap-5 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all duration-300 group">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600 font-bold text-sm border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    {i + 1}
                  </div>
                  <span className="text-slate-700 font-semibold text-sm leading-snug">{m}</span>
                </div>
              ))}
            </div>

            {/* AI Expert Insight */}
            <div className="relative p-7 bg-indigo-50/40 rounded-[2rem] border border-indigo-100/50 mb-10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-white border border-indigo-100 rounded-full text-[9px] font-black text-indigo-500 uppercase tracking-widest shadow-sm">
                Expert Suggestion
              </div>
              <p className="text-indigo-900 text-sm leading-relaxed italic font-semibold">
                "{result.feedback}"
              </p>
            </div>

            {/* Redirect Action */}
            <div className="space-y-4">
              <button 
                onClick={handleRedirect}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.25rem] font-bold text-lg shadow-xl shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-200 transition-all duration-300 transform active:scale-[0.98]"
              >
                I Will Prepare & Try Again
              </button>
              
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.15em]">
                Preparation resources at InternAdda.com
              </p>
            </div>
          </div>
        </div>
        
        {/* Footer spacing for mobile */}
        <div className="h-10 w-full flex-shrink-0"></div>
      </div>
    </div>
  );
};
