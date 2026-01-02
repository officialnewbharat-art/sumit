import React, { useState, useEffect } from 'react';
import { InterviewResult } from '../types';

export const ResultScreen: React.FC<{result: InterviewResult; candidateName: string; onReset: () => void;}> = ({ result, candidateName, onReset }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'qa'>('overview');
  
  // Logic for pop-ups and redirection based on score
  useEffect(() => {
    // Only trigger if it's not a security violation termination
    const isViolation = result.terminationReason?.includes("Violation");
    if (isViolation) return;

    if (result.rating >= 60) {
      alert("Congratulations! Please send your CV to support@internadda.com to proceed further.");
    } else {
      alert("Practice more and try more! You are being redirected to internadda.com to help you prepare better.");
      setTimeout(() => {
        window.location.href = "https://internadda.com";
      }, 3000);
    }
  }, [result.rating, result.terminationReason]);

  const isViolation = result.terminationReason?.includes("Violation");

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-full w-full bg-slate-50">
       <div className="lg:col-span-4 bg-white border-r p-10 flex flex-col items-center justify-center">
          {isViolation ? (
             <h2 className="text-rose-600 font-bold text-2xl">DISQUALIFIED</h2>
          ) : (
             <div className="text-center">
                {/* Score updated to /100 */}
                <div className="text-6xl font-black mb-2">{result.rating}<span className="text-2xl text-slate-400">/100</span></div>
                <div className={`px-4 py-1 rounded-full text-sm font-bold uppercase ${result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {result.passed ? 'Qualified' : 'Not Qualified'}
                </div>
             </div>
          )}
          <button onClick={onReset} className="mt-8 w-full py-3 bg-slate-900 text-white rounded-xl font-bold">New Interview</button>
       </div>

       <div className="lg:col-span-8 flex flex-col overflow-hidden">
          {!isViolation && (
            <div className="bg-white border-b px-12 pt-6 flex gap-8">
                <button onClick={() => setActiveTab('overview')} className={`pb-4 font-bold border-b-2 ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Overview</button>
                <button onClick={() => setActiveTab('qa')} className={`pb-4 font-bold border-b-2 ${activeTab === 'qa' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Q&A Analysis ({result.questions?.length || 0})</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-12">
             {activeTab === 'overview' ? (
                <div className="bg-white p-8 rounded-2xl border shadow-sm">
                    <h3 className="font-bold mb-4">Executive Summary</h3>
                    <p className="text-slate-600 leading-relaxed">{result.feedback}</p>
                </div>
             ) : (
                <div className="space-y-6">
                   {result.questions?.map((qa, i) => (
                      <div key={i} className="bg-white p-6 rounded-2xl border shadow-sm">
                         <div className="flex justify-between mb-2">
                            <span className="font-bold text-indigo-600 text-sm">Question {i+1}</span>
                            {/* Individual question score out of 20 */}
                            <span className="font-bold bg-slate-100 px-2 py-1 rounded text-sm">Score: {qa.rating}/20</span>
                         </div>
                         <p className="font-bold text-slate-900 mb-4">{qa.question}</p>
                         <div className="bg-slate-50 p-4 rounded-xl border">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Answer Summary</h5>
                            <p className="text-sm text-slate-700 mb-4">{qa.candidateAnswerSummary}</p>
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-1">AI Analysis</h5>
                            <p className="text-sm text-slate-600">{qa.feedback}</p>
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
       </div>
    </div>
  );
};
