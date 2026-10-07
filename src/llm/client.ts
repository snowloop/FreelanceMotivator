import type { Config } from "../config.ts";
import { fetchWithTimeout } from "../http.ts";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

const TIMEOUT_MS = 120_000;

export async function chat(
  config: Pick<Config, "llmBaseUrl" | "llmModel">,
  messages: ChatMessage[],
): Promise<string> {
  // No retries: a slow local generation should not be started again.
  const response = await fetchWithTimeout(
    `${config.llmBaseUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.llmModel,
        messages,
        temperature: 0.3,
        max_tokens: 300,
        stream: false,
      }),
    },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );
  if (!response.ok) throw new Error(`LLM server answered HTTP ${response.status}`);

  const body = (await response.json()) as ChatResponse;
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM server returned an empty answer");
  return content;
}
