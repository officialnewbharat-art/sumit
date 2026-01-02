import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration } from '@google/genai';
import { CandidateInfo } from '../types';
import { createBlob, downsampleBuffer, decodeAudioData, decode } from '../utils/audio';

interface InterviewSessionProps {
  candidate: CandidateInfo;
  onComplete: (transcript: string, terminationReason?: string) => void;
}

// Define the tool for ending the interview with strict typing using String Literals
const endInterviewTool: FunctionDeclaration = {
  name: "endInterview",
  description: "Ends the interview session. Call this when exactly 5 questions are completed or the user requests to end.",
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
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  // Proctoring State
  const [warningCount, setWarningCount] = useState(0);
  const [violationMessage, setViolationMessage] = useState<string | null>(null);

  // Refs
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
  
  // Robot Refs
  const mouthRef = useRef<SVGEllipseElement>(null);
  
  // VAD & State Refs
  const lastUserSpeechTimeRef = useRef<number>(Date.now());
  const noiseFloorRef = useRef<number>(0.002); 
  const fullTranscriptHistory = useRef<string[]>([]);
  
  // Timeout Logic Refs
  const isWaitingForResponseRef = useRef<boolean>(false);
  const lastAiTurnEndTimeRef = useRef<number>(0);
  const isProcessingTimeoutRef = useRef<boolean>(false); 
  
  // Silence Protocol Refs
  const silenceWarningCountRef = useRef<number>(0);

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
      
      console.log(`Terminating Session: ${reason}`);
      
      setTimeout(() => {
          disconnect();
          onComplete(fullTranscriptHistory.current.join('\n'), reason);
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

  // PROCTORING LOGIC
  useEffect(() => {
      const handleVisibilityChange = () => {
          if (document.hidden) {
              triggerViolation("Tab switch detected.");
          }
      };

      const preventContextMenu = (e: Event) => e.preventDefault();

      document.addEventListener("visibilitychange", handleVisibilityChange);
      document.addEventListener("contextmenu", preventContextMenu);

      return () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          document.removeEventListener("contextmenu", preventContextMenu);
      };
  }, []);

  const triggerViolation = (msg: string) => {
      setViolationMessage(msg);
      setWarningCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
              handleTermination("Security Violation: Multiple breaches detected.");
          }
          return newCount;
      });
      setTimeout(() => setViolationMessage(null), 3000);
  };

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
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

        const source = inputAudioContext.createMediaStreamSource(stream);
        const inputGain = inputAudioContext.createGain();
        inputGainRef.current = inputGain;
        source.connect(inputGain);
        const muteNode = inputAudioContext.createGain();
        muteNode.gain.value = 0;
        
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor; 
        
        inputGain.connect(scriptProcessor);
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
              lastUserSpeechTimeRef.current = Date.now();
              nextAudioStartTimeRef.current = 0;

              scriptProcessor.onaudioprocess = (e) => {
                if (!isConnectedRef.current || !isMountedRef.current) return;
                
                const inputData = e.inputBuffer.getChannelData(0).slice();
                
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                const alpha = 0.05;
                const currentNoise = noiseFloorRef.current;
                if (rms < currentNoise) noiseFloorRef.current = (currentNoise * 0.90) + (rms * 0.10);
                else if (rms < currentNoise * 3) noiseFloorRef.current = (currentNoise * (1 - alpha)) + (rms * alpha);
                
                const detectionThreshold = Math.max(0.03, noiseFloorRef.current * 6);
                
                if (rms > detectionThreshold) {
                    lastUserSpeechTimeRef.current = Date.now();
                    setIsUserSpeaking(true);
                    isWaitingForResponseRef.current = false;
                    setSystemMessageStatus(null); 
                    silenceWarningCountRef.current = 0;
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
              const isTurnComplete = message.serverContent?.turnComplete;
              const isInterrupted = message.serverContent?.interrupted;
              const toolCall = message.toolCall;

              if (toolCall) {
                  const functionCalls = toolCall.functionCalls;
                  if (functionCalls && functionCalls.length > 0) {
                      const call = functionCalls.find(f => f.name === 'endInterview');
                      if (call) {
                          sessionPromise.then(session => {
                              session.sendToolResponse({
                                  functionResponses: functionCalls.map(fc => ({
                                      id: fc.id,
                                      name: fc.name,
                                      response: { result: "Interview Ended" }
                                  }))
                              });
                          });
                          const reason = (call.args as any)?.reason || "Completed";
                          handleTermination(reason);
                      }
                  }
              }

              if (isInterrupted) {
                  sourcesRef.current.forEach(source => {
                      try { source.stop(); } catch(e) {}
                  });
                  sourcesRef.current.clear();
                  nextAudioStartTimeRef.current = 0;
                  isAiSpeakingRef.current = false;
                  isWaitingForResponseRef.current = false;
                  setSystemMessageStatus(null);
                  isProcessingTimeoutRef.current = false;
              }

              if (hasContent) {
                  isAiSpeakingRef.current = true;
                  lastAiTurnEndTimeRef.current = 0;
                  isWaitingForResponseRef.current = false;
                  setSystemMessageStatus(null);
                  isProcessingTimeoutRef.current = false;
              }
              
              if (isTurnComplete) {
                  isAiSpeakingRef.current = false;
                  lastAiTurnEndTimeRef.current = Date.now();
                  isWaitingForResponseRef.current = true;
              }

              if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                const text = message.serverContent.modelTurn.parts[0].text;
                const displayText = text.trim();
                if (displayText) {
                    setTranscriptLines(prev => {
                        const last = prev[prev.length - 1];
                        if (last?.speaker === 'ai') {
                            return [...prev.slice(0, -1), { ...last, text: last.text + ' ' + displayText }];
                        }
                        return [...prev, { speaker: 'ai', text: displayText }];
                    });
                    
                    if (fullTranscriptHistory.current.length > 0 && fullTranscriptHistory.current[fullTranscriptHistory.current.length - 1].startsWith('AI:')) {
                         fullTranscriptHistory.current[fullTranscriptHistory.current.length - 1] += ' ' + displayText;
                    } else {
                         fullTranscriptHistory.current.push(`AI: ${displayText}`);
                    }
                }
              }

              if (message.serverContent?.inputTranscription?.text) {
                  const text = message.serverContent.inputTranscription.text;
                  if (text) {
                      setTranscriptLines(prev => {
                          const last = prev[prev.length - 1];
                          if (last?.speaker === 'user') {
                              return [...prev.slice(0, -1), { ...last, text: last.text + text }];
                          }
                          return [...prev, { speaker: 'user', text: text }];
                      });

                      if (fullTranscriptHistory.current.length > 0 && fullTranscriptHistory.current[fullTranscriptHistory.current.length - 1].startsWith('User:')) {
                           fullTranscriptHistory.current[fullTranscriptHistory.current.length - 1] += text;
                      } else {
                           fullTranscriptHistory.current.push(`User: ${text}`);
                      }
                  }
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
                  
                  const now = ctx.currentTime;
                  const startTime = Math.max(now, nextAudioStartTimeRef.current);
                  
                  source.start(startTime);
                  nextAudioStartTimeRef.current = startTime + buffer.duration;
                  
                  sourcesRef.current.add(source);
                  source.onended = () => sourcesRef.current.delete(source);
                }
              }
            },
            onerror: (e) => {
              console.error("WebSocket Error", e);
              setStatus('error');
            },
            onclose: () => {
              if (isConnectedRef.current) {
                  setStatus('connecting');
              }
            }
          },
          config: {
            responseModalities: ["AUDIO" as any], 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } 
            },
            tools: [{ functionDeclarations: [endInterviewTool] }],
            systemInstruction: {
              parts: [{
                text: `You are Interna, an expert AI technical interviewer from InternAdda.
                       Candidate Name: ${candidate.name}
                       Role: ${candidate.field}
                       Context: ${candidate.jobDescription.substring(0, 1000)}
                       Language: ${candidate.language}. SPEAK ONLY IN ${candidate.language}.

                       CORE OBJECTIVE: Ask exactly 5 technical questions. Stop and terminate immediately after the 5th answer.

                       PROTOCOL:
                       1. **Introduction**: Introduce yourself as "Interna from InternAdda" and the role.
                       2. **The Interview Loop**:
                          - You MUST ask exactly 5 distinct technical questions based on the Role/Context.
                          - Ask one question at a time.
                          - Track the question count internally.
                       3. **Termination (MANDATORY)**:
                          - After the candidate finishes answering the 5th question, you MUST say: "This concludes our interview."
                          - Immediately call the 'endInterview' function with the reason "Completed".
                          - DO NOT ask a 6th question.

                       SILENCE PROTOCOL:
                       If alert says "Candidate is silent":
                       - Say exactly: "Please start answering when you’re ready."
                       If alert says "Candidate is still silent":
                       - Treat this as a failed answer. Move to your internal next question count.
                       - Say: "I will continue to the next question." then ask the next question.
                       `
              }]
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        });
        
        sessionRef.current = await sessionPromise;

      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    };

    initSession();
    
    const sendSystemMessage = (text: string) => {
      if (sessionRef.current) {
        try {
            sessionRef.current.sendRealtimeInput({ text: text });
            setSystemMessageStatus(`System: Prompting AI (${text.includes('still') ? 'Skip' : 'Reminder'})...`);
            setSilenceTriggered(true);
            setTimeout(() => setSilenceTriggered(false), 3000);
        } catch (e) {
            console.error("Failed to send system message", e);
        }
      }
    };

    const silenceInterval = setInterval(() => {
        if (!isConnectedRef.current) return;
        const now = Date.now();
        if (isWaitingForResponseRef.current && !isAiSpeakingRef.current && !isProcessingTimeoutRef.current) {
            const timeSinceAiFinished = now - lastAiTurnEndTimeRef.current;
            if (timeSinceAiFinished > 10000) {
                isProcessingTimeoutRef.current = true;
                silenceWarningCountRef.current += 1;
                if (silenceWarningCountRef.current > 2) {
                     const silentEntry = "[No Answer - Time Limit Exceeded]";
                     setTranscriptLines(prev => [...prev, { speaker: 'user', text: silentEntry }]);
                     fullTranscriptHistory.current.push(`User: ${silentEntry}`);
                     silenceWarningCountRef.current = 0;
                     sendSystemMessage("System Alert: Candidate is still silent. Treat this as a failed answer. Say exactly: 'I will continue to the next question.' and ask the next question.");
                } else {
                     sendSystemMessage("System Alert: Candidate is silent. Say exactly: 'Please start answering when you’re ready.'");
                }
            }
        }
    }, 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(silenceInterval);
      disconnect();
    };
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
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
               status === 'connected' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 
               status === 'error' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' :
               'bg-amber-500/20 border-amber-500/30 text-amber-400'
           }`}>
               <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-current'}`}></span>
               <span className="text-xs font-bold uppercase tracking-widest">{status}</span>
           </div>
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border font-mono text-sm font-bold transition-all duration-500 ${
               timeLeft < 60 ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse' :
               timeLeft < 120 ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' :
               'bg-slate-800 border-slate-700 text-slate-300'
           }`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
           </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center overflow-hidden">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950 to-slate-950"></div>
         <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80 z-0"></canvas>
         <div className="relative z-10 flex flex-col items-center justify-center transition-transform duration-300">
             <svg 
               width="220" 
               height="220" 
               viewBox="0 0 200 200" 
               fill="none" 
               xmlns="http://www.w3.org/2000/svg"
               className={`transition-all duration-500 ${status === 'connected' ? 'drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]' : 'opacity-50 grayscale'}`}
             >
                <rect x="20" y="20" width="160" height="160" rx="30" fill="#F1F5F9" />
                <path d="M85 20H115V15C115 12.2386 112.761 10 110 10H90C87.2386 10 85 12.2386 85 15V20Z" fill="#CBD5E1"/>
                <circle cx="65" cy="80" r="12" fill="#0F172A" />
                <circle cx="135" cy="80" r="12" fill="#0F172A" />
                {status === 'connected' && (
                    <>
                      <circle cx="65" cy="80" r="4" fill="#38BDF8" className="animate-pulse" />
                      <circle cx="135" cy="80" r="4" fill="#38BDF8" className="animate-pulse" />
                    </>
                )}
                <path d="M100 95L106 108H94L100 95Z" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <ellipse ref={mouthRef} cx="100" cy="135" rx="20" ry="2" fill="#0F172A" className="transition-all duration-75 ease-out" />
             </svg>
             <div className="mt-8 text-center min-h-[24px]">
                 {status === 'connecting' && <p className="text-indigo-300 animate-pulse">Connecting to Interna...</p>}
                 {status === 'error' && <p className="text-rose-400 font-bold">Connection Failed</p>}
                 {systemMessageStatus ? (
                     <p className="text-amber-400 text-sm font-bold animate-bounce">{systemMessageStatus}</p>
                 ) : silenceTriggered && (
                     <p className="text-amber-400 text-sm font-bold animate-bounce">System: Nudging AI...</p>
                 )}
             </div>
         </div>
      </div>

      <div className="z-20 bg-slate-900 border-t border-white/10 p-6 safe-pb">
         <div className="max-w-md mx-auto flex items-center justify-between gap-6">
            <button 
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all duration-300 ${
                  isMuted ? 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
               {isMuted ? (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.045 20.97l-3.055-3.055A11.24 11.24 0 0112 20.25c-5.695 0-10.399-4.19-11.126-9.662a.75.75 0 011.479-.213c.615 4.635 4.597 8.175 9.647 8.175 1.74 0 3.37-.421 4.816-1.163l3.229 3.229.353.353zM7.668 6.059l-2.56-2.56A11.25 11.25 0 0112 2.25c5.695 0 10.399 4.19 11.126 9.662a.75.75 0 11-1.479.213C21.032 7.49 17.05 3.95 12 3.95c-1.55 0-3.026.332-4.332.934.004.386-.746-.232 1.075l.232.1z" /></svg>
               ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" /><path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h7.5z" /></svg>
               )}
            </button>
            <button onClick={handleManualEnd} className="p-4 rounded-full bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 transition-all duration-300 transform active:scale-95" title="End Interview">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" /></svg>
            </button>
            <button onClick={() => setShowTranscript(!showTranscript)} className={`p-4 rounded-full transition-all duration-300 ${showTranscript ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' : 'bg-white/10 text-white hover:bg-white/20'}`}>
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h15a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-15zm3 2.25a.75.75 0 000 1.5h12a.75.75 0 000-1.5H6zm0 4.5a.75.75 0 000 1.5h9a.75.75 0 000-1.5H6zm0 4.5a.75.75 0 000 1.5h6a.75.75 0 000-1.5H6z" clipRule="evenodd" /></svg>
            </button>
         </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 z-10 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 transition-transform duration-500 ease-in-out ${showTranscript ? 'translate-y-0 h-[60%]' : 'translate-y-full h-0'}`}>
         <div className="h-full flex flex-col p-6 pb-24 overflow-y-auto">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 sticky top-0 bg-slate-900/95 py-2">Live Transcript</h3>
             <div className="space-y-4">
                 {transcriptLines.map((line, idx) => (
                     <div key={idx} className={`flex gap-3 ${line.speaker === 'ai' ? 'flex-row' : 'flex-row-reverse'}`}>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${line.speaker === 'ai' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>
                             {line.speaker === 'ai' ? 'AI' : 'You'}
                         </div>
                         <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${line.speaker === 'ai' ? 'bg-white/10 text-slate-200 rounded-tl-none' : 'bg-emerald-900/30 text-emerald-100 rounded-tr-none border border-emerald-500/20'}`}>
                             {line.text}
                         </div>
                     </div>
                 ))}
             </div>
         </div>
      </div>
    </div>
  );
};
