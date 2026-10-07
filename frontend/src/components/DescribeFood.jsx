import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/api';
import { isSilent, MAX_RECORDING_SECONDS, recordingToWhisperSamples } from '../lib/audio';
import { friendlyMessage } from '../lib/errors';
import { Button, inputClass } from './ui';
import { MicIcon } from './icons';

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
  ariaLabel = 'Describe your food',
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

  const recording = voiceState === 'recording';

  return (
    <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className={inputClass}
          value={voiceState === 'idle' ? text : ''}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholderText}
          aria-label={ariaLabel}
          maxLength={300}
          autoFocus={autoFocus}
          disabled={disabled || voiceState !== 'idle'}
        />
        {hasMic && (
          <button
            type="button"
            className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
              recording
                ? 'animate-pulse border-danger bg-danger text-white motion-reduce:animate-none'
                : 'border-rule bg-surface text-ink hover:bg-brand hover:text-brand-ink'
            }`}
            onClick={toggleRecording}
            disabled={disabled || voiceState === 'transcribing'}
            aria-label={recording ? 'Stop recording' : 'Describe your food by voice'}
            title={recording ? 'Stop recording' : 'Speak instead of typing'}
          >
            <MicIcon />
          </button>
        )}
      </div>
      {voiceError && (
        <p role="alert" className="text-sm text-danger">
          {voiceError}
        </p>
      )}
      <Button
        type="submit"
        variant="gold"
        className="w-full"
        disabled={disabled || voiceState !== 'idle' || !text.trim()}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
