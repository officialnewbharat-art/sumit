import React, { useEffect } from 'react';

export const ResultScreen: React.FC<{result: any; onReset: () => void;}> = ({ result, onReset }) => {
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto overscroll-contain selection:bg-indigo-100">
      <div className="min-h-full w-full flex flex-col items-center py-12 px-4 md:px-6">
        
        <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 overflow-hidden border border-slate-100 transform transition-all animate-in fade-in zoom-in duration-700">
          
          {/* Header Section */}
          <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
            <h2 className="text-white text-xl font-bold tracking-tight">Interview Performance Report</h2>
          </div>

          <div className="p-8 md:p-12 text-center">
            {/* Score Circle */}
            <div className="inline-flex flex-col items-center justify-center w-48 h-48 rounded-full border-8 border-slate-50 shadow-inner mb-6 bg-white relative">
                <div className={`absolute inset-0 rounded-full border-8 border-t-indigo-500 border-r-indigo-500 border-b-transparent border-l-transparent ${result.rating > 0 ? 'rotate-45' : 'opacity-0'}`}></div>
                <span className="text-6xl font-black text-slate-900 leading-none">{result.rating}</span>
                <span className="text-slate-400 font-bold text-sm mt-1 uppercase tracking-widest">Score / 100</span>
            </div>

            {/* Status Badge */}
            <div className="mb-8">
               <span className={`px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-sm ${result.rating >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {result.rating >= 60 ? 'Qualified' : 'Not Qualified Yet'}
               </span>
               <p className="text-slate-500 text-sm mt-4 font-medium leading-relaxed max-w-sm mx-auto">
                 {result.rating === 0 ? "It looks like we didn't catch your voice." : "A valid attempt! Use the feedback below to reach the 60% threshold."}
               </p>
            </div>

            {/* Improvement Cards */}
            <div className="grid gap-4 text-left mb-10">
              <h3 className="text-slate-900 font-bold text-sm uppercase tracking-wider ml-2">Personalized Roadmap</h3>
              {result.mistakes?.map((m: string, i: number) => (
                <div key={i} className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600 font-bold text-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    {i + 1}
                  </div>
                  <span className="text-slate-700 font-semibold text-sm">{m}</span>
                </div>
              ))}
            </div>

            {/* AI Motivation */}
            <div className="relative p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 mb-10">
              <div className="absolute -top-3 left-8 px-3 bg-white border border-indigo-100 rounded-full text-[10px] font-bold text-indigo-500 uppercase">Expert Advice</div>
              <p className="text-indigo-900 text-sm leading-relaxed italic font-medium">"{result.feedback}"</p>
            </div>

            <button 
              onClick={onReset} 
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-200 active:scale-[0.98] transition-all duration-300"
            >
              Prepare & Try Again
            </button>
            
            <p className="mt-6 text-slate-400 text-xs font-medium">
              Next attempt available after 24 hours of preparation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
