export interface FaqRow {
  question: string;
  answer: string;
  category: string;
}

export interface GeminiResult {
  text: string;
  shouldFallback: boolean;
  finishReason?: string;
  thoughtsTokenCount?: number;
  candidatesTokenCount?: number;
}
