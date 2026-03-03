export interface TTSProvider {
  synthesize(text: string): Promise<ArrayBuffer | null>;
}

export class BrowserTTSProvider implements TTSProvider {
  async synthesize(text: string): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve(null);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.name.includes('Samantha') || v.name.includes('Google UK English Female') || v.name.includes('Female')
      );
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onend = () => resolve(null);
      utterance.onerror = () => resolve(null);

      speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      speechSynthesis.cancel();
    }
  }
}

export class ElevenLabsTTSProvider implements TTSProvider {
  private apiKey: string;
  private voiceId: string;

  constructor(apiKey: string, voiceId: string) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  async synthesize(text: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS failed: ${response.status}`);
    }

    return response.arrayBuffer();
  }
}

export function createTTSProvider(provider: string, apiKey?: string, voiceId?: string): TTSProvider {
  switch (provider) {
    case 'elevenlabs':
      if (!apiKey || !voiceId) throw new Error('ElevenLabs API key and voice ID required');
      return new ElevenLabsTTSProvider(apiKey, voiceId);
    case 'browser':
    default:
      return new BrowserTTSProvider();
  }
}
