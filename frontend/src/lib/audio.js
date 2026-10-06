// Helpers for voice input - see /api/transcribe in server.js for why the browser does the decoding.

// Matches the server's MAX_RECORDING_SECONDS; recording stops itself at this point.
export const MAX_RECORDING_SECONDS = 20;
const WHISPER_SAMPLE_RATE = 16000;

// Decodes a MediaRecorder recording (WebM/Opus in Chrome/Edge/Firefox/Opera, MP4 in Safari) and
// resamples it to the 16kHz mono Float32 samples Whisper expects. Rendering through a one-channel
// OfflineAudioContext does the stereo-to-mono downmix and the resampling in one step.
export async function recordingToWhisperSamples(blob) {
  const context = new AudioContext();
  let decoded;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    context.close();
  }

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE), WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

// Whisper tends to invent text for silence (e.g. "Thank you."), so near-silent clips are caught
// here rather than sent to the server.
export function isSilent(samples) {
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return samples.length === 0 || Math.sqrt(sumOfSquares / samples.length) < 0.005;
}
