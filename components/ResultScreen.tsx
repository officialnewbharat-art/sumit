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
    // Lock the back button
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    
    // Fix for some mobile browsers that 'freeze' scroll on mount
    document.body.style.overflow = 'hidden'; 
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleRedirect = () => {
    window.location.href = "https://internadda.com";
  };

  return (
    /* FIXED: Added 'touch-pan-y' and removed 'fixed' height constraints that cause mobile freezing */
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto overscroll-contain touch-pan-y flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col items-center py-8 px-4 md:px-6 pb-20">
        
        <div className="w-full bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Header */}
          <div className="bg-slate-900 p-6 text-center relative">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
            <h2 className="text-white text-base font-bold tracking-tight">Personal Growth Report</h2>
          </div>

          <div className="p-6 md:p-10 text-center">
            
            {/* Score Circle */}
            <div className="relative inline-flex flex-col items-center justify-center w-40 h-40 rounded-full border-[8px] border-slate-50 mb-6 bg-white shadow-inner">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle cx="50%" cy="50%" r="72" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                  <circle
                    cx="50%" cy="50%" r="72" fill="none" stroke="#6366F1" strokeWidth="8"
                    strokeDasharray="452"
                    strokeDashoffset={452 - (452 * result.rating) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <span className="text-6xl font-black text-slate-900 leading-none z-10">{result.rating}</span>
                <span className="text-slate-400 font-bold text-[9px] mt-1 uppercase tracking-widest z-10">Score / 100</span>
            </div>

            {/* Status Section */}
            <div className="mb-8">
               <div className="inline-block px-6 py-2 rounded-2xl bg-rose-50 border border-rose-100 mb-4">
                  <span className="text-rose-600 font-black uppercase tracking-widest text-[10px]">Not Qualified Yet</span>
               </div>
               <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs mx-auto">
                 {result.rating === 0 
                    ? "We didn't hear your voice. Please check your mic and try again!" 
                    : "Focus on the roadmap below to reach the 60% mark next time."}
               </p>
            </div>

            {/* Roadmap */}
            <div className="space-y-3 text-left mb-8">
              <h4 className="text-slate-400 font-bold text-[9px] uppercase tracking-[0.2em] text-center mb-4">Steps to Improve</h4>
              {result.mistakes?.map((m: string, i: number) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 active:scale-[0.98] transition-all">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600 font-bold text-xs border border-slate-100">
                    {i + 1}
                  </div>
                  <span className="text-slate-700 font-semibold text-xs leading-snug">{m}</span>
                </div>
              ))}
            </div>

            {/* AI Insight */}
            <div className="p-6 bg-indigo-50/40 rounded-[2rem] border border-indigo-100/50 mb-8 text-left">
              <p className="text-indigo-900 text-xs leading-relaxed italic font-semibold">
                "{result.feedback}"
              </p>
            </div>

            {/* Action */}
            <button 
              onClick={handleRedirect}
              className="w-full py-4 bg-slate-900 text-white rounded-[1.25rem] font-bold text-base shadow-xl shadow-slate-200 hover:bg-indigo-600 transition-all active:scale-[0.98]"
            >
              Prepare & Try Again
            </button>
            
            <p className="mt-5 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Resources at InternAdda.com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
