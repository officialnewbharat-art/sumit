
export interface AudioBlob {
  data: string;
  mimeType: string;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize Int16 back to Float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number = 16000): Float32Array {
  if (!buffer || buffer.length === 0) return new Float32Array(0);
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.ceil(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    
    let accum = 0, count = 0;
    // Determine end of current averaging window, clamped to buffer end
    const currentEnd = Math.min(nextOffsetBuffer, buffer.length);
    
    for (let i = offsetBuffer; i < currentEnd; i++) {
      accum += buffer[i];
      count++;
    }
    
    // If count is 0 (upsampling edge case), just repeat previous or use current index
    if (count === 0 && offsetBuffer < buffer.length) {
        result[offsetResult] = buffer[offsetBuffer];
    } else {
        result[offsetResult] = count > 0 ? accum / count : 0;
    }
    
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function createBlob(data: Float32Array, sampleRate: number = 16000): AudioBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    // Fallback to 0 if NaN/Infinity to prevent invalid audio frames
    const val = data[i] || 0;
    // Clamp the value between -1.0 and 1.0 to prevent integer overflow distortion
    const s = Math.max(-1, Math.min(1, val));
    // Convert to 16-bit PCM
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}
