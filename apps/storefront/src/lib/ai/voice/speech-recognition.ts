export interface STTProvider {
  transcribe(audio: Blob | ArrayBuffer): Promise<string>;
}

export class BrowserSTTProvider implements STTProvider {
  private recognition: SpeechRecognition | null = null;

  async transcribe(_audio: Blob | ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser'));
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        resolve(transcript);
      };

      this.recognition.onerror = (event: Event) => {
        reject(new Error(`Speech recognition error: ${(event as SpeechRecognitionErrorEvent).error}`));
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
