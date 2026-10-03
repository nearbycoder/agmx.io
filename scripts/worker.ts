import 'dotenv/config';
import { runtime } from '../src/lib/server/runtime';
import { workerLoop, maintenanceLoop } from '../src/lib/server/ingest';

if (!process.env.DATABASE_URL) throw new Error('Separate worker processes require DATABASE_URL. The development app runs its own embedded worker.');
const fiber = runtime.runFork(workerLoop);
const maintenance = runtime.runFork(maintenanceLoop);
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    fiber.interruptUnsafe();
    maintenance.interruptUnsafe();
    await runtime.dispose();
    process.exit(0);
  });
}
await new Promise<void>(() => {});
