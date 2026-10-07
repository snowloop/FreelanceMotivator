import { afterEach, describe, expect, test } from "bun:test";
import { feedUrl, fetchAllFeeds, parseFeed } from "../src/collectors/rss.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;

const rssItem = (title: string, pubDate: string, description = "") =>
  `<item><title>${title}</title><link>https://example.com/${encodeURIComponent(title)}</link>` +
  `<pubDate>${pubDate}</pubDate><description>${description}</description></item>`;

describe("parseFeed (RSS)", () => {
  test("keeps the 3 most recent items, newest first", () => {
    const xml = rss(
      rssItem("old", "Mon, 05 Oct 2026 08:00:00 GMT") +
        rssItem("newest", "Wed, 07 Oct 2026 08:00:00 GMT") +
        rssItem("oldest", "Sun, 04 Oct 2026 08:00:00 GMT") +
        rssItem("middle", "Tue, 06 Oct 2026 08:00:00 GMT"),
    );

    const items = parseFeed(xml);

    expect(items.map((i) => i.title)).toEqual(["newest", "middle", "old"]);
    expect(items[0]?.date).toBe("2026-10-07T08:00:00.000Z");
    expect(items[0]?.link).toBe("https://example.com/newest");
  });

  test("strips HTML and decodes entities in the summary", () => {
    const xml = rss(
      rssItem(
        "a",
        "Wed, 07 Oct 2026 08:00:00 GMT",
        "&lt;a href=&quot;https://x.test&quot;&gt;Le&amp;nbsp;TJM&lt;/a&gt;&lt;font&gt;Source&lt;/font&gt; &amp;#233;t&amp;#233;",
      ),
    );

    expect(parseFeed(xml)[0]?.summary).toBe("Le TJM Source été");
  });

  test("reads CDATA descriptions", () => {
    const xml = rss(
      `<item><title>c</title><link>https://example.com/c</link>` +
        `<description><![CDATA[<p>Hello <b>world</b></p>]]></description></item>`,
    );

    expect(parseFeed(xml)[0]?.summary).toBe("Hello world");
  });

  test("truncates long summaries to 300 characters", () => {
    const xml = rss(rssItem("long", "Wed, 07 Oct 2026 08:00:00 GMT", "x".repeat(1000)));

    const summary = parseFeed(xml)[0]?.summary ?? "";

    expect(summary).toHaveLength(300);
    expect(summary.endsWith("…")).toBe(true);
  });

  test("keeps numeric titles as strings and tolerates bad dates", () => {
    const xml = rss(rssItem("2026", "not a date"));

    const [item] = parseFeed(xml);

    expect(item?.title).toBe("2026");
    expect(item?.date).toBeNull();
  });
});

describe("parseFeed (Atom)", () => {
  test("reads title, alternate link, date and summary", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title type="html">Atom &amp; co</title>
          <link rel="self" href="https://example.com/self"/>
          <link rel="alternate" href="https://example.com/post"/>
          <updated>2026-10-07T08:00:00Z</updated>
          <summary>Short   summary</summary>
        </entry>
      </feed>`;

    expect(parseFeed(xml)).toEqual([
      {
        title: "Atom & co",
        link: "https://example.com/post",
        date: "2026-10-07T08:00:00.000Z",
        summary: "Short summary",
      },
    ]);
  });
});

describe("feedUrl", () => {
  test("turns a keyword into a French Google News search", () => {
    expect(feedUrl("développeur")).toBe(
      "https://news.google.com/rss/search?q=d%C3%A9veloppeur&hl=fr&gl=FR&ceid=FR:fr",
    );
  });

  test("leaves real URLs untouched", () => {
    expect(feedUrl("https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
  });
});

describe("fetchAllFeeds", () => {
  test("a failing feed only drops its own items", async () => {
    globalThis.fetch = (async (input: Request | URL) => {
      const url = String(input);
      if (url.includes("broken")) return new Response("nope", { status: 404 });
      return new Response(rss(rssItem(url, "Wed, 07 Oct 2026 08:00:00 GMT")), { status: 200 });
    }) as unknown as typeof fetch;

    const items = await fetchAllFeeds([
      "https://good.test/a.xml",
      "https://broken.test/b.xml",
      "https://good.test/c.xml",
    ]);

    expect(items.map((i) => i.title)).toEqual([
      "https://good.test/a.xml",
      "https://good.test/c.xml",
    ]);
  });
});
