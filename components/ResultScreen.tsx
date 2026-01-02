import React, { useEffect } from 'react';

export const ResultScreen: React.FC<{result: any; onReset: () => void;}> = ({ result, onReset }) => {
  
  useEffect(() => {
    // Lock the back button
    window.history.pushState(null, "", window.location.href);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-slate-50 p-6">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-10 text-center border-t-8 border-indigo-600">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Growth Analysis Report</h2>
        
        <div className="my-8 bg-slate-50 py-8 rounded-3xl">
          <div className="text-8xl font-black text-indigo-600">
            {result.rating}
            <span className="text-3xl text-slate-400">/100</span>
          </div>
          <p className="text-slate-500 mt-2 font-semibold uppercase tracking-widest">Initial Assessment</p>
        </div>

        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 mb-8 text-left">
          <h3 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
            💡 Roadmap to Improve
          </h3>
          <ul className="space-y-4">
            {result.mistakes?.map((m: string, i: number) => (
              <li key={i} className="flex gap-4 text-slate-700">
                <span className="flex-shrink-0 w-6 h-6 bg-rose-200 text-rose-700 rounded-full flex items-center justify-center text-xs font-bold">{i+1}</span>
                <span className="text-sm font-medium">{m}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-indigo-50 p-6 rounded-2xl mb-8 border border-indigo-100">
          <p className="text-indigo-900 text-sm leading-relaxed italic">
            "{result.feedback}"
          </p>
        </div>

        <div className="text-slate-500 text-sm mb-10">
          <p className="font-bold text-slate-700 mb-2">Next Steps:</p>
          Don't worry! Most successful candidates take a few tries. Focus on the mistakes above, prepare for 3-5 days, and come back stronger to claim your internship!
        </div>

        <button 
          onClick={onReset} 
          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all transform active:scale-95 shadow-lg shadow-indigo-200"
        >
          I Will Prepare & Try Again
        </button>
      </div>
    </div>
  );
};
