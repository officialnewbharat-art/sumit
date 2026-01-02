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
    properties: {
      reason: { type: "STRING" as any }
    },
    required: ["reason"]
  }
};

export const InterviewSession: React.FC<InterviewSessionProps> = ({ candidate, onComplete }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<{speaker: 'user' | 'ai', text: string}[]>([]);
  const [timeLeft, setTimeLeft] = useState(600);

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
    }
    if (sessionRef.current) try { sessionRef.current.close(); } catch (e) {}
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
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
      const avg = sum / (bufferLength / 2);
      const volume = Math.min(1, avg / 50); 
      if (mouthRef.current) mouthRef.current.setAttribute('ry', (2 + (volume * 6)).toFixed(2));
      const waves = [{ f: 0.01, s: 0.2, a: 10, o: 0.8 }, { f: 0.015, s: 0.15, a: 15, o: 0.4 }];
      waves.forEach((w) => {
          ctx.beginPath(); ctx.strokeStyle = '#6366f1'; ctx.globalAlpha = w.o; ctx.lineWidth = 2;
          for (let x = 0; x < width; x++) {
              const y = centerY + Math.sin(x * w.f + time * w.s) * ((w.a * volume * 2) + 2);
              if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
      });
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
        streamRef.current = stream;
        const inputAudioContext = new AudioContext();
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
                const downsampled = downsampleBuffer(e.inputBuffer.getChannelData(0).slice(), inputAudioContext.sampleRate, 16000);
                sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(downsampled, 16000) }));
              };
            },
            onmessage: async (m: LiveServerMessage) => {
              if (m.toolCall?.functionCalls?.find(f => f.name === 'endInterview')) handleTermination("Completed");
              if (m.serverContent?.modelTurn?.parts?.[0]?.text) {
                  const t = m.serverContent.modelTurn.parts[0].text;
                  setTranscriptLines(p => [...p, { speaker: 'ai', text: t }]);
                  fullTranscriptHistory.current.push(`AI: ${t}`);
              }
              if (m.serverContent?.inputTranscription?.text) {
                  const t = m.serverContent.inputTranscription.text;
                  setTranscriptLines(p => [...p, { speaker: 'user', text: t }]);
                  fullTranscriptHistory.current.push(`User: ${t}`);
              }
              if (m.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                const buffer = await decodeAudioData(decode(m.serverContent.modelTurn.parts[0].inlineData.data), audioContext, 24000, 1);
                const s = audioContext.createBufferSource(); s.buffer = buffer; s.connect(analyser);
                const start = Math.max(audioContext.currentTime, nextAudioStartTimeRef.current);
                s.start(start); nextAudioStartTimeRef.current = start + buffer.duration;
              }
            },
            onerror: () => setStatus('error'),
          },
          config: {
            responseModalities: ["AUDIO" as any], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            tools: [{ functionDeclarations: [endInterviewTool] }],
            systemInstruction: { parts: [{ text: `Interview ${candidate.name} for ${candidate.field}. Ask 9 questions total then end.` }] }
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
      {/* CLEAN HEADER - Removed status dots as requested */}
      <div className="z-20 flex items-center justify-between px-8 py-5 bg-slate-900/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 leading-none mb-1">Live Session</span>
          <span className="text-sm font-bold text-slate-200">INTERNA AI INTERVIEWER</span>
        </div>
        <div className="flex items-center px-4 py-2 bg-slate-950/50 rounded-xl border border-white/5 gap-3">
          <span className="font-mono text-lg font-bold text-indigo-400">
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center">
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40"></canvas>
         <div className="relative z-10">
             <svg width="240" height="240" viewBox="0 0 200 200" fill="none">
                <rect x="20" y="20" width="160" height="160" rx="40" fill="#f8fafc" />
                <circle cx="65" cy="85" r="10" fill="#0f172a" />
                <circle cx="135" cy="85" r="10" fill="#0f172a" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="25" ry="2" fill="#0f172a" />
             </svg>
         </div>
      </div>

      <div className="z-20 bg-slate-900/90 backdrop-blur-md border-t border-white/10 p-8 flex justify-center items-center gap-10">
        <button onClick={() => setIsMuted(!isMuted)} className={`p-5 rounded-3xl ${isMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
        </button>
        <button onClick={() => handleTermination("Manual End")} className="p-6 rounded-[2rem] bg-rose-500 text-white shadow-lg">
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M6 6h12v12H6z"/></svg>
        </button>
        <button onClick={() => setShowTranscript(!showTranscript)} className={`p-5 rounded-3xl ${showTranscript ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M21 15h2v2h-2v-2zM21 11h2v2h-2v-2zM21 7h2v2h-2v-2z"/></svg>
        </button>
      </div>

      <div className={`absolute bottom-0 w-full bg-slate-950 border-t border-white/10 transition-all duration-500 z-30 ${showTranscript ? 'h-[60%]' : 'h-0'}`}>
         <div className="p-8 overflow-y-auto h-full space-y-4">
             {transcriptLines.map((l, i) => (
                 <div key={i} className={`flex ${l.speaker === 'ai' ? 'justify-start' : 'justify-end'}`}>
                     <div className={`p-4 rounded-2xl text-sm ${l.speaker === 'ai' ? 'bg-slate-800' : 'bg-indigo-600'}`}>{l.text}</div>
                 </div>
             ))}
         </div>
      </div>
    </div>
  );
};
