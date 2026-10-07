import { fetchWithTimeout } from "../http.ts";
import type { Task } from "../types.ts";

const API_BASE = "https://api.todoist.com/api/v1";
const MAX_TASKS = 10;
const PAGE_LIMIT = 200;
const MAX_PAGES = 20;

interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

interface ApiProject {
  id: string;
  name: string;
}

interface ApiTask {
  content: string;
  priority: number;
  due: { date: string } | null;
}

async function getAll<T>(
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(API_BASE + path);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Todoist ${path} failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as Page<T>;
    items.push(...body.results);
    cursor = body.next_cursor;
    if (!cursor) break;
  }

  return items;
}

function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function toTasks(apiTasks: ApiTask[]): Task[] {
  return apiTasks
    .map((t) => ({ content: t.content, due: t.due?.date ?? null, priority: t.priority }))
    .sort((a, b) => b.priority - a.priority || compareDue(a.due, b.due))
    .slice(0, MAX_TASKS);
}

export async function fetchTasks(token: string, projectName: string): Promise<Task[]> {
  const projects = await getAll<ApiProject>(token, "/projects");
  const wanted = projectName.toLowerCase();
  const project = projects.find((p) => p.name.toLowerCase() === wanted);
  if (!project) throw new Error(`Todoist project not found: "${projectName}"`);

  const tasks = await getAll<ApiTask>(token, "/tasks", { project_id: project.id });
  return toTasks(tasks);
}
