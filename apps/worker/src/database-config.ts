import { readDatabaseUrl } from '@backoffice/db';

export interface WaitOptions { read?: () => string | undefined; sleep?: (ms: number) => Promise<void>; log?: (line: string) => void; intervalMs?: number; }

/** Before the first-run setup page has saved a database URL, the worker waits for it instead of exiting and restarting in a loop. */
export async function waitForDatabaseUrl(options: WaitOptions = {}): Promise<string> {
  const read = options.read ?? (() => readDatabaseUrl());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? ((line: string) => console.log(line));
  let logged = false;
  for (;;) {
    const url = read();
    if (url) return url;
    if (!logged) { log('backoffice.worker.waiting_for_database_config'); logged = true; }
    await sleep(options.intervalMs ?? 10_000);
  }
}
