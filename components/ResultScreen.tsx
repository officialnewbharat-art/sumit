import React, { useState } from 'react';
import { InterviewResult } from '../types';

interface ResultScreenProps {
  result: InterviewResult;
  candidateName: string;
  onReset: () => void;
}

type Tab = 'overview' | 'qa';

export const ResultScreen: React.FC<ResultScreenProps> = ({ result, candidateName, onReset }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  
  // FIX: Only show the "Disqualified" UI if it was a security breach.
  const isSecurityViolation = result.terminationReason?.includes("Security Violation");

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-full w-full bg-slate-50 animate-slide-up">
       <div className="lg:col-span-4 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 z-10 pt-14 lg:pt-0">
          <div className="lg:hidden px-4 py-3 flex items-center justify-between bg-white/50 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                  {!isSecurityViolation && (
                    <div className="relative w-12 h-12 shrink-0">
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
                            {result.rating}
                        </div>
                    </div>
                  )}
                  <div>
                      <h1 className="text-base font-bold text-slate-900 leading-tight truncate max-w-[180px]">{candidateName}</h1>
                      {isSecurityViolation ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Disqualified</span>
                      ) : (
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${result.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {result.passed ? 'Qualified' : 'Not Qualified'}
                          </span>
                      )}
                  </div>
              </div>
              <button onClick={onReset} className="p-2 bg-slate-100 rounded-lg text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>
          </div>

          <div className="hidden lg:flex flex-col h-full pt-24">
            <div className="px-6 py-4 lg:px-10 lg:py-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-[10px] lg:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Candidate Evaluation</h2>
                <h1 className="text-xl lg:text-3xl font-bold text-slate-900 truncate">{candidateName}</h1>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center p-8 lg:p-10">
                {isSecurityViolation ? (
                    <div className="text-center">
                        <div className="w-24 h-24 lg:w-32 lg:h-32 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-12 h-12 lg:w-16 lg:h-16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                        </div>
                        <h2 className="text-2xl lg:text-3xl font-bold text-rose-600 mb-2">DISQUALIFIED</h2>
                        <p className="text-slate-500 max-w-xs mx-auto">{result.terminationReason}</p>
                    </div>
                ) : (
                    <div className="relative mb-6 lg:mb-8">
                        <svg className="w-40 h-40 lg:w-56 lg:h-56 transform -rotate-90">
                            <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100"/>
                            <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="12" fill="transparent" className={result.passed ? 'text-emerald-500' : 'text-rose-500'} strokeDasharray={100} strokeDashoffset={100 - (result.rating * 10)} pathLength={100} style={{transition: 'stroke-dashoffset 1s ease-in-out'}} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl lg:text-6xl font-black text-slate-900">{result.rating}</span>
                            <span className="text-slate-400 text-base lg:text-lg font-medium">/ 10</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                <button onClick={onReset} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2">Start New Interview</button>
            </div>
          </div>
       </div>

       <div className="lg:col-span-8 bg-slate-50 flex flex-col flex-1 overflow-hidden lg:pt-24">
          {!isSecurityViolation && (
            <div className="bg-white border-b border-slate-200 px-4 lg:px-12 pt-2 lg:pt-6 shrink-0">
                <div className="flex gap-6 lg:gap-8">
                    <button onClick={() => setActiveTab('overview')} className={`pb-3 lg:pb-4 text-sm lg:text-base font-bold border-b-2 transition-all ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>Overview</button>
                    <button onClick={() => setActiveTab('qa')} className={`pb-3 lg:pb-4 text-sm lg:text-base font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'qa' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
                    Q&A Analysis
                    {result.questions && <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{result.questions.length}</span>}
                    </button>
                </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 lg:p-12 pb-20 lg:pb-0">
             <div className="max-w-4xl mx-auto animate-fade-in">
                {isSecurityViolation ? (
                    <div className="bg-white rounded-2xl p-6 lg:p-8 border border-slate-200 text-center">
                        <h3 className="text-lg lg:text-xl font-bold text-slate-900 mb-4">Security Violation Report</h3>
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-left">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Reason</div>
                            <div className="font-mono text-rose-600">{result.terminationReason}</div>
                        </div>
                    </div>
                ) : (
                    <>
                    {activeTab === 'overview' && (
                    <div className="space-y-6 lg:space-y-12">
                        <div className="bg-white p-5 lg:p-8 rounded-2xl shadow-sm border border-slate-100 text-slate-700 text-sm lg:text-lg leading-relaxed">
                            <h3 className="font-bold text-slate-900 mb-4">Executive Summary</h3>
                            {result.feedback}
                        </div>
                        {result.passed && (
                            <div className="bg-slate-900 rounded-2xl p-8 text-center text-white">
                                <h3 className="text-xl font-bold mb-3">Congratulations!</h3>
                                <p className="text-slate-300 mb-6">You have cleared this round. Mail your resume to:</p>
                                <a href="mailto:hr@internadda.com" className="text-lg font-bold text-indigo-400 underline">hr@internadda.com</a>
                            </div>
                        )}
                    </div>
                    )}

                    {activeTab === 'qa' && (
                    <div className="space-y-4 lg:space-y-6">
                        {result.questions?.length > 0 ? result.questions.map((qa, idx) => (
                            <div key={idx} className="bg-white rounded-xl lg:rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="p-4 lg:p-6 border-b border-slate-100 flex items-start gap-3 lg:gap-4">
                                    <div className="flex-1">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 lg:mb-2">Question {idx + 1}</h4>
                                        <p className="text-sm lg:text-lg font-semibold text-slate-900">{qa.question}</p>
                                    </div>
                                    <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-lg bg-slate-50 border flex items-center justify-center font-bold">{qa.rating}</div>
                                </div>
                                <div className="p-4 lg:p-6 bg-slate-50/30">
                                    <h5 className="text-xs font-bold text-indigo-600 uppercase mb-2">Candidate's Answer</h5>
                                    <p className="text-slate-600 text-sm mb-4">{qa.candidateAnswerSummary}</p>
                                    <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Evaluation</h5>
                                    <p className="text-slate-800 text-sm">{qa.feedback}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-12 text-slate-400">No question data extracted from the transcript.</div>
                        )}
                    </div>
                    )}
                    </>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};
