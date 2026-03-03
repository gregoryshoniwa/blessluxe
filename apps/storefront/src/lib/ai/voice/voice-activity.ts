export type VADState = 'idle' | 'listening' | 'speaking' | 'processing';

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Blob) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (error: Error) => void;
}

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private animationFrame: number | null = null;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking = false;
  private callbacks: VADCallbacks;

  private readonly silenceThreshold = 0.02;
  private readonly silenceDelay = 1500;

  constructor(callbacks: VADCallbacks) {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: this.getSupportedMimeType() });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        if (this.chunks.length > 0) {
          const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          this.callbacks.onSpeechEnd?.(blob);
          this.chunks = [];
        }
      };

      this.monitorAudio();
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error('Microphone access denied'));
    }
  }

  stop(): void {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    if (this.silenceTimeout != null) clearTimeout(this.silenceTimeout);
    this.mediaRecorder?.stop();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.isSpeaking = false;
  }

  private monitorAudio(): void {
    if (!this.analyser) return;

    const dataArray = new Float32Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      this.callbacks.onVolumeChange?.(rms);

      if (rms > this.silenceThreshold) {
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.chunks = [];
          this.mediaRecorder?.start();
          this.callbacks.onSpeechStart?.();
        }
        if (this.silenceTimeout != null) {
          clearTimeout(this.silenceTimeout);
          this.silenceTimeout = null;
        }
      } else if (this.isSpeaking && this.silenceTimeout == null) {
        this.silenceTimeout = setTimeout(() => {
          this.isSpeaking = false;
          this.mediaRecorder?.stop();
          this.silenceTimeout = null;
        }, this.silenceDelay);
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    tick();
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
  }
}
