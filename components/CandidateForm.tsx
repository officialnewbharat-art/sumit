import React, { useState } from 'react';
import { CandidateInfo } from '../types';

interface CandidateFormProps {
  onSubmit: (info: CandidateInfo) => void;
}

const PREDEFINED_ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Mobile Developer (iOS/Android)",
  "Data Scientist",
  "Machine Learning Engineer",
  "Product Manager",
  "UI/UX Designer",
  "QA Automation Engineer",
  "Cybersecurity Analyst",
  "Cloud Architect"
];

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Hindi",
  "Portuguese",
  "Chinese (Mandarin)",
  "Japanese"
];

export const CandidateForm: React.FC<CandidateFormProps> = ({ onSubmit }) => {
  const [name, setName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [field, setField] = useState('');
  const [language, setLanguage] = useState('English');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && jobDescription && field && language) {
      onSubmit({ name, jobDescription, field, language });
    }
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-full w-full animate-fade-in">
      
      {/* Left Panel: Branding & Context */}
      <div className="lg:col-span-5 bg-slate-900 relative overflow-hidden flex flex-col justify-end lg:justify-center p-8 pt-24 lg:p-20 text-white min-h-[30vh] lg:min-h-0 shrink-0">
        <div className="absolute inset-0 opacity-30">
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-slate-900 to-slate-900"></div>
        </div>
        
        <div className="relative z-10 space-y-4 lg:space-y-6">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] lg:text-xs font-bold uppercase tracking-widest">AI-Powered Assessment</span>
           </div>
           
           <h1 className="text-3xl md:text-4xl lg:text-6xl font-bold tracking-tight leading-tight">
             Meet <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Evalya</span>.
           </h1>
           
           <p className="text-xl md:text-2xl lg:text-3xl font-light text-slate-200 leading-tight">
             Your impartial, AI-driven technical interviewer.
           </p>
           
           <p className="text-sm lg:text-lg text-slate-400 max-w-md leading-relaxed hidden md:block">
             Conduct realistic voice interviews tailored to specific job descriptions. Get instant, unbiased feedback on technical accuracy with our proctoring engine.
           </p>
        </div>
      </div>

      {/* Right Panel: Form */}
      <div className="lg:col-span-7 bg-white flex flex-col flex-1 overflow-y-auto">
        <div className="flex-1 p-6 md:p-12 lg:p-24">
            <div className="max-w-xl w-full mx-auto">
            <div className="mb-8 lg:mb-10">
                <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Candidate Profile</h2>
                <p className="text-sm lg:text-base text-slate-500 mt-2">Configure Evalya with the interview context.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 lg:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group">
                    <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 group-focus-within:text-indigo-600 transition-colors">Full Name</label>
                    <input
                        type="text"
                        id="name"
                        required
                        className="w-full px-0 py-2 lg:py-3 bg-transparent border-b-2 border-slate-200 focus:border-indigo-600 outline-none transition-all placeholder:text-slate-300 font-medium text-base lg:text-lg text-slate-900"
                        placeholder="Jane Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    </div>

                    <div className="group">
                    <label htmlFor="language" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 group-focus-within:text-indigo-600 transition-colors">Interview Language</label>
                    <div className="relative">
                      <select
                          id="language"
                          required
                          className="w-full px-0 py-2 lg:py-3 bg-transparent border-b-2 border-slate-200 focus:border-indigo-600 outline-none transition-all font-medium text-base lg:text-lg text-slate-900 appearance-none cursor-pointer"
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                      >
                          {LANGUAGES.map((lang) => (
                              <option key={lang} value={lang}>{lang}</option>
                          ))}
                      </select>
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    </div>
                </div>

                <div className="group">
                    <label htmlFor="field" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 group-focus-within:text-indigo-600 transition-colors">Role Title</label>
                    <div className="relative">
                      <select
                          id="field"
                          required
                          className="w-full px-0 py-2 lg:py-3 bg-transparent border-b-2 border-slate-200 focus:border-indigo-600 outline-none transition-all font-medium text-base lg:text-lg text-slate-900 appearance-none cursor-pointer"
                          value={field}
                          onChange={(e) => setField(e.target.value)}
                      >
                          <option value="" disabled className="text-slate-300">Select a role...</option>
                          {PREDEFINED_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                          ))}
                      </select>
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    </div>

                <div className="group">
                <label htmlFor="jd" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 group-focus-within:text-indigo-600 transition-colors">Job Description / Context</label>
                <textarea
                    id="jd"
                    required
                    rows={5}
                    className="w-full px-4 py-3 lg:py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-all resize-none placeholder:text-slate-300 text-sm leading-relaxed text-slate-700"
                    placeholder="Paste the full job description, key requirements, or specific topics to cover..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                />
                </div>

                <div className="pt-4 lg:pt-6 pb-8">
                <button
                    type="submit"
                    className="group w-full bg-slate-900 text-white py-4 lg:py-5 rounded-xl font-bold hover:bg-indigo-600 transition-all duration-300 shadow-xl hover:shadow-indigo-200 hover:-translate-y-1 flex items-center justify-between px-6 lg:px-8"
                >
                    <span>Initialize Evalya</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 group-hover:translate-x-1 transition-transform">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                    </svg>
                </button>
                </div>
            </form>
            </div>
        </div>
      </div>
    </div>
  );
};
