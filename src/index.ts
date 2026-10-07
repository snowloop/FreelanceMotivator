import { fetchAllFeeds } from "./collectors/rss.ts";
import { fetchTasks } from "./collectors/todoist.ts";
import { loadConfig, redactConfig } from "./config.ts";
import { chat } from "./llm/client.ts";
import { buildMessages } from "./llm/prompt.ts";
import { log } from "./log.ts";

async function main(): Promise<void> {
  const dryRun = Bun.argv.includes("--dry-run");
  const config = loadConfig();

  log.info(`Config loaded (dry-run: ${dryRun})`);
  log.info(JSON.stringify(redactConfig(config), null, 2));
  if (config.feeds.length === 0) log.warn("feeds.json is empty");

  const tasks = await fetchTasks(config.todoistToken, config.todoistProjectName);
  log.info(`Todoist: ${tasks.length} task(s)`);
  for (const t of tasks) log.info(`- [p${5 - t.priority}] ${t.content} (${t.due ?? "no date"})`);

  const items = await fetchAllFeeds(config.feeds);
  log.info(`Feeds: ${items.length} item(s)`);
  for (const i of items) log.info(`- [${i.date?.slice(0, 10) ?? "no date"}] ${i.title} (${i.link})`);

  const messages = buildMessages(tasks, items);
  log.info(`Prompt: ${messages.reduce((n, m) => n + m.content.length, 0)} characters`);
  const started = Date.now();
  const digest = await chat(config, messages);
  log.info(`LLM answered in ${((Date.now() - started) / 1000).toFixed(1)} s:\n${digest}`);
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
