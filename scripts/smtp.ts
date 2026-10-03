import 'dotenv/config';
import { startSmtp } from '../src/lib/server/smtp';
import { runtime } from '../src/lib/server/runtime';

if (!process.env.DATABASE_URL) throw new Error('Separate SMTP processes require DATABASE_URL. For embedded local SMTP, use ENABLE_DEV_SMTP=true with npm run dev.');
const server = await startSmtp();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => { await runtime.dispose(); process.exit(0); });
  });
}
