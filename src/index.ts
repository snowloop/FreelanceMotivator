import { fetchTasks } from "./collectors/todoist.ts";
import { loadConfig, redactConfig } from "./config.ts";
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
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
