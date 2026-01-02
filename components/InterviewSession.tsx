import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration } from '@google/genai';
import { CandidateInfo } from '../types';
import { createBlob, downsampleBuffer, decodeAudioData, decode } from '../utils/audio';

interface InterviewSessionProps {
  candidate: CandidateInfo;
  onComplete: (transcript: string, terminationReason?: string, timeLeftAtEnd?: number) => void;
}

// Define the tool for ending the interview
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
  const isAiSpeakingRef = useRef<boolean>(false);
  
  // Robot Mouth Ref
  const mouthRef = useRef<SVGEllipseElement>(null);
  
  const fullTranscriptHistory = useRef<string[]>([]);
  const timeLeftRef = useRef<number>(600);

  // Sync ref with state for the callback
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
      try { 
          sessionRef.current.close(); 
          sessionRef.current = null;
      } catch (e) { 
          console.warn("Error closing session", e); 
      }
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextAudioStartTimeRef.current = 0;
  };

  const handleTermination = (reason: string) => {
      if (terminationTriggeredRef.current) return;
      terminationTriggeredRef.current = true;
      
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason, timeLeftRef.current);
      }, 2000);
  };

  const handleManualEnd = () => {
      handleTermination("User Requested End");
  };

  // TIMER LOGIC
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

  // --- VISUALIZER & ROBOT ANIMATION LOGIC ---
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

      // Robot Mouth sync
      if (mouthRef.current) {
          const baseRy = 2;
          const maxRy = 8;
          const currentRy = baseRy + (volume * (maxRy - baseRy));
          mouthRef.current.setAttribute('ry', currentRy.toFixed(2));
      }

      // Waveform visuals
      const gradient = ctx.createLinearGradient(0, centerY - 50, 0, centerY + 50);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)'); 
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      const waves = [
        { freq: 0.01, speed: 0.2, amp: 4, alpha: 1.0, width: 2 },
        { freq: 0.015, speed: 0.15, amp: 8, alpha: 0.4, width: 1 },
        { freq: 0.008, speed: 0.1, amp: 12, alpha: 0.1, width: 1 }
      ];

      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';

      waves.forEach((w) => {
          ctx.beginPath();
          ctx.strokeStyle = w.alpha === 1.0 ? gradient : `rgba(255, 255, 255, ${w.alpha})`;
          ctx.lineWidth = w.width;
          const currentAmp = (w.amp * volume * 1.2) + (volume > 0.05 ? 2 : 1); 

          for (let x = 0; x < width; x++) {
              const y = centerY + Math.sin(x * w.freq + time * w.speed) * currentAmp;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
      });
      
      ctx.shadowBlur = 0; 
    };
    draw();
  };

  useEffect(() => {
    isMountedRef.current = true;

    const initSession = async () => {
      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.API_KEY || "";
        if (!apiKey) {
            console.error("Missing API Key");
            setStatus('error');
            return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        const audioContext = new AudioContextClass({ sampleRate: 24000 }); 
        audioContextRef.current = audioContext;
        if (audioContext.state === 'suspended') await audioContext.resume();

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        const outputNode = audioContext.createGain();
        outputNode.connect(analyser);
        analyser.connect(audioContext.destination);
        drawVisualizer();

        const inputAudioContext = new AudioContextClass();
        inputAudioContextRef.current = inputAudioContext;
        if (inputAudioContext.state === 'suspended') await inputAudioContext.resume();
        const currentSampleRate = inputAudioContext.sampleRate;

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true,
            }, 
            video: true 
        });
        streamRef.current = stream;

        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor; 
        
        source.connect(scriptProcessor);
        const muteNode = inputAudioContext.createGain();
        muteNode.gain.value = 0;
        scriptProcessor.connect(muteNode);
        muteNode.connect(inputAudioContext.destination);

        if (!isMountedRef.current) return;

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!isMountedRef.current) {
                  sessionPromise.then(s => s.close());
                  return;
              }

              setStatus('connected');
              isConnectedRef.current = true;
              nextAudioStartTimeRef.current = 0;

              scriptProcessor.onaudioprocess = (e) => {
                if (!isConnectedRef.current || !isMountedRef.current) return;
                
                const inputData = e.inputBuffer.getChannelData(0).slice();
                
                // Basic VAD
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (rms > 0.03) {
                    setIsUserSpeaking(true);
                } else {
                    setIsUserSpeaking(false);
                }
                
                const downsampledData = downsampleBuffer(inputData, currentSampleRate, 16000);
                
                if (downsampledData.length > 0) {
                    const pcmBlob = createBlob(downsampledData, 16000);
                    sessionPromise.then(session => {
                        if (isConnectedRef.current && isMountedRef.current) {
                            try {
                                session.sendRealtimeInput({ media: pcmBlob });
                            } catch (e) {}
                        }
                    });
                }
              };
            },
            onmessage: async (message: LiveServerMessage) => {
              const hasContent = !!message.serverContent;
              const isInterrupted = message.serverContent?.interrupted;

              if (message.toolCall?.functionCalls) {
                  const call = message.toolCall.functionCalls.find(f => f.name === 'endInterview');
                  if (call) handleTermination("Completed");
              }

              if (isInterrupted) {
                  sourcesRef.current.forEach(source => {
                      try { source.stop(); } catch(e) {}
                  });
                  sourcesRef.current.clear();
                  nextAudioStartTimeRef.current = 0;
              }

              if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                const text = message.serverContent.modelTurn.parts[0].text.trim();
                if (text) {
                    setTranscriptLines(prev => [...prev, { speaker: 'ai', text }]);
                    fullTranscriptHistory.current.push(`AI: ${text}`);
                }
              }

              if (message.serverContent?.inputTranscription?.text) {
                  const text = message.serverContent.inputTranscription.text;
                  setTranscriptLines(prev => [...prev, { speaker: 'user', text }]);
                  fullTranscriptHistory.current.push(`User: ${text}`);
              }

              if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
                if (audioData && audioContextRef.current) {
                  const ctx = audioContextRef.current;
                  const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                  const source = ctx.createBufferSource();
                  source.buffer = buffer;
                  source.connect(ctx.destination);
                  if (analyserRef.current) source.connect(analyserRef.current);
                  const startTime = Math.max(ctx.currentTime, nextAudioStartTimeRef.current);
                  source.start(startTime);
                  nextAudioStartTimeRef.current = startTime + buffer.duration;
                  sourcesRef.current.add(source);
                  source.onended = () => sourcesRef.current.delete(source);
                }
              }
            },
            onerror: () => setStatus('error'),
          },
          config: {
            responseModalities: ["AUDIO" as any], 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } 
            },
            tools: [{ functionDeclarations: [endInterviewTool] }],
            systemInstruction: {
              parts: [{
                text: `You are Interna, a friendly AI interviewer from InternAdda. Candidate: ${candidate.name}, Role: ${candidate.field}.
                Language: ${candidate.language}.
                
                GREETING & PROTOCOL:
                1. **Greet Warmly**: Start by saying "Hi ${candidate.name}, I'm Interna! Relax, take a deep breath, and let's have a great conversation."
                2. **General Phase**: Ask exactly 3 general ice-breaker questions (purpose of internship, motivation, handling challenges).
                3. **Technical Phase**: Ask exactly 5 to 6 focused technical questions for the role of ${candidate.field}.
                4. **Total Questions**: You must ask a total of 8 to 9 questions one by one.
                5. **Termination**: After exactly 9 answers are received, say: "That was great! This concludes our interview. Processing your analysis now..." then call endInterview.`
              }]
            }
          }
        });
        
        sessionRef.current = await sessionPromise;

      } catch (e) {
        setStatus('error');
      }
    };

    initSession();
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
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
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950 to-slate-950"></div>
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80 z-0"></canvas>
         <div className="relative z-10 flex flex-col items-center">
             <svg width="220" height="220" viewBox="0 0 200 200" fill="none" className={`transition-all duration-500 ${status === 'connected' ? 'drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]' : 'opacity-50 grayscale'}`}>
                <rect x="20" y="20" width="160" height="160" rx="30" fill="#F1F5F9" />
                <circle cx="65" cy="80" r="12" fill="#0F172A" />
                <circle cx="135" cy="80" r="12" fill="#0F172A" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="20" ry="2" fill="#0F172A" />
             </svg>
         </div>
      </div>

      <div className="z-20 bg-slate-900 border-t border-white/10 p-6 flex justify-center gap-6">
        <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full ${isMuted ? 'bg-rose-500/20 text-rose-500' : 'bg-white/10 text-white'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
        </button>
        <button onClick={handleManualEnd} className="p-4 rounded-full bg-rose-500 text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M6 6h12v12H6z"/></svg></button>
        <button onClick={() => setShowTranscript(!showTranscript)} className={`p-4 rounded-full ${showTranscript ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-white'}`}>
           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M21 15h2v2h-2v-2zM21 11h2v2h-2v-2zM21 7h2v2h-2v-2z"/></svg>
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
