import { XMLParser } from "fast-xml-parser";
import { fetchWithTimeout } from "../http.ts";
import { log } from "../log.ts";
import type { FeedItem } from "../types.ts";

const ITEMS_PER_FEED = 3;
const SUMMARY_MAX = 300;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => name === "item" || name === "entry",
});

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return textOf(value["#text"]);
  return "";
}

// RSS has a text <link>; Atom has <link href="..."> elements, possibly several.
function linkOf(value: unknown): string {
  const candidates: any[] = Array.isArray(value) ? value : [value];
  const alternate = candidates.find(
    (c) => c && typeof c === "object" && (c["@_rel"] ?? "alternate") === "alternate",
  );
  const pick = alternate ?? candidates[0];
  if (pick && typeof pick === "object") return String(pick["@_href"] ?? textOf(pick));
  return textOf(pick).trim();
}

function toIso(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function parseFeed(xml: string, limit = ITEMS_PER_FEED): FeedItem[] {
  const doc: any = parser.parse(xml);
  const entries: any[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];

  return entries
    .map((e): FeedItem => ({
      title: clean(textOf(e.title)),
      link: linkOf(e.link),
      date: toIso(textOf(e.pubDate ?? e.published ?? e.updated ?? e["dc:date"])),
      summary: truncate(
        clean(textOf(e.description ?? e.summary ?? e["content:encoded"] ?? e.content)),
        SUMMARY_MAX,
      ),
    }))
    .filter((item) => item.title !== "")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

// A feeds.json entry that is not a URL is a Google News search query.
export function feedUrl(entry: string): string {
  if (/^https?:\/\//i.test(entry)) return entry;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(entry)}&hl=fr&gl=FR&ceid=FR:fr`;
}

export async function fetchFeedItems(entry: string, limit = ITEMS_PER_FEED): Promise<FeedItem[]> {
  const response = await fetchWithTimeout(feedUrl(entry));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFeed(await response.text(), limit);
}

export async function fetchAllFeeds(entries: string[]): Promise<FeedItem[]> {
  const results = await Promise.allSettled(entries.map((entry) => fetchFeedItems(entry)));

  return results.flatMap((result, i) => {
    if (result.status === "fulfilled") return result.value;
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    log.warn(`Feed "${entries[i]}" skipped: ${reason}`);
    return [];
  });
}
