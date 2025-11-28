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
  const isDisqualified = !!result.terminationReason;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-full w-full bg-slate-50 animate-slide-up">
       
       {/* TOP SECTION (Mobile) / SIDEBAR (Desktop) */}
       <div className="lg:col-span-4 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 z-10 pt-14 lg:pt-0">
          
          {/* --- MOBILE COMPACT VIEW --- */}
          <div className="lg:hidden px-4 py-3 flex items-center justify-between bg-white/50 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                  {!isDisqualified && (
                    <div className="relative w-12 h-12 shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="50%" cy="50%" r="45%" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                            <circle 
                                cx="50%" cy="50%" r="45%" 
                                stroke={result.passed ? '#10b981' : '#f43f5e'} 
                                strokeWidth="8" 
                                fill="transparent" 
                                strokeDasharray={`${result.rating * 10} 100`} 
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
                            {result.rating}
                        </div>
                    </div>
                  )}
                  
                  <div>
                      <h1 className="text-base font-bold text-slate-900 leading-tight truncate max-w-[180px]">{candidateName}</h1>
                      {isDisqualified ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Disqualified</span>
                      ) : (
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${result.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {result.passed ? 'Qualified' : 'Not Qualified'}
                          </span>
                      )}
                  </div>
              </div>

              <button 
                onClick={onReset} 
                className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform"
                aria-label="New Interview"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                 </svg>
              </button>
          </div>


          {/* --- DESKTOP EXPANDED VIEW --- */}
          <div className="hidden lg:flex flex-col h-full pt-24">
            {/* Header Section */}
            <div className="px-6 py-4 lg:px-10 lg:py-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-[10px] lg:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Candidate Evaluation</h2>
                <h1 className="text-xl lg:text-3xl font-bold text-slate-900 truncate" title={candidateName}>{candidateName}</h1>
            </div>

            {/* Score Display */}
            <div className="flex-grow flex flex-col items-center justify-center p-8 lg:p-10">
                {isDisqualified ? (
                    <div className="text-center">
                        <div className="w-24 h-24 lg:w-32 lg:h-32 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-12 h-12 lg:w-16 lg:h-16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
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
                
                {!isDisqualified && (
                    <div className={`px-4 lg:px-6 py-2 lg:py-3 rounded-full text-xs lg:text-sm font-bold uppercase tracking-widest ${
                        result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                        {result.passed ? 'Qualified Candidate' : 'Does Not Meet Bar'}
                    </div>
                )}
            </div>

            {/* BRANDING FOOTER IN SIDEBAR */}
            <div className="mt-auto px-10 pb-4 text-center">
                 <p className="text-xs text-slate-400 font-medium">Powered by InternAdda</p>
                 <p className="text-[10px] text-slate-300">A co-brand of InternAdda</p>
            </div>

            {/* Action Footer */}
            <div className="hidden lg:block p-8 border-t border-slate-100 bg-slate-50/50">
                <button
                onClick={onReset}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-lg hover:shadow-indigo-200 flex items-center justify-center gap-2"
                >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Start New Interview
                </button>
            </div>
          </div>
       </div>

       {/* MAIN CONTENT: Tabs & Detailed Feedback */}
       <div className="lg:col-span-8 bg-slate-50 flex flex-col flex-1 overflow-hidden lg:pt-24">
          
          {!isDisqualified && (
            <div className="bg-white border-b border-slate-200 px-4 lg:px-12 pt-2 lg:pt-6 shrink-0">
                <div className="flex gap-6 lg:gap-8">
                    <button 
                    onClick={() => setActiveTab('overview')}
                    className={`pb-3 lg:pb-4 text-sm lg:text-base font-bold border-b-2 transition-all ${
                        activeTab === 'overview' 
                        ? 'border-indigo-600 text-indigo-600' 
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                    >
                    Overview
                    </button>
                    <button 
                    onClick={() => setActiveTab('qa')}
                    className={`pb-3 lg:pb-4 text-sm lg:text-base font-bold border-b-2 transition-all flex items-center gap-2 ${
                        activeTab === 'qa' 
                        ? 'border-indigo-600 text-indigo-600' 
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                    >
                    Q&A Analysis
                    {result.questions && (
                        <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{result.questions.length}</span>
                    )}
                    </button>
                </div>
            </div>
          )}

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-12 custom-scrollbar">
             <div className="max-w-4xl mx-auto animate-fade-in pb-20 lg:pb-0">
                
                {isDisqualified ? (
                    <div className="bg-white rounded-2xl p-6 lg:p-8 border border-slate-200 text-center mt-4 lg:mt-0">
                        <h3 className="text-lg lg:text-xl font-bold text-slate-900 mb-4">Security Violation Report</h3>
                        <p className="text-slate-600 mb-6">This session was flagged for suspicious activity inconsistent with our proctoring guidelines.</p>
                        <div className="inline-block text-left bg-slate-50 p-6 rounded-xl border border-slate-100 w-full">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reason</div>
                            <div className="font-mono text-rose-600 text-sm lg:text-base">{result.terminationReason}</div>
                        </div>
                    </div>
                ) : (
                    <>
                    {/* Overview Tab Content */}
                    {activeTab === 'overview' && (
                    <div className="space-y-6 lg:space-y-12">
                        
                        {/* --- NEW SUCCESS BANNER --- */}
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center shadow-sm">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-emerald-900">Interview Successfully Completed</h3>
                            <p className="text-emerald-700 text-sm mt-1">Thank you for your time and effort in completing the assessment.</p>
                        </div>

                        {/* Executive Summary */}
                        <div>
                            <h3 className="text-sm lg:text-lg font-bold text-slate-900 mb-3 lg:mb-6 flex items-center gap-2">
                                <span className="bg-indigo-100 text-indigo-600 p-1.5 lg:p-2 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 lg:w-5 lg:h-5">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                </svg>
                                </span>
                                Executive Summary
                            </h3>
                            <div className="bg-white p-5 lg:p-8 rounded-2xl shadow-sm border border-slate-100 text-slate-700 text-sm lg:text-lg leading-relaxed lg:leading-loose">
                                {result.feedback}
                            </div>
                        </div>

                        {/* Detailed Metrics Grid */}
                        <div>
                            <h3 className="text-sm lg:text-lg font-bold text-slate-900 mb-3 lg:mb-6">Competency Breakdown</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-6">
                                <div className="bg-white p-4 lg:p-6 rounded-xl border border-slate-100">
                                <div className="flex justify-between items-end mb-3 lg:mb-4">
                                    <span className="text-slate-500 font-medium text-xs lg:text-base">Technical Depth</span>
                                    <span className="text-slate-900 font-bold text-base lg:text-xl">{result.rating >= 8 ? 'High' : result.rating >= 5 ? 'Medium' : 'Low'}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 lg:h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{width: `${result.rating * 10}%`}}></div>
                                </div>
                                </div>
                                <div className="bg-white p-4 lg:p-6 rounded-xl border border-slate-100">
                                <div className="flex justify-between items-end mb-3 lg:mb-4">
                                    <span className="text-slate-500 font-medium text-xs lg:text-base">Role Fit</span>
                                    <span className="text-slate-900 font-bold text-base lg:text-xl">{result.passed ? 'Strong' : 'Weak'}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 lg:h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{width: result.passed ? '90%' : '40%'}}></div>
                                </div>
                                </div>
                            </div>
                        </div>

                        {/* --- NEW NEXT STEPS SECTION --- */}
                        <div className="bg-slate-900 rounded-2xl p-8 text-center text-white relative overflow-hidden shadow-xl">
                             <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-500/30 via-slate-900 to-slate-900"></div>
                             <div className="relative z-10">
                                 {result.passed ? (
                                     <>
                                        <h3 className="text-xl font-bold mb-3">Congratulations!</h3>
                                        <p className="text-slate-300 mb-6 max-w-lg mx-auto">You have cleared this round. To complete the internship process, please mail your resume to the following address:</p>
                                        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-6 py-4 backdrop-blur-sm">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400">
                                              <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                                              <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                                            </svg>
                                            <a href="mailto:hr@internadda.com" className="text-lg font-bold text-white hover:text-indigo-300 transition-colors">
                                                hr@internadda.com
                                            </a>
                                        </div>
                                     </>
                                 ) : (
                                     <>
                                        <h3 className="text-xl font-bold mb-2">Keep Growing</h3>
                                        <p className="text-slate-300 italic mb-4">"Success is not final, failure is not fatal: it is the courage to continue that counts."</p>
                                        <p className="text-slate-400 text-sm">Please practice your core concepts and try again. You are valuable to us, and we'd love to see you improve.</p>
                                        <button onClick={onReset} className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors text-sm">
                                            Practice & Retry
                                        </button>
                                     </>
                                 )}
                             </div>
                        </div>

                    </div>
                    )}

                    {/* Q&A Tab Content */}
                    {activeTab === 'qa' && (
                    <div className="space-y-4 lg:space-y-6">
                        {result.questions?.map((qa, idx) => (
                            <div key={idx} className="bg-white rounded-xl lg:rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                                <div className="p-4 lg:p-6 border-b border-slate-100 flex items-start gap-3 lg:gap-4">
                                <div className="flex-1">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 lg:mb-2">Question {idx + 1}</h4>
                                    <p className="text-sm lg:text-lg font-semibold text-slate-900">{qa.question}</p>
                                </div>
                                <div className={`flex flex-col items-center justify-center w-10 h-10 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl shrink-0 border ${
                                    qa.rating >= 7 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                    qa.rating >= 5 ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                    'bg-rose-50 border-rose-100 text-rose-600'
                                }`}>
                                    <span className="text-base lg:text-xl font-bold">{qa.rating}</span>
                                </div>
                                </div>
                                <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 lg:gap-6">
                                    <div>
                                        <h5 className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1 lg:mb-2">Candidate Summary</h5>
                                        <p className="text-slate-600 text-xs lg:text-sm leading-relaxed">{qa.candidateAnswerSummary}</p>
                                    </div>
                                    <div className="bg-slate-50 p-3 lg:p-4 rounded-lg lg:rounded-xl border border-slate-100">
                                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 lg:mb-2">AI Analysis</h5>
                                        <p className="text-slate-800 text-xs lg:text-sm leading-relaxed">{qa.feedback}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
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
