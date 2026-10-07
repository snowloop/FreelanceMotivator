script running daily at 9AM

- Takes tasks from my Todoist in the project freelance
- look for fresh news about freelancing in France using an LLM
- Send me a summary of the last 3 results using an LLM.

# Plan: FreelanceMotivator

## 1. Architecture
- One script run daily at 9:00 by a scheduler (launchd or cron on this machine for now; hardware to be decided later).
- Pipeline: **collect, then summarize, then send**.
- Each collector is an independent module that returns plain text or JSON. A failure in one collector does not stop the others.
- Use Bun and TypeScript.
- The LLM runs locally, called over HTTP from the script.
- Keep secrets in a `.env` file, never in the repo.

## 2. Collectors

**Todoist**
- Use the official Todoist API with a token (the unified API v1; REST v2 is being deprecated, so verify the endpoint in the Todoist docs). List the active tasks of the project after looking up its ID by name.
- Keep the content, due date, and priority fields.

**Freelancing news in France (3 RSS feeds)**
- The 3 feed URLs go in a config file. Candidates: Google News RSS with a French query ("freelance", "portage salarial", "auto-entrepreneur"), URSSAF, and a freelance-focused blog.
- Fetch the 3 feeds in parallel with `fetch` and an 8 s timeout, and parse them with a small XML parser such as `fast-xml-parser`.
- Per feed, keep the latest 3 items (title, link, date, description). Strip HTML from the description and truncate each to about 300 characters.
- No LLM is needed at this stage. The LLM only summarizes.

## 3. LLM step
- Local model: TinyLLM (to confirm the exact model, for example TinyLlama 1.1B in a Q4 GGUF, about 640 MB).
- Serve it with `llama.cpp` (`llama-server`) or Ollama, and call its OpenAI-compatible HTTP endpoint from Bun.
- Keep the setup light so it can later move to modest hardware:
  - Context stays small (2048 tokens), hence the truncated feed items.
  - A 1B model is weak in French and at following instructions, so keep the prompt short and simple.
  - Start the LLM server on demand and stop it after the run to free RAM.
- Single prompt, in one call:
  - Input: the Todoist tasks and the 9 RSS items (3 feeds x 3 items).
  - Task: sum it all up in a short, motivating digest. Sections: today's tasks, then the news.
  - Settings: low temperature (0.3), `max_tokens` about 300.
- Fallback: if the LLM fails or times out, send a plain-text digest built from the raw data (no LLM).

## 4. "Last 3 results"
Interpreted as the latest 3 items of each RSS feed. Todoist tasks are all passed in, capped at about 10 and sorted by priority and due date. No persistence is needed.

## 5. Delivery
Pick one:
- Telegram bot (simplest, free, instant).
- ntfy.sh push notification.
- Email through SMTP.

## 6. Reliability
- Add timeouts and retries on every network call.
- If a source fails, send the digest anyway with a "source unavailable" note.
- Log to a file and send an alert if the whole run fails.
- Add a `--dry-run` flag that prints the digest instead of sending it.

## 7. Implementation plan

Rule: the assistant never runs commands. Every command below is for you to run.

### Target layout
```
FreelanceMotivator/
  package.json  tsconfig.json  .env.example  .gitignore
  feeds.json                  # the 3 RSS feed URLs
  src/
    index.ts                  # entry point, parses --dry-run, orchestrates
    config.ts                 # reads env and feeds.json, validates
    log.ts                    # timestamped logger, console + logs/run.log
    types.ts                  # Task, FeedItem, DigestInput
    http.ts                   # fetchWithTimeout + retry with backoff
    collectors/
      todoist.ts              # fetchTasks()
      rss.ts                  # fetchFeedItems()
    llm/
      client.ts               # chat completion call to the local server
      prompt.ts               # builds the prompt from tasks + items
    digest.ts                 # LLM digest with plain-text fallback
    notify/
      index.ts                # Notifier interface + stdout notifier
      <channel>.ts            # telegram.ts, ntfy.ts or email.ts once chosen
  tests/                      # bun test files and RSS fixtures
```

### Phase 1: Scaffold
- Create `package.json`, `tsconfig.json` (strict), `.gitignore` (`.env`, `logs/`, `node_modules/`), and `.env.example`.
- `.env.example` keys: `TODOIST_TOKEN`, `TODOIST_PROJECT_NAME`, `LLM_BASE_URL`, `LLM_MODEL`, and the delivery channel keys.
- `config.ts` fails fast with a clear message when a required variable is missing. Bun loads `.env` automatically.
- `log.ts` and `http.ts` (8 s timeout, 2 retries with backoff) are shared by all modules.
- Commands for you: `cd FreelanceMotivator`, `bun init`, `bun add fast-xml-parser`.
- Done when: `bun run src/index.ts` starts and prints the loaded config with secrets hidden.

### Phase 2: Todoist collector
- `fetchTasks()` resolves the project ID by name, then returns active tasks as `Task { content, due, priority }`.
- Sort by priority then due date, and cap at 10.
- Tests: mock `fetch` and check the mapping, sorting, cap, and the "project not found" error.
- Command for you: `bun test`.
- Done when: a real call with your token prints your freelance tasks.

### Phase 3: RSS collector
- `fetchFeedItems(url)` fetches and parses RSS 2.0 and Atom, then returns the latest 3 `FeedItem { title, link, date, summary }`.
- Strip HTML and truncate the summary to about 300 characters. Decode entities.
- `fetchAllFeeds()` runs the 3 feeds with `Promise.allSettled`, so one broken feed only drops its own items.
- Tests: saved RSS and Atom fixtures for parsing, truncation, and sorting by date.
- Done when: 9 items print from your 3 real feeds.

### Phase 4: Local LLM
- Commands for you: install `llama.cpp` (`brew install llama.cpp`) or Ollama, download the TinyLlama 1.1B Q4 model, then start the server (for example `llama-server -m <model.gguf> -c 2048 --port 8080`).
- `llm/client.ts` posts to `${LLM_BASE_URL}/v1/chat/completions` with temperature 0.3, `max_tokens` 300, and a 120 s timeout.
- `llm/prompt.ts` builds a short prompt (in French or English, to be tested): system message with the role and output format, user message with the tasks and the 9 items.
- Guard the context: if the prompt exceeds the budget (about 1500 tokens, estimated as characters / 4), trim item summaries first.
- Done when: a sample prompt returns a usable digest, and you have noted its speed and quality.
- If the quality is poor, tune the prompt or try a slightly larger model (Qwen2.5 1.5B, Llama 3.2 1B) before changing the design.

### Phase 5: Digest and fallback
- `digest.ts` calls the LLM and returns the text. On error, timeout, or an empty or too short answer, it returns a plain-text digest built from the raw tasks and items.
- Tests: LLM mocked to succeed, to fail, and to return an empty string.
- Done when: stopping the LLM server still produces a readable digest.

### Phase 6: Delivery
- Define `Notifier { send(text): Promise<void> }` and a stdout notifier, used for `--dry-run`.
- Implement the chosen channel (Telegram, ntfy, or email). Telegram needs a bot token and chat ID, which you create yourself.
- Done when: a test message reaches your phone or inbox.

### Phase 7: Orchestration
- `index.ts` runs Todoist and the RSS collectors in parallel, builds the digest, then sends it. Failed sources become a "source unavailable" line instead of stopping the run.
- A top-level error handler sends a short failure alert and exits with a non-zero code.
- `--dry-run` uses the stdout notifier. Add a script `"start": "bun run src/index.ts"` and `"dry": "bun run src/index.ts --dry-run"`.
- Done when: `bun run dry` prints a full digest end to end.

### Phase 8: Scheduling
- Write a `run.sh` wrapper that starts `llama-server` if it is not running, waits until it answers, runs the script, then stops the server.
- Schedule `run.sh` at 9:00 with a launchd plist in `~/Library/LaunchAgents` (`StartCalendarInterval`, logs to `logs/`) or a cron entry. launchd runs a missed job when the Mac wakes, and cron does not.
- Commands for you: `launchctl load` the plist, then trigger it once manually to check.
- Note: the Mac must be awake or asleep-but-wakeable at 9:00. Consider `pmset repeat wakeorpoweron` if needed.
- Done when: a scheduled run delivers the digest without you doing anything.

### Phase 9: Later
- Pick the hardware, then move the repo, model, `.env`, and scheduler. Adjust the model size and context to the new machine.

### Risks
- A 1B model may ignore instructions or write poor French. The fallback digest and prompt tuning cover this, and a larger model is the next step.
- RSS feeds change or break. `allSettled` and the "source unavailable" line keep the run alive.
- A Mac that sleeps misses the 9:00 job. See Phase 8.

## Open questions
- Which delivery channel (Telegram, email, or ntfy)?
- Which exact model is "TinyLLM" (TinyLlama 1.1B?)?
- Which 3 RSS feeds?
- Is "last 3 results" meant as 3 items per feed (9 total) or 3 items overall?