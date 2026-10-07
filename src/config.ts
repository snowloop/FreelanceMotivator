import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Config {
  todoistToken: string;
  todoistProjectName: string;
  llmBaseUrl: string;
  llmModel: string;
  feeds: string[];
}

const REQUIRED_ENV = [
  "TODOIST_TOKEN",
  "TODOIST_PROJECT_NAME",
  "LLM_BASE_URL",
  "LLM_MODEL",
] as const;

function loadFeeds(): string[] {
  const path = join(import.meta.dir, "..", "feeds.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read feeds.json: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((u) => typeof u === "string")) {
    throw new Error("feeds.json must be an array of URL strings");
  }
  return parsed;
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): Config {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return {
    todoistToken: env.TODOIST_TOKEN!.trim(),
    todoistProjectName: env.TODOIST_PROJECT_NAME!.trim(),
    llmBaseUrl: env.LLM_BASE_URL!.trim().replace(/\/+$/, ""),
    llmModel: env.LLM_MODEL!.trim(),
    feeds: loadFeeds(),
  };
}

export function redactConfig(config: Config): Record<string, unknown> {
  return { ...config, todoistToken: "***" };
}
