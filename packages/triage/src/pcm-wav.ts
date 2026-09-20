const WHISPER_RATE = 16_000;

export type PcmWavInfo = {
  container: 'wav' | 'unknown';
  codec: string;
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
  size: number;
};

function isWaveFile(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE'
  );
}

export function inspectPcmWave(bytes: Uint8Array): PcmWavInfo {
  const unknown: PcmWavInfo = {
    container: 'unknown',
    codec: 'unknown',
    audioFormat: 0,
    channels: 0,
    sampleRate: 0,
    bitsPerSample: 0,
    dataBytes: 0,
    durationMs: 0,
    size: bytes.byteLength,
  };
  if (!isWaveFile(bytes)) return unknown;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;
    if (bodyOffset + size > bytes.byteLength) break;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(bodyOffset, true);
      channels = view.getUint16(bodyOffset + 2, true);
      sampleRate = view.getUint32(bodyOffset + 4, true);
      bitsPerSample = view.getUint16(bodyOffset + 14, true);
    } else if (id === 'data') {
      dataLength = size;
    }
    offset = bodyOffset + size + (size % 2);
  }

  const bytesPerSample = Math.max(1, (bitsPerSample / 8) * Math.max(1, channels));
  const durationMs =
    sampleRate > 0 ? Math.round((dataLength / bytesPerSample / sampleRate) * 1000) : 0;
  return {
    container: 'wav',
    codec: audioFormat === 1 ? `pcm_s${bitsPerSample}le` : `format_${audioFormat}`,
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataBytes: dataLength,
    durationMs,
    size: bytes.byteLength,
  };
}

export function flattenPcmChunks(chunks: readonly Float32Array[]): Float32Array {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function resampleMono(samples: Float32Array, fromRate: number, toRate = WHISPER_RATE): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const targetLength = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const resampled = new Float32Array(targetLength);
  const ratio = fromRate / toRate;
  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = position - left;
    resampled[index] = (samples[left] ?? 0) * (1 - fraction) + (samples[right] ?? 0) * fraction;
  }
  return resampled;
}

export function encodePcm16kWave(samples: Float32Array): Uint8Array {
  const pcm = resampleMono(samples, WHISPER_RATE, WHISPER_RATE);
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, WHISPER_RATE, true);
  view.setUint32(28, WHISPER_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (const sample of pcm) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
    offset += 2;
  }
  return bytes;
}

export function encodeBrowserPcmWave(chunks: readonly Float32Array[], sampleRate: number): Uint8Array {
  return encodePcm16kWave(resampleMono(flattenPcmChunks(chunks), sampleRate, WHISPER_RATE));
}

export function decodePcmWave(bytes: Uint8Array): Float32Array {
  if (!isWaveFile(bytes)) throw new Error('Audio must be a PCM WAV file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;
    if (bodyOffset + size > bytes.byteLength) throw new Error('The WAV file is truncated.');
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(bodyOffset, true);
      channels = view.getUint16(bodyOffset + 2, true);
      sampleRate = view.getUint32(bodyOffset + 4, true);
      bitsPerSample = view.getUint16(bodyOffset + 14, true);
    } else if (id === 'data') {
      dataOffset = bodyOffset;
      dataLength = size;
    }
    offset = bodyOffset + size + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || channels > 2 || !dataOffset || !sampleRate) {
    throw new Error('Voice input requires 16-bit mono or stereo PCM WAV audio.');
  }

  const frameCount = Math.floor(dataLength / (channels * 2));
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let value = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      value += view.getInt16(dataOffset + ((frame * channels + channel) * 2), true) / 32768;
    }
    mono[frame] = value / channels;
  }
  return resampleMono(mono, sampleRate, WHISPER_RATE);
}
