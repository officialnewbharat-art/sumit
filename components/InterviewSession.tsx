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
  description: "Ends the interview session.",
  parameters: {
    type: "OBJECT" as any,
    properties: { reason: { type: "STRING" as any } },
    required: ["reason"]
  }
};

export const InterviewSession: React.FC<InterviewSessionProps> = ({ candidate, onComplete }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);

  const isMountedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAudioStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const terminationTriggeredRef = useRef<boolean>(false);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const fullTranscriptHistory = useRef<string[]>([]);
  const timeLeftRef = useRef<number>(600);

  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  const disconnect = () => {
    if (sessionRef.current) try { sessionRef.current.close(); } catch (e) {}
    if (audioContextRef.current) audioContextRef.current.close();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const handleTermination = (reason: string) => {
      if (terminationTriggeredRef.current) return;
      terminationTriggeredRef.current = true;
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason, timeLeftRef.current);
      }, 1500);
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
        canvas.width = canvas.parentElement!.clientWidth * dpr;
        canvas.height = canvas.parentElement!.clientHeight * dpr;
        ctx.scale(dpr, dpr);
    };
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
      const volume = Math.min(1, (sum / (bufferLength / 2)) / 50); 
      if (mouthRef.current) mouthRef.current.setAttribute('ry', (2 + (volume * 6)).toFixed(2));
      const waveAmp = (10 * volume * 2) + 2;
      ctx.beginPath();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      for (let x = 0; x < width; x++) {
          const y = centerY + Math.sin(x * 0.01 + time * 0.2) * waveAmp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
  };

  useEffect(() => {
    isMountedRef.current = true;
    const initSession = async () => {
      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.API_KEY || "";
        const ai = new GoogleGenAI({ apiKey });
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); 
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.connect(audioContext.destination);
        drawVisualizer();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const inputCtx = new AudioContext();
        const source = inputCtx.createMediaStreamSource(stream);
        const scriptProc = inputCtx.createScriptProcessor(4096, 1, 1);
        source.connect(scriptProc);
        scriptProc.connect(inputCtx.destination);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              setStatus('connected');
              scriptProc.onaudioprocess = (e) => {
                if (isMuted) return;
                const downsampled = downsampleBuffer(e.inputBuffer.getChannelData(0).slice(), inputCtx.sampleRate, 16000);
                sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(downsampled, 16000) }));
              };
            },
            onmessage: async (m: LiveServerMessage) => {
              if (m.toolCall?.functionCalls?.find(f => f.name === 'endInterview')) handleTermination("Completed");
              if (m.serverContent?.modelTurn?.parts?.[0]?.text) {
                  fullTranscriptHistory.current.push(`AI: ${m.serverContent.modelTurn.parts[0].text}`);
              }
              if (m.serverContent?.inputTranscription?.text) {
                  fullTranscriptHistory.current.push(`User: ${m.serverContent.inputTranscription.text}`);
              }
              if (m.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                const buffer = await decodeAudioData(decode(m.serverContent.modelTurn.parts[0].inlineData.data), audioContext, 24000, 1);
                const s = audioContext.createBufferSource(); s.buffer = buffer; s.connect(analyser);
                const start = Math.max(audioContext.currentTime, nextAudioStartTimeRef.current);
                s.start(start); nextAudioStartTimeRef.current = start + buffer.duration;
              }
            },
          },
          config: {
            responseModalities: ["AUDIO" as any], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            tools: [{ functionDeclarations: [endInterviewTool] }],
            systemInstruction: { parts: [{ text: `Interview ${candidate.name} for ${candidate.field}. Ask 9 questions then end.` }] }
          }
        });
        sessionRef.current = await sessionPromise;
      } catch (e) { setStatus('error'); }
    };
    initSession();
    return () => disconnect();
  }, [isMuted]);

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-slate-100 overflow-hidden">
      {/* Header - No dots as requested */}
      <div className="z-20 flex items-center justify-between px-8 py-5 bg-slate-900/40 backdrop-blur-xl border-b border-white/5">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-1 leading-none">AI Session</span>
          <span className="text-sm font-bold text-slate-300">INTERNA INTERVIEWER</span>
        </div>
        <div className="px-5 py-1.5 bg-slate-950/50 rounded-xl border border-white/5 font-mono text-lg font-bold text-indigo-400">
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center">
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30"></canvas>
         <div className="relative z-10">
             <svg width="240" height="240" viewBox="0 0 200 200" fill="none">
                <rect x="20" y="20" width="160" height="160" rx="40" fill="#f8fafc" />
                <circle cx="65" cy="85" r="10" fill="#0f172a" />
                <circle cx="135" cy="85" r="10" fill="#0f172a" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="25" ry="2" fill="#0f172a" />
             </svg>
         </div>
      </div>

      <div className="z-20 p-8 flex justify-center items-center gap-10 bg-slate-900/50 border-t border-white/5 backdrop-blur-md">
        {/* Animated Mute Button */}
        <button onClick={() => setIsMuted(!isMuted)} className={`p-5 rounded-3xl transition-all duration-300 ${isMuted ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse' : 'bg-slate-800 text-slate-400 border border-transparent'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
        </button>
        <button onClick={() => handleTermination("End Session")} className="p-7 rounded-[2.5rem] bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-transform hover:scale-105">
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M6 6h12v12H6z"/></svg>
        </button>
      </div>
    </div>
  );
};
