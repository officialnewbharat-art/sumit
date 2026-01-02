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
  description: "Ends the interview session. Call this when 5 questions are completed or the user requests to end.",
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
  const [silenceTriggered, setSilenceTriggered] = useState(false);
  const [systemMessageStatus, setSystemMessageStatus] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); 

  const isMountedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAudioStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>(0);
  const terminationTriggeredRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const lastUserSpeechTimeRef = useRef<number>(Date.now());
  const noiseFloorRef = useRef<number>(0.002); 
  const fullTranscriptHistory = useRef<string[]>([]);
  const isWaitingForResponseRef = useRef<boolean>(false);
  const lastAiTurnEndTimeRef = useRef<number>(0);
  const isProcessingTimeoutRef = useRef<boolean>(false);
  const silenceWarningCountRef = useRef<number>(0);

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
    nextAudioStartTimeRef.current = 0;
  };

  const handleTermination = (reason: string) => {
      if (terminationTriggeredRef.current) return;
      terminationTriggeredRef.current = true;
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason);
      }, 2000);
  };

  const handleManualEnd = () => handleTermination("User Requested End");

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
        canvas.width = canvas.parentElement?.clientWidth! * dpr;
        canvas.height = canvas.parentElement?.clientHeight! * dpr;
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
          const maxRy = 6;
          const currentRy = baseRy + (volume * (maxRy - baseRy));
          mouthRef.current.setAttribute('ry', currentRy.toFixed(2));
      }
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
        const apiKey = process.env.API_KEY;
        if (!apiKey) { setStatus('error'); return; }
        const ai = new GoogleGenAI({ apiKey });
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass({ sampleRate: 24000 }); 
        audioContextRef.current = audioContext;
        if (audioContext.state === 'suspended') await audioContext.resume();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        const outputNode = audioContext.createGain();
        outputNode.connect(analyser);
        analyser.connect(audioContext.destination);
        drawVisualizer();
        const inputAudioContext = new AudioContextClass();
        inputAudioContextRef.current = inputAudioContext;
        if (inputAudioContext.state === 'suspended') await inputAudioContext.resume();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const source = inputAudioContext.createMediaStreamSource(stream);
        const inputGain = inputAudioContext.createGain();
        inputGainRef.current = inputGain;
        source.connect(inputGain);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor; 
        inputGain.connect(scriptProcessor);
        const muteNode = inputAudioContext.createGain();
        muteNode.gain.value = 0;
        scriptProcessor.connect(muteNode);
        muteNode.connect(inputAudioContext.destination);
        if (!isMountedRef.current) return;
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!isMountedRef.current) { sessionPromise.then(s => s.close()); return; }
              setStatus('connected');
              isConnectedRef.current = true;
              scriptProcessor.onaudioprocess = (e) => {
                if (!isConnectedRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0).slice();
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (rms > 0.03) {
                    lastUserSpeechTimeRef.current = Date.now();
                    setIsUserSpeaking(true);
                    isWaitingForResponseRef.current = false;
                    setSystemMessageStatus(null);
                    silenceWarningCountRef.current = 0;
                } else setIsUserSpeaking(false);
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
              const hasContent = !!message.serverContent;
              const isTurnComplete = message.serverContent?.turnComplete;
              const isInterrupted = message.serverContent?.interrupted;
              if (message.toolCall?.functionCalls) {
                  const call = message.toolCall.functionCalls.find(f => f.name === 'endInterview');
                  if (call) handleTermination((call.args as any)?.reason || "Completed");
              }
              if (isInterrupted) {
                  sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
                  sourcesRef.current.clear();
                  nextAudioStartTimeRef.current = 0;
                  isAiSpeakingRef.current = false;
                  isWaitingForResponseRef.current = false;
                  isProcessingTimeoutRef.current = false;
              }
              if (hasContent) { isAiSpeakingRef.current = true; isWaitingForResponseRef.current = false; isProcessingTimeoutRef.current = false; }
              if (isTurnComplete) { isAiSpeakingRef.current = false; lastAiTurnEndTimeRef.current = Date.now(); isWaitingForResponseRef.current = true; }
              if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                const text = message.serverContent.modelTurn.parts[0].text.trim();
                if (text) {
                    setTranscriptLines(prev => {
                        const last = prev[prev.length - 1];
                        return last?.speaker === 'ai' ? [...prev.slice(0, -1), { ...last, text: last.text + ' ' + text }] : [...prev, { speaker: 'ai', text }];
                    });
                    fullTranscriptHistory.current.push(`AI: ${text}`);
                }
              }
              if (message.serverContent?.inputTranscription?.text) {
                  const text = message.serverContent.inputTranscription.text;
                  setTranscriptLines(prev => {
                      const last = prev[prev.length - 1];
                      return last?.speaker === 'user' ? [...prev.slice(0, -1), { ...last, text: last.text + text }] : [...prev, { speaker: 'user', text }];
                  });
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
            onclose: () => { if (isConnectedRef.current) setStatus('connecting'); }
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
                       Language: ${candidate.language}. SPEAK ONLY IN ${candidate.language}.

                       GREETING & PROTOCOL:
                       1. **Greet Warmly**: Start by saying "Hi ${candidate.name}, I'm Interna! Relax, take a deep breath, and let's have a great conversation."
                       2. **General Phase**: Ask 2 general ice-breaker questions first:
                          - "What is your main purpose for seeking this internship? Is it for the experience, the money, or building your career?"
                          - "How do you usually stay motivated when learning new things?"
                       3. **Technical Phase**: Ask 3 focused technical questions for the role of ${candidate.field}.
                       4. **The Interview Loop**: Ask exactly 5 questions total. Ask one at a time. Listen to their answers and provide brief encouraging feedback before the next question.
                       5. **Termination (MANDATORY)**: After exactly 5 answers are received, say: "That was great! This concludes our interview. Processing your analysis now..."
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

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted);
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] h-full w-full bg-slate-950 text-white relative overflow-hidden">
      <div className="z-20 flex items-center justify-between px-6 py-4 bg-slate-900/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${status === 'connected' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/20 border-amber-500/30 text-amber-400'}`}>
               <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-current'}`}></span>
               <span className="text-xs font-bold uppercase">{status}</span>
           </div>
           <div className="flex items-center gap-2 px-3 py-1 rounded-full border bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm">
              <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
           </div>
        </div>
      </div>
      <div className="relative flex items-center justify-center overflow-hidden">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950 to-slate-950"></div>
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80 z-0"></canvas>
         <div className="relative z-10 flex flex-col items-center justify-center">
             <svg width="220" height="220" viewBox="0 0 200 200" fill="none" className={`transition-all duration-500 ${status === 'connected' ? 'drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]' : 'opacity-50 grayscale'}`}>
                <rect x="20" y="20" width="160" height="160" rx="30" fill="#F1F5F9" />
                <circle cx="65" cy="80" r="12" fill="#0F172A" />
                <circle cx="135" cy="80" r="12" fill="#0F172A" />
                <ellipse ref={mouthRef} cx="100" cy="135" rx="20" ry="2" fill="#0F172A" />
             </svg>
             <div className="mt-8 text-center min-h-[24px]">
                 {status === 'connecting' && <p className="text-indigo-300 animate-pulse">Connecting to Interna...</p>}
             </div>
         </div>
      </div>
      <div className="z-20 bg-slate-900 border-t border-white/10 p-6">
         <div className="max-w-md mx-auto flex items-center justify-between gap-6">
            <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? 'bg-rose-500/20 text-rose-500' : 'bg-white/10 text-white'}`}>
               {isMuted ? <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18z" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /></svg>}
            </button>
            <button onClick={handleManualEnd} className="p-4 rounded-full bg-rose-500/20 text-rose-500"><svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" /></svg></button>
            <button onClick={() => setShowTranscript(!showTranscript)} className={`p-4 rounded-full ${showTranscript ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-white'}`}><svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3 4.5A1.5 1.5 0 014.5 3h15a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-15z" /></svg></button>
         </div>
      </div>
      <div className={`absolute inset-x-0 bottom-0 z-10 bg-slate-900/95 backdrop-blur-xl transition-transform duration-500 ${showTranscript ? 'translate-y-0 h-[60%]' : 'translate-y-full h-0'}`}>
         <div className="h-full flex flex-col p-6 overflow-y-auto">
             <div className="space-y-4">
                 {transcriptLines.map((line, idx) => (
                     <div key={idx} className={`flex gap-3 ${line.speaker === 'ai' ? 'flex-row' : 'flex-row-reverse'}`}>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center ${line.speaker === 'ai' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>{line.speaker === 'ai' ? 'AI' : 'You'}</div>
                         <div className="p-3 rounded-2xl text-sm bg-white/10">{line.text}</div>
                     </div>
                 ))}
             </div>
         </div>
      </div>
    </div>
  );
};
