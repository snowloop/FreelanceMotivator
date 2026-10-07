import { loadConfig, redactConfig } from "./config.ts";
import { log } from "./log.ts";

async function main(): Promise<void> {
  const dryRun = Bun.argv.includes("--dry-run");
  const config = loadConfig();

  log.info(`Config loaded (dry-run: ${dryRun})`);
  log.info(JSON.stringify(redactConfig(config), null, 2));
  if (config.feeds.length === 0) log.warn("feeds.json is empty");
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
