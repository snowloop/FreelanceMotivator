import { afterEach, describe, expect, test } from "bun:test";
import { chat } from "../src/llm/client.ts";
import { buildMessages } from "../src/llm/prompt.ts";
import type { FeedItem, Task } from "../src/types.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const task = (content: string, priority: number, due: string | null): Task => ({
  content,
  priority,
  due,
});

const item = (title: string, summary: string): FeedItem => ({
  title,
  summary,
  link: "https://example.com",
  date: "2026-10-07T08:00:00.000Z",
});

describe("buildMessages", () => {
  test("lists tasks with Todoist-style priority and news with summaries", () => {
    const [system, user] = buildMessages(
      [task("Relancer le client", 4, "2026-10-08T09:00:00"), task("Facturer", 1, null)],
      [item("Nouveau TJM", "Le TJM moyen augmente")],
    );

    expect(system?.role).toBe("system");
    expect(user?.role).toBe("user");
    expect(user?.content).toContain("- [p1] Relancer le client, échéance 2026-10-08");
    expect(user?.content).toContain("- [p4] Facturer");
    expect(user?.content).toContain("- Nouveau TJM : Le TJM moyen augmente");
  });

  test("says so when there is nothing to report", () => {
    const [, user] = buildMessages([], []);

    expect(user?.content).toContain("Aucune tâche.");
    expect(user?.content).toContain("Aucune actualité.");
  });

  test("trims summaries to stay within the prompt budget", () => {
    const long = "x".repeat(300);
    const items = Array.from({ length: 30 }, (_, i) => item(`Titre ${i}`, long));

    const messages = buildMessages([task("t", 1, null)], items);

    const total = messages.reduce((sum, m) => sum + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(messages[1]?.content).toContain("- Titre 29");
  });
});

describe("chat", () => {
  const config = { llmBaseUrl: "http://127.0.0.1:8080", llmModel: "tinyllama" };
  const messages = [{ role: "user" as const, content: "salut" }];

  test("posts an OpenAI-style request and returns the trimmed answer", async () => {
    let seen: { url: string; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (async (input: Request | URL, init?: RequestInit) => {
      seen = { url: String(input), body: JSON.parse(String(init?.body)) };
      return Response.json({ choices: [{ message: { content: "  Bonjour  " } }] });
    }) as unknown as typeof fetch;

    const answer = await chat(config, messages);

    expect(answer).toBe("Bonjour");
    expect(seen?.url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    expect(seen?.body).toMatchObject({
      model: "tinyllama",
      messages,
      temperature: 0.3,
      max_tokens: 300,
      stream: false,
    });
  });

  test("throws on HTTP errors", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;

    await expect(chat(config, messages)).rejects.toThrow("HTTP 500");
  });

  test("throws on an empty answer", async () => {
    globalThis.fetch = (async () =>
      Response.json({ choices: [{ message: { content: "   " } }] })) as unknown as typeof fetch;

    await expect(chat(config, messages)).rejects.toThrow("empty answer");
  });
});
