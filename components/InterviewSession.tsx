import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration } from '@google/genai';
import { CandidateInfo } from '../types';
import { createBlob, downsampleBuffer, decodeAudioData, decode } from '../utils/audio';

interface InterviewSessionProps {
  candidate: CandidateInfo;
  onComplete: (transcript: string, terminationReason?: string) => void;
}

const endInterviewTool: FunctionDeclaration = {
  name: "endInterview",
  description: "Ends the interview session. Call this after exactly 8 to 9 questions are completed.",
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
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

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
  const mouthRef = useRef<SVGEllipseElement>(null);
  const isConnectedRef = useRef<boolean>(false);
  const fullTranscriptHistory = useRef<string[]>([]);

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
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
  };

  const handleTermination = (reason: string) => {
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason);
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
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for(let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
      const volume = Math.min(1, (sum / (bufferLength / 2)) / 50); 
      if (mouthRef.current) {
          mouthRef.current.setAttribute('ry', (2 + (volume * 4)).toFixed(2));
      }
    };
    draw();
  };

  useEffect(() => {
    isMountedRef.current = true;
    const initSession = async () => {
      try {
        const apiKey = (process as any).env.API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass({ sampleRate: 24000 }); 
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.connect(audioContext.destination);

        const inputAudioContext = new AudioContextClass();
        inputAudioContextRef.current = inputAudioContext;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        streamRef.current = stream;
        
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor; 
        source.connect(scriptProcessor);
        const muteNode = inputAudioContext.createGain();
        muteNode.gain.value = 0;
        scriptProcessor.connect(muteNode);
        muteNode.connect(inputAudioContext.destination);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!isMountedRef.current) return;
              setStatus('connected');
              isConnectedRef.current = true;
              drawVisualizer();
              scriptProcessor.onaudioprocess = (e) => {
                if (!isConnectedRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0).slice();
                const downsampledData = downsampleBuffer(inputData, inputAudioContext.sampleRate, 16000);
                if (downsampledData.length > 0) {
                    const pcmBlob = createBlob(downsampledData, 16000);
                    sessionPromise.then(session => {
                        if (isConnectedRef.current) session.sendRealtimeInput({ media: pcmBlob });
                    });
                }
              };
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.toolCall?.functionCalls) {
                  const call = message.toolCall.functionCalls.find(f => f.name === 'endInterview');
                  if (call) handleTermination("Completed");
              }
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
                source.connect(audioContext.destination);
                source.connect(analyser);
                const startTime = Math.max(audioContext.currentTime, nextAudioStartTimeRef.current);
                source.start(startTime);
                nextAudioStartTimeRef.current = startTime + buffer.duration;
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
                text: `You are Interna, a friendly and encouraging AI interviewer from InternAdda.
                       Candidate Name: ${candidate.name}
                       Role: ${candidate.field}
                       Language: ${candidate.language}.

                       GREETING & PROTOCOL:
                       1. **Greet Warmly**: Start by saying "Hi ${candidate.name}, I'm Interna! Relax, take a deep breath, and let's have a great conversation."
                       2. **General Phase**: Ask exactly 3 general questions first (purpose of internship, motivation, and how they handle challenges).
                       3. **Technical Phase**: Ask exactly 5 to 6 focused technical questions for the role of ${candidate.field}.
                       4. **The Interview Loop**: Ask exactly 8 to 9 questions total (3 general + 5-6 technical). Ask one at a time.
                       5. **Termination (MANDATORY)**: After exactly 9 answers are received, say: "That was great! This concludes our interview. Processing your analysis now..."
                          - Then immediately call the 'endInterview' function with reason "Completed".
                       `
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
    <div className="grid grid-rows-[auto_1fr_auto] h-full w-full bg-slate-950 text-white relative overflow-hidden">
      <div className="z-20 flex items-center justify-between px-6 py-4 bg-slate-900/50 border-b border-white/5">
        <div className={`px-3 py-1 rounded-full border transition-colors ${status === 'connected' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/20 border-amber-500/30 text-amber-400'}`}>
          <span className="text-xs font-bold uppercase">{status}</span>
        </div>
        <div className="bg-slate-800 px-3 py-1 rounded-full text-slate-300 font-mono text-sm">
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>
      </div>

      <div className="relative flex items-center justify-center overflow-hidden">
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40"></canvas>
         <div className="relative z-10 flex flex-col items-center">
             <svg width="220" height="220" viewBox="0 0 200 200" fill="none">
                <rect x="20" y="20" width="160" height="160" rx="30" fill="#F1F5F9" />
                <circle cx="65" cy="80" r="12" fill="#0F172A" />
                <circle cx="135" cy="80" r="12" fill="#0F172A" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="20" ry="2" fill="#0F172A" />
             </svg>
         </div>
      </div>

      <div className="z-20 bg-slate-900 p-6 border-t border-white/10 flex justify-center gap-6">
        <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full ${isMuted ? 'bg-rose-500/20 text-rose-500' : 'bg-white/10 text-white'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
        </button>
        <button onClick={handleManualEnd} className="p-4 rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40">
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M6 6h12v12H6z"/></svg>
        </button>
        <button onClick={() => setShowTranscript(!showTranscript)} className={`p-4 rounded-full ${showTranscript ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-white'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M21 15h2v2h-2v-2zm0-4h2v2h-2v-2zm0-4h2v2h-2v-2zm-4 12h2v2h-2v-2zm-4 0h2v2h-2v-2zm-4 0h2v2h-2v-2zm-4 0h2v2h-2v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2z"/></svg>
        </button>
      </div>

      <div className={`absolute bottom-0 w-full bg-slate-900/95 border-t border-white/10 transition-all duration-500 ${showTranscript ? 'h-1/2' : 'h-0'}`}>
         <div className="p-6 overflow-y-auto h-full space-y-4">
             {transcriptLines.map((l, i) => (
                 <div key={i} className={`flex gap-3 ${l.speaker === 'ai' ? 'flex-row' : 'flex-row-reverse'}`}>
                     <div className={`p-3 rounded-2xl text-sm ${l.speaker === 'ai' ? 'bg-white/10' : 'bg-indigo-900/50 text-indigo-100'}`}>{l.text}</div>
                 </div>
             ))}
         </div>
      </div>
    </div>
  );
};
