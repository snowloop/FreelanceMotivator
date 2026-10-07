import { afterEach, describe, expect, test } from "bun:test";
import { fetchTasks, toTasks } from "../src/collectors/todoist.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (url: URL, init?: RequestInit) => Response): void {
  globalThis.fetch = (async (input: Request | URL| string, init?: RequestInit) =>
    handler(new URL(String(input)), init)) as unknown as typeof fetch;
}

const task = (content: string, priority: number, due: string | null) => ({
  content,
  priority,
  due: due ? { date: due } : null,
});

describe("toTasks", () => {
  test("sorts by priority then due date, undated last", () => {
    const result = toTasks([
      task("low", 1, "2026-01-01"),
      task("urgent late", 4, "2026-03-01"),
      task("urgent early", 4, "2026-02-01"),
      task("urgent undated", 4, null),
    ]);
    expect(result.map((t) => t.content)).toEqual([
      "urgent early",
      "urgent late",
      "urgent undated",
      "low",
    ]);
  });

  test("caps at 10 tasks", () => {
    const many = Array.from({ length: 15 }, (_, i) => task(`t${i}`, 1, null));
    expect(toTasks(many)).toHaveLength(10);
  });
});

describe("fetchTasks", () => {
  test("resolves the project by name, follows cursors and sends the token", async () => {
    const seenAuth: (string | null)[] = [];
    mockFetch((url, init) => {
      seenAuth.push(new Headers(init?.headers).get("authorization"));
      if (url.pathname === "/api/v1/projects") {
        return json({
          results: [
            { id: "p1", name: "Inbox" },
            { id: "p2", name: "Freelance" },
          ],
          next_cursor: null,
        });
      }
      expect(url.searchParams.get("project_id")).toBe("p2");
      return url.searchParams.get("cursor") === "c2"
        ? json({ results: [task("b", 1, null)], next_cursor: null })
        : json({ results: [task("a", 4, "2026-02-01")], next_cursor: "c2" });
    });

    const result = await fetchTasks("secret", "freelance");

    expect(result.map((t) => t.content)).toEqual(["a", "b"]);
    expect(seenAuth.every((h) => h === "Bearer secret")).toBe(true);
  });

  test("throws when the project does not exist", async () => {
    mockFetch(() => json({ results: [{ id: "p1", name: "Inbox" }], next_cursor: null }));
    await expect(fetchTasks("secret", "freelance")).rejects.toThrow("project not found");
  });

  test("throws without leaking the token on HTTP errors", async () => {
    mockFetch(() => json({ error: "Unauthorized" }, 401));
    const error = await fetchTasks("secret", "freelance").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("secret");
  });
});
