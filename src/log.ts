import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const logDir = join(import.meta.dir, "..", "logs");
const logFile = join(logDir, "run.log");

type Level = "INFO" | "WARN" | "ERROR";

function write(level: Level, message: string): void {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  const out = level === "INFO" ? console.log : console.error;
  out(line);
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(logFile, line + "\n");
  } catch {
    // Console output is enough if the log file is not writable.
  }
}

export const log = {
  info: (message: string) => write("INFO", message),
  warn: (message: string) => write("WARN", message),
  error: (message: string) => write("ERROR", message),
};
