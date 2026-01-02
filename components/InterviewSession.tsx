import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration } from '@google/genai';
import { CandidateInfo } from '../types';
import { createBlob, downsampleBuffer, decodeAudioData, decode } from '../utils/audio';

interface InterviewSessionProps {
  candidate: CandidateInfo;
  onComplete: (transcript: string, terminationReason?: string, timeLeftAtEnd?: number) => void;
}

const endInterviewTool: FunctionDeclaration = {
  name: "endInterview",
  description: "Ends the interview session. Call this when exactly 8 to 9 questions are completed or the user requests to end.",
  parameters: {
    type: "OBJECT" as any,
    properties: {
      reason: { 
        type: "STRING" as any,
        description: "The reason for ending the interview."
      }
    },
    required: ["reason"]
  }
};

export const InterviewSession: React.FC<InterviewSessionProps> = ({ candidate, onComplete }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<{speaker: 'user' | 'ai', text: string}[]>([]);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

  // Refs
  const isMountedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAudioStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const terminationTriggeredRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  
  const mouthRef = useRef<SVGEllipseElement>(null);
  const fullTranscriptHistory = useRef<string[]>([]);
  const timeLeftRef = useRef<number>(600);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  const disconnect = () => {
    isConnectedRef.current = false;
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); sessionRef.current = null; } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') inputAudioContextRef.current.close();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
  };

  const handleTermination = (reason: string) => {
      if (terminationTriggeredRef.current) return;
      terminationTriggeredRef.current = true;
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason, timeLeftRef.current);
      }, 2000);
  };

  useEffect(() => {
    if (status === 'connected') {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleTermination("Time Limit Exceeded");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [status]);

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    
    const resize = () => {
        if (!canvas.parentElement) return;
        canvas.width = canvas.parentElement.clientWidth * dpr;
        canvas.height = canvas.parentElement.clientHeight * dpr;
        ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resize);
    resize();
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let time = 0;
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const centerY = height / 2;
      time += 0.05;
      ctx.clearRect(0, 0, width, height);
      
      let sum = 0;
      for(let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
      const avg = sum / (bufferLength / 2);
      const volume = Math.min(1, avg / 50); 

      if (mouthRef.current) {
          const baseRy = 2;
          const maxRy = 8;
          mouthRef.current.setAttribute('ry', (baseRy + (volume * (maxRy - baseRy))).toFixed(2));
      }

      const waves = [
        { freq: 0.01, speed: 0.2, amp: 10, alpha: 0.8, color: '#6366f1' },
        { freq: 0.015, speed: 0.15, amp: 15, alpha: 0.4, color: '#a5b4fc' },
        { freq: 0.008, speed: 0.1, amp: 20, alpha: 0.2, color: '#312e81' }
      ];

      waves.forEach((w) => {
          ctx.beginPath();
          ctx.strokeStyle = w.color;
          ctx.globalAlpha = w.alpha;
          ctx.lineWidth = 2;
          const currentAmp = (w.amp * volume * 2) + 2; 

          for (let x = 0; x < width; x++) {
              const y = centerY + Math.sin(x * w.freq + time * w.speed) * currentAmp;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };
    draw();
  };

  useEffect(() => {
    isMountedRef.current = true;
    const initSession = async () => {
      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.API_KEY || "";
        const ai = new GoogleGenAI({ apiKey });
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass({ sampleRate: 24000 }); 
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        analyser.connect(audioContext.destination);
        drawVisualizer();

        const inputAudioContext = new AudioContextClass();
        inputAudioContextRef.current = inputAudioContext;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor; 
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              setStatus('connected');
              isConnectedRef.current = true;
              scriptProcessor.onaudioprocess = (e) => {
                if (!isConnectedRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0).slice();
                const downsampledData = downsampleBuffer(inputData, inputAudioContext.sampleRate, 16000);
                sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(downsampledData, 16000) }));
              };
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.toolCall?.functionCalls?.find(f => f.name === 'endInterview')) handleTermination("Completed");
              if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                const text = message.serverContent.modelTurn.parts[0].text.trim();
                setTranscriptLines(prev => [...prev, { speaker: 'ai', text }]);
                fullTranscriptHistory.current.push(`AI: ${text}`);
              }
              if (message.serverContent?.inputTranscription?.text) {
                  const text = message.serverContent.inputTranscription.text;
                  setTranscriptLines(prev => [...prev, { speaker: 'user', text }]);
                  fullTranscriptHistory.current.push(`User: ${text}`);
              }
              if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
                const buffer = await decodeAudioData(decode(audioData), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(analyser);
                const startTime = Math.max(audioContext.currentTime, nextAudioStartTimeRef.current);
                source.start(startTime);
                nextAudioStartTimeRef.current = startTime + buffer.duration;
                sourcesRef.current.add(source);
              }
            },
            onerror: () => setStatus('error'),
          },
          config: {
            responseModalities: ["AUDIO" as any], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            tools: [{ functionDeclarations: [endInterviewTool] }],
            systemInstruction: {
              parts: [{
                text: `You are Interna, an AI interviewer. Greet ${candidate.name} warmly. Ask 3 general and 6 technical questions for ${candidate.field} role one by one. After 9 answers, call endInterview.`
              }]
            }
          }
        });
        sessionRef.current = await sessionPromise;
      } catch (e) { setStatus('error'); }
    };
    initSession();
    return () => { isMountedRef.current = false; disconnect(); };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-slate-100 overflow-hidden">
      {/* ENHANCED UI HEADER */}
      <div className="z-20 flex items-center justify-between px-8 py-5 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full shadow-[0_0_12px] ${status === 'connected' ? 'bg-emerald-400 shadow-emerald-500/50 animate-pulse' : 'bg-amber-400 shadow-amber-500/50'}`}></div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 leading-none mb-1">Live Interview</span>
            <span className="text-sm font-bold text-slate-200">INTERNA AI SESSION</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center px-4 py-2 bg-slate-950/50 rounded-xl border border-white/5 gap-3">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="font-mono text-lg font-bold text-indigo-400">
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* VISUALIZER SECTION */}
      <div className="relative flex-1 flex items-center justify-center">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1e1b4b_0%,_#020617_70%)] opacity-40"></div>
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60"></canvas>
         
         <div className="relative z-10 scale-110">
             <div className="absolute inset-0 bg-indigo-500/10 blur-[60px] rounded-full"></div>
             <svg width="240" height="240" viewBox="0 0 200 200" fill="none" className="drop-shadow-2xl">
                <rect x="20" y="20" width="160" height="160" rx="40" fill="#f8fafc" />
                <circle cx="65" cy="85" r="10" fill="#0f172a" />
                <circle cx="135" cy="85" r="10" fill="#0f172a" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="25" ry="2" fill="#0f172a" />
             </svg>
         </div>
      </div>

      {/* ENHANCED CONTROLS */}
      <div className="z-20 bg-slate-900/90 backdrop-blur-md border-t border-white/10 p-8 flex justify-center items-center gap-10">
        <button onClick={() => setIsMuted(!isMuted)} className={`group p-5 rounded-3xl transition-all duration-300 ${isMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
        </button>
        
        <button onClick={() => handleTermination("User End")} className="p-6 rounded-[2rem] bg-rose-500 text-white shadow-[0_0_25px_rgba(244,63,94,0.4)] hover:scale-105 active:scale-95 transition-all">
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M6 6h12v12H6z"/></svg>
        </button>

        <button onClick={() => setShowTranscript(!showTranscript)} className={`p-5 rounded-3xl transition-all ${showTranscript ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M21 15h2v2h-2v-2zM21 11h2v2h-2v-2zM21 7h2v2h-2v-2z"/></svg>
        </button>
      </div>

      {/* TRANSCRIPT OVERLAY */}
      <div className={`absolute bottom-0 w-full bg-slate-950/95 backdrop-blur-2xl border-t border-white/10 transition-all duration-700 ease-in-out z-30 ${showTranscript ? 'h-[60%]' : 'h-0'}`}>
         <div className="p-8 overflow-y-auto h-full space-y-6 max-w-2xl mx-auto">
             <div className="flex justify-center mb-4">
                 <div className="w-12 h-1.5 bg-slate-800 rounded-full"></div>
             </div>
             {transcriptLines.map((l, i) => (
                 <div key={i} className={`flex ${l.speaker === 'ai' ? 'justify-start' : 'justify-end'}`}>
                     <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${l.speaker === 'ai' ? 'bg-slate-800 text-slate-200 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-500/20'}`}>
                        {l.text}
                     </div>
                 </div>
             ))}
         </div>
      </div>
    </div>
  );
};
