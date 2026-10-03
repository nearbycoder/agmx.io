import { building, dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { runtime } from '#lib/server/runtime';
import { workerLoop } from '#lib/server/ingest';
import { startSmtp } from '#lib/server/smtp';

if (!building && dev) {
  const worker = runtime.runFork(workerLoop);
  const smtp = process.env.ENABLE_DEV_SMTP === 'true' ? startSmtp() : Promise.resolve(null);
  smtp.catch((error) => console.error('Development SMTP unavailable', error));
  import.meta.hot?.dispose(() => {
    worker.interruptUnsafe();
    smtp.then((server) => server?.close());
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Frame-Options', 'DENY');
  if (event.url.pathname.startsWith('/api') || event.url.pathname === '/mcp') {
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
};
