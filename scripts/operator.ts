import 'dotenv/config';
import { Effect } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { runtime } from '../src/lib/server/runtime';
import { findRecipient, registerMailbox } from '../src/lib/server/mail';
import { settings } from '../src/lib/server/config';
import { retryFailedJob } from '../src/lib/server/ingest';

const [command, argument] = process.argv.slice(2);
try {
  if (command === 'bootstrap') {
    for (const username of ['postmaster', 'abuse']) {
      if (await runtime.runPromise(findRecipient(`${username}@${settings().domain}`, true))) {
        console.info(`${username}@${settings().domain} already exists; use the previously saved key.`);
        continue;
      }
      const result = await runtime.runPromise(registerMailbox({ username, name: `${username} operations`, registrationToken: settings().registrationToken }, { operational: true }));
      // CLI output is intentionally the one-time handoff to the service operator.
      console.log(JSON.stringify(result));
    }
  } else if (command === 'jobs') {
    const rows = await runtime.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient;
      return yield* sql`SELECT id, state, attempts, last_error, created_at FROM inbound_jobs WHERE state != 'complete' ORDER BY created_at LIMIT 100`;
    }));
    console.table(rows);
  } else if (command === 'retry' && argument) {
    const rows = await runtime.runPromise(retryFailedJob(argument));
    console.log(rows.length ? 'Job queued for retry.' : 'No failed job with this ID.');
  } else {
    console.error('Usage: npm run operator -- bootstrap | jobs | retry <job-id>');
    process.exitCode = 1;
  }
} finally { await runtime.dispose(); }
