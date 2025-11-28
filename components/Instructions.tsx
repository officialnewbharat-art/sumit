import React, { useEffect, useRef, useState } from 'react';

interface InstructionsProps {
  onStart: () => void;
}

type NetworkQuality = 'checking' | 'excellent' | 'fair' | 'poor';
type NoiseStatus = 'checking' | 'good' | 'fair' | 'bad';

export const Instructions: React.FC<InstructionsProps> = ({ onStart }) => {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('checking');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [noiseStatus, setNoiseStatus] = useState<NoiseStatus>('checking');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setPermissionGranted(true);
        
        // Video Setup
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

        // Audio Setup
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 512;
        microphone.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        
        drawVisualizer();
      } catch (err) {
        console.error("Media error", err);
        setPermissionGranted(false);
      }
    };

    const checkNetworkSpeed = async () => {
        const start = Date.now();
        try {
            // Fetch a small, highly available asset (Google Favicon) with no-cors to measure RTT
            await fetch('https://www.google.com/favicon.ico?' + start, { mode: 'no-cors', cache: 'no-store' });
            const end = Date.now();
            const duration = end - start;
            setLatencyMs(duration);

            if (duration < 150) {
                setNetworkQuality('excellent');
            } else if (duration < 400) {
                setNetworkQuality('fair');
            } else {
                setNetworkQuality('poor');
            }
        } catch (e) {
            setNetworkQuality('poor');
            setLatencyMs(999);
        }
    };

    initMedia();
    checkNetworkSpeed();

    // Re-check network every 5 seconds
    const netInterval = setInterval(checkNetworkSpeed, 5000);

    return () => {
      clearInterval(netInterval);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  const drawVisualizer = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if(!canvas || !analyser) return;

      const ctx = canvas.getContext('2d');
      if(!ctx) return;

      const resize = () => {
         if (!canvas.parentElement) return;
         canvas.width = canvas.parentElement.offsetWidth * window.devicePixelRatio;
         canvas.height = canvas.parentElement.offsetHeight * window.devicePixelRatio;
         ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      };
      window.addEventListener('resize', resize);
      resize();

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
          animationRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataArray);
          
          const width = canvas.width / window.devicePixelRatio;
          const height = canvas.height / window.devicePixelRatio;
          
          ctx.clearRect(0, 0, width, height);
          
          const barWidth = (width / bufferLength) * 2.5;
          let barHeight;
          let x = 0;
          let sum = 0;

          for(let i = 0; i < bufferLength; i++) {
              const value = dataArray[i];
              sum += value;
              barHeight = (value / 255) * height * 0.8;
              
              const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
              gradient.addColorStop(0, '#4f46e5'); 
              gradient.addColorStop(1, '#a855f7'); 

              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.roundRect(x, height - barHeight, barWidth, barHeight, 4);
              ctx.fill();

              x += barWidth + 1;
          }

          // --- NOISE DETECTION LOGIC ---
          frameCountRef.current++;
          // Update status every 30 frames (approx 0.5s) to avoid UI flicker
          if (frameCountRef.current % 30 === 0) {
              const averageVolume = sum / bufferLength;
              
              // Thresholds (0-255 scale)
              // < 10: Quiet room
              // 10-30: Acceptable background noise (AC, distant sounds)
              // > 30: Too loud
              if (averageVolume < 10) {
                  setNoiseStatus('good');
              } else if (averageVolume < 30) {
                  setNoiseStatus('fair');
              } else {
                  setNoiseStatus('bad');
              }
          }
      };
      draw();
  };

  const getNetworkUI = () => {
      switch (networkQuality) {
          case 'excellent':
              return { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', label: 'Net: Optimal', desc: 'Evalya will respond instantly.' };
          case 'fair':
              return { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30', label: 'Net: Stable', desc: 'Slight delays possible.' };
          case 'poor':
              return { color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/30', label: 'Net: Weak', desc: 'Connection slow. Evalya may lag.' };
          default:
              return { color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30', label: 'Net: ...', desc: 'Testing connectivity...' };
      }
  };

  const getNoiseUI = () => {
      switch (noiseStatus) {
          case 'good':
              return { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', label: 'Noise: Quiet', icon: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' };
          case 'fair':
              return { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30', label: 'Noise: Fair', icon: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' };
          case 'bad':
              return { color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/30', label: 'Noise: Loud', icon: 'M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' };
          default:
              return { color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30', label: 'Noise: ...', icon: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' };
      }
  };

  const netUI = getNetworkUI();
  const noiseUI = getNoiseUI();

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-full w-full animate-fade-in">
      
      {/* Left Panel: Immersive Media Check (Dark) */}
      <div className="lg:col-span-7 bg-slate-950 relative flex flex-col items-center justify-center overflow-hidden h-[40vh] lg:h-full shrink-0">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950"></div>
         
         <div className="w-full h-full relative z-10 flex flex-col items-center justify-center p-8">
            {permissionGranted === false ? (
                <div className="text-center p-8 glass-dark rounded-2xl">
                   <div className="w-16 h-16 lg:w-20 lg:h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 lg:w-10 lg:h-10">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                   </div>
                   <h3 className="text-white font-bold text-lg lg:text-xl mb-2">Permissions Denied</h3>
                   <p className="text-slate-400 max-w-xs lg:max-w-sm mx-auto text-sm">Camera and Microphone access are strictly required for anti-cheating verification.</p>
                </div>
            ) : (
               <div className="relative w-full max-w-lg aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 group">
                  {/* Video Preview */}
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover opacity-80"
                  />
                  
                  {/* Audio Visualizer Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/90 to-transparent">
                      <canvas ref={canvasRef} className="w-full h-full opacity-70"></canvas>
                  </div>

                  {/* HIGH NOISE WARNING OVERLAY */}
                  {noiseStatus === 'bad' && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                          <div className="text-center p-4">
                              <div className="w-12 h-12 bg-rose-500 text-white rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                </svg>
                              </div>
                              <h3 className="text-white font-bold text-lg">Environment Too Noisy</h3>
                              <p className="text-slate-300 text-sm mt-1">Please move to a silent room to ensure interview quality.</p>
                          </div>
                      </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-4 left-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md ${
                        permissionGranted ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${permissionGranted ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                            {permissionGranted ? 'System Ready' : 'Initializing...'}
                        </span>
                    </div>
                  </div>

                  {/* Indicators (Net + Noise) */}
                  <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                    
                    {/* Internet Speed */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-colors duration-500 ${netUI.bg} ${netUI.border} ${netUI.color}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.9a.75.75 0 100 1.5h1.138a.75.75 0 000-1.5H8.39zm2.344 0a.75.75 0 000 1.5h1.138a.75.75 0 000-1.5H10.734zM8.39 10a.75.75 0 100 1.5h1.138a.75.75 0 000-1.5H8.39zm2.344 0a.75.75 0 000 1.5h1.138a.75.75 0 000-1.5H10.734z" clipRule="evenodd" />
                        </svg>
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                            {netUI.label}
                        </span>
                    </div>

                    {/* Noise Level */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-colors duration-500 ${noiseUI.bg} ${noiseUI.border} ${noiseUI.color}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                           <path strokeLinecap="round" strokeLinejoin="round" d={noiseUI.icon} />
                        </svg>
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                            {noiseUI.label}
                        </span>
                    </div>

                  </div>
               </div>
            )}
         </div>
      </div>

      {/* Right Panel: Proctoring Rules (Light) */}
      <div className="lg:col-span-5 bg-white flex flex-col flex-1 overflow-y-auto relative shadow-2xl z-20 rounded-t-3xl lg:rounded-none -mt-6 lg:mt-0">
         <div className="flex-1 p-8 lg:p-20 flex flex-col justify-center">
             <div className="max-w-md mx-auto w-full">
                 <div className="mb-6 lg:mb-8">
                    <h2 className="text-2xl lg:text-3xl font-bold text-slate-900">Security Check</h2>
                    <p className="text-slate-500 mt-2 text-base lg:text-lg">Anti-cheating protocols are active.</p>
                 </div>

                 <div className="space-y-4 lg:space-y-6 mb-8 lg:mb-10">
                    <div className="bg-indigo-50 rounded-2xl p-5 lg:p-6 border border-indigo-100">
                       <h3 className="font-bold text-indigo-900 mb-3 lg:mb-4 text-xs lg:text-sm uppercase tracking-wide flex items-center gap-2">
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                             <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                           </svg>
                           Proctoring Rules
                       </h3>
                       <ul className="space-y-3">
                          {[
                             "Switching tabs will trigger a violation.",
                             "Camera must remain active.",
                             "Copy/Paste is disabled.",
                             "Ensure your environment is silent."
                          ].map((item, i) => (
                             <li key={i} className="flex items-start gap-3 text-sm text-indigo-800 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></span>
                                <span>{item}</span>
                             </li>
                          ))}
                       </ul>
                    </div>
                 </div>

                 <button
                   onClick={onStart}
                   disabled={!permissionGranted || noiseStatus === 'bad'}
                   className={`w-full py-4 lg:py-5 rounded-xl font-bold shadow-lg transition-all flex items-center justify-between px-6 lg:px-8 ${
                     permissionGranted && noiseStatus !== 'bad'
                     ? 'bg-slate-900 text-white hover:bg-indigo-600 hover:shadow-indigo-200 cursor-pointer transform hover:-translate-y-1' 
                     : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                   }`}
                 >
                   <span>Accept & Begin</span>
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 lg:w-6 lg:h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                   </svg>
                 </button>
                 {noiseStatus === 'bad' && (
                     <p className="text-center text-xs text-rose-500 font-bold mt-3">Cannot start: Environment is too noisy.</p>
                 )}
             </div>
         </div>
      </div>
    </div>
  );
};