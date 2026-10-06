import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DescribeFood } from './DescribeFood';
import { transcribeAudio } from '../lib/api';
import { isSilent, recordingToWhisperSamples } from '../lib/audio';
import { expectFriendly } from '../test/rawErrors';

vi.mock('../lib/api', () => ({ transcribeAudio: vi.fn() }));
// Decoding needs the Web Audio API, which jsdom doesn't have - stub it out.
vi.mock('../lib/audio', () => ({
  MAX_RECORDING_SECONDS: 20,
  recordingToWhisperSamples: vi.fn(),
  isSilent: vi.fn(),
}));

// jsdom has no MediaRecorder or microphone, so each test installs fakes for both.
class FakeMediaRecorder {
  static instances = [];

  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable({ data: new Blob(['fake audio']) });
    this.onstop();
  }
}

const micTrack = { stop: vi.fn(), label: 'Microphone (Camo)' };

function installMicrophone(
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [micTrack], getAudioTracks: () => [micTrack] }),
) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  return getUserMedia;
}

const micButton = () => screen.getByRole('button', { name: /by voice/i });

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  window.MediaRecorder = FakeMediaRecorder;
  recordingToWhisperSamples.mockResolvedValue(new Float32Array(16000));
  isSilent.mockReturnValue(false);
  transcribeAudio.mockResolvedValue({ text: 'two slices of pizza' });
});

afterEach(() => {
  cleanup();
  delete window.MediaRecorder;
});

describe('DescribeFood', () => {
  test('submits the trimmed description', () => {
    const onSubmit = vi.fn();
    render(<DescribeFood token="t" onSubmit={onSubmit} placeholder="Describe it" />);

    fireEvent.change(screen.getByPlaceholderText('Describe it'), { target: { value: '  2 eggs and toast  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look it up' }));

    expect(onSubmit).toHaveBeenCalledWith('2 eggs and toast');
  });

  test('hides the mic button when the browser cannot record audio', () => {
    delete window.MediaRecorder;
    render(<DescribeFood token="t" onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /by voice/i })).toBeNull();
  });

  test('records, transcribes on the server, and fills the box', async () => {
    const getUserMedia = installMicrophone();
    const onSubmit = vi.fn();
    render(<DescribeFood token="test-token" onSubmit={onSubmit} placeholder="Describe it" />);

    await act(() => fireEvent.click(micButton()));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.instances[0].state).toBe('recording');

    // Second tap stops recording and sends the clip off.
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    expect(await screen.findByDisplayValue('two slices of pizza')).toBeTruthy();
    expect(transcribeAudio).toHaveBeenCalledWith(expect.any(Float32Array), 'test-token');
    expect(micTrack.stop).toHaveBeenCalled(); // microphone released
    // The transcript fills the box but isn't submitted - the user can fix a mis-hearing first.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('does not send a silent recording to the server, and names the microphone it heard', async () => {
    installMicrophone();
    isSilent.mockReturnValue(true);
    render(<DescribeFood token="t" onSubmit={vi.fn()} />);

    await act(() => fireEvent.click(micButton()));
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    expect(await screen.findByText(/didn't catch anything from "Microphone \(Camo\)"/i)).toBeTruthy();
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  test('explains a blocked microphone instead of failing silently', async () => {
    installMicrophone(vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
    render(<DescribeFood token="t" onSubmit={vi.fn()} />);

    await act(() => fireEvent.click(micButton()));

    expect(screen.getByText(/microphone access was blocked/i)).toBeTruthy();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  test('a recording the browser cannot decode shows a plain message, not the decoder error', async () => {
    installMicrophone();
    recordingToWhisperSamples.mockRejectedValue(new DOMException('Unable to decode audio data', 'EncodingError'));
    render(<DescribeFood token="t" onSubmit={vi.fn()} />);

    await act(() => fireEvent.click(micButton()));
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    const message = await screen.findByText(/./, { selector: '.describe-food-error' });
    expectFriendly(message.textContent);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });
});
