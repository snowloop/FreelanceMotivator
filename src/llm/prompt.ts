import type { FeedItem, Task } from "../types.ts";
import type { ChatMessage } from "./client.ts";

// About 1500 tokens, estimated as characters / 4.
const MAX_PROMPT_CHARS = 6000;
const FIRST_SUMMARY_MAX = 300;

const SYSTEM_PROMPT =
  "You are an assistant who motivates a freelance worker. " +
  "Write a short summary in French, maximum 8 lines, in two parts: " +
  "« To do » then « Actualités ». Be factual and do not make anything up.";

function formatTask(task: Task): string {
  const due = task.due ? `, échéance ${task.due.slice(0, 10)}` : "";
  // Todoist priority 4 is shown as p1 in its apps.
  return `- [p${5 - task.priority}] ${task.content}${due}`;
}

function formatItem(item: FeedItem, summaryMax: number): string {
  const summary = summaryMax > 0 ? item.summary.slice(0, summaryMax).trim() : "";
  return summary ? `- ${item.title} : ${summary}` : `- ${item.title}`;
}

function buildUserMessage(tasks: Task[], items: FeedItem[], summaryMax: number): string {
  const taskLines = tasks.length > 0 ? tasks.map(formatTask).join("\n") : "Aucune tâche.";
  const itemLines =
    items.length > 0 ? items.map((i) => formatItem(i, summaryMax)).join("\n") : "Aucune actualité.";
  return `Tâches :\n${taskLines}\n\nActualités :\n${itemLines}`;
}

export function buildMessages(tasks: Task[], items: FeedItem[]): ChatMessage[] {
  let summaryMax = FIRST_SUMMARY_MAX;
  let user = buildUserMessage(tasks, items, summaryMax);

  // Trim the news summaries first, down to titles only.
  while (SYSTEM_PROMPT.length + user.length > MAX_PROMPT_CHARS && summaryMax > 0) {
    summaryMax = Math.floor(summaryMax / 2);
    user = buildUserMessage(tasks, items, summaryMax);
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
