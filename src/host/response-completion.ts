import { AsyncLocalStorage } from "node:async_hooks";

export type ResponseCompletionTask = () => void | Promise<void>;

interface ResponseCompletionScope {
  readonly tasks: ResponseCompletionTask[];
}

export interface CapturedResponse<T> {
  readonly value: T;
  readonly tasks: readonly ResponseCompletionTask[];
}

/**
 * Associates host-side work with the HTTP request that scheduled it. Tasks are
 * released only after Node confirms that the JSON response has been flushed.
 * This is required for actions that intentionally stop or restart DSH itself.
 */
export class ResponseCompletionScheduler {
  private readonly storage = new AsyncLocalStorage<ResponseCompletionScope>();

  async capture<T>(operation: () => Promise<T>): Promise<CapturedResponse<T>> {
    const scope: ResponseCompletionScope = { tasks: [] };
    const value = await this.storage.run(scope, operation);
    return { value, tasks: [...scope.tasks] };
  }

  defer(task: ResponseCompletionTask): void {
    const scope = this.storage.getStore();
    if (scope === undefined) {
      throw new Error("response-completion task must be registered while handling a management request");
    }
    scope.tasks.push(task);
  }

  flush(tasks: readonly ResponseCompletionTask[]): void {
    for (const task of tasks) {
      queueMicrotask(() => {
        void Promise.resolve()
          .then(task)
          .catch((error: unknown) => {
            console.error("dsh-resource-management: deferred response-completion task failed", error);
          });
      });
    }
  }
}
