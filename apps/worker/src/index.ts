export interface WorkerApplication {
  readonly started: boolean;
  start(): void;
}

export function createWorkerApplication(options: { start: boolean }): WorkerApplication {
  let started = options.start;

  return {
    get started() {
      return started;
    },
    start() {
      started = true;
    }
  };
}
