export type Tier = 'fast' | 'quality' | 'local';

export interface ProviderCallOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface Provider {
  name: 'groq' | 'gemini' | 'ollama';
  call(prompt: string, opts?: ProviderCallOptions): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    public provider: Provider['name'],
    public status: number,
    message: string,
  ) {
    super(`[${provider} ${status}] ${message}`);
    this.name = 'ProviderError';
  }
}
