import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/api';
import { isSilent, MAX_RECORDING_SECONDS, recordingToWhisperSamples } from '../lib/audio';
import { friendlyMessage } from '../lib/errors';

// Voice input records the clip here and transcribes it with Whisper on our server, rather than
// using the browser's built-in speech recognition - that only works reliably in Chrome and Safari
// (Firefox has none; Opera and Brave expose it with no speech service behind it, and it failed
// silently in Edge). MediaRecorder works in all of them. Checked at render time so tests can
// install a fake.
const canRecord = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';

const MIC_ERROR_MESSAGES = {
  insecure: 'Voice input needs a secure (https) connection - type instead.',
  blocked: 'Microphone access was blocked - allow it in your browser settings, or type instead.',
  missing: 'No microphone was found - plug one in, or type instead.',
  silent: "Didn't catch anything - tap the mic and try again.",
};

// A silent clip usually means the browser is listening to the wrong microphone - e.g. a virtual
// one like Camo with no phone connected, which records pure silence. Naming the device it used
// (the label is only readable once mic permission is granted) points straight at the fix.
function silentMessage(deviceLabel) {
  if (!deviceLabel) return MIC_ERROR_MESSAGES.silent;
  return `Didn't catch anything from "${deviceLabel}". If that's the wrong microphone, pick another in your browser's site settings or Windows sound settings, then try again.`;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

// Text box + optional mic for describing food in words - used both as an alternative to uploading
// a photo and to confirm/edit a photo detection before it's looked up. A transcript only fills the
// box (rather than auto-submitting) so the user can fix a mis-hearing before looking it up.
export function DescribeFood({
  token,
  onSubmit,
  disabled,
  placeholder,
  initialValue = '',
  autoFocus = false,
  submitLabel = 'Look it up',
}) {
  const [text, setText] = useState(initialValue);
  const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'recording' | 'transcribing'
  const [voiceError, setVoiceError] = useState(null);
  const [hasMic] = useState(canRecord);
  const recorderRef = useRef(null);
  const stopTimerRef = useRef(null);
  const deviceLabelRef = useRef('');
  const unmountedRef = useRef(false);

  // Leaving the page mid-recording releases the microphone and drops the clip.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimeout(stopTimerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  }

  async function transcribeRecording(blob) {
    setVoiceState('transcribing');
    try {
      const samples = await recordingToWhisperSamples(blob);
      if (isSilent(samples)) {
        setVoiceError(silentMessage(deviceLabelRef.current));
        return;
      }
      const { text: transcript } = await transcribeAudio(samples, token);
      if (unmountedRef.current) return;
      if (transcript) setText(transcript);
      else setVoiceError(silentMessage(deviceLabelRef.current));
    } catch (err) {
      // Decoding errors from the browser ("Unable to decode audio data") aren't worded for users.
      if (!unmountedRef.current) {
        setVoiceError(friendlyMessage(err, "Couldn't process that recording - try again, or type instead."));
      }
    } finally {
      if (!unmountedRef.current) setVoiceState('idle');
    }
  }

  async function toggleRecording() {
    if (voiceState === 'recording') {
      recorderRef.current?.stop();
      return;
    }

    setVoiceError(null);

    // Browsers only allow the microphone on https (or localhost) - opening the dev server by LAN
    // IP on a phone, for example, blocks it without ever showing a permission prompt.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError(MIC_ERROR_MESSAGES.insecure);
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setVoiceError(err.name === 'NotFoundError' ? MIC_ERROR_MESSAGES.missing : MIC_ERROR_MESSAGES.blocked);
      return;
    }

    deviceLabelRef.current = stream.getAudioTracks?.()[0]?.label || '';
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      clearTimeout(stopTimerRef.current);
      stream.getTracks().forEach((track) => track.stop());
      if (unmountedRef.current) return;
      transcribeRecording(new Blob(chunks, { type: recorder.mimeType }));
    };

    recorderRef.current = recorder;
    recorder.start();
    setVoiceState('recording');
    stopTimerRef.current = setTimeout(() => recorder.stop(), MAX_RECORDING_SECONDS * 1000);
  }

  const placeholderText = {
    recording: 'Listening… tap the mic again when you’re done',
    transcribing: 'Transcribing…',
  }[voiceState] || placeholder;

  return (
    <form className="describe-food" onSubmit={handleSubmit}>
      <div className="describe-food-row">
        <input
          type="text"
          value={voiceState === 'idle' ? text : ''}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholderText}
          maxLength={300}
          autoFocus={autoFocus}
          disabled={disabled || voiceState !== 'idle'}
        />
        {hasMic && (
          <button
            type="button"
            className={`mic-button${voiceState === 'recording' ? ' listening' : ''}`}
            onClick={toggleRecording}
            disabled={disabled || voiceState === 'transcribing'}
            aria-label={voiceState === 'recording' ? 'Stop recording' : 'Describe your food by voice'}
            title={voiceState === 'recording' ? 'Stop recording' : 'Speak instead of typing'}
          >
            <MicIcon />
          </button>
        )}
      </div>
      {voiceError && <p className="describe-food-error">{voiceError}</p>}
      <button type="submit" className="describe-food-submit" disabled={disabled || voiceState !== 'idle' || !text.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}
