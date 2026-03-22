export interface STTProvider {
  transcribe(audio: Blob | ArrayBuffer): Promise<string>;
}

/** Minimal Web Speech API surface (not in all TS `lib` targets). */
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export class BrowserSTTProvider implements STTProvider {
  private recognition: SpeechRecognitionInstance | null = null;

  async transcribe(_audio: Blob | ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser'));
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: Event) => {
        const results = (event as unknown as { results?: Array<Array<{ transcript?: string }>> }).results;
        const transcript = results?.[0]?.[0]?.transcript ?? '';
        resolve(transcript);
      };

      this.recognition.onerror = (event: Event) => {
        const err = (event as unknown as { error?: string }).error ?? 'unknown';
        reject(new Error(`Speech recognition error: ${err}`));
      };

      this.recognition.onend = () => {
        // Resolve with empty string if no result was captured
      };

      this.recognition.start();
    });
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}

export class WhisperSTTProvider implements STTProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Blob | ArrayBuffer): Promise<string> {
    const formData = new FormData();
    const blob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper transcription failed: ${response.status}`);
    }

    const data = await response.json();
    return data.text ?? '';
  }
}

export function createSTTProvider(provider: string, apiKey?: string): STTProvider {
  switch (provider) {
    case 'whisper':
      if (!apiKey) throw new Error('OpenAI API key required for Whisper STT');
      return new WhisperSTTProvider(apiKey);
    case 'browser':
    default:
      return new BrowserSTTProvider();
  }
}
