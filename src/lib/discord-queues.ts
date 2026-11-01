/**
 * Discord queues domain module (plan 1.4): the typed enqueue functions and the worker concurrency contract
 * (claim / complete / fail / release / abandoned reset / external result) for all 19 queue and job tables.
 *
 *   enqueue*       -> `src/lib/queues/enqueue.ts`  (take an `Executor`; call them inside your business transaction)
 *   claimJobs ...  -> `src/lib/queues/worker.ts`   (used by the bot's QueueProcessor and the stats-processor)
 *   registry       -> `src/lib/queues/registry.ts`
 */
export * from './queues/registry';
export * from './queues/worker';
export * from './queues/enqueue';
