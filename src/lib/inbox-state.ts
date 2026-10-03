import { Effect, Stream, SubscriptionRef } from 'effect';
import type { Folder, InboxStats, Mailbox, Message, MessagePage, MessageSummary } from './types';

export interface InboxState {
  ready: boolean;
  loading: boolean;
  mailbox: Mailbox | null;
  domain: string;
  requiresToken: boolean;
  development: boolean;
  folder: Folder;
  query: string;
  unreadOnly: boolean;
  messages: MessageSummary[];
  counts: InboxStats;
  cursor: string | null;
  selected: Message | null;
  view: 'inbox' | 'connect' | 'settings' | 'docs';
  dialog: 'create' | 'signin' | null;
  apiKey: string | null;
  error: string | null;
  notice: string | null;
  requestVersion: number;
  selectionVersion: number;
}

const initial: InboxState = {
  ready: false, loading: false, mailbox: null, domain: 'mail.agmx.io', requiresToken: false, development: false,
  folder: 'inbox', query: '', unreadOnly: false, messages: [], counts: { inbox: 0, unread: 0, archive: 0, quarantine: 0 },
  cursor: null, selected: null, view: 'inbox', dialog: null, apiKey: null, error: null, notice: null,
  requestVersion: 0, selectionVersion: 0
};

// Effect owns state; Svelte only subscribes to snapshots through its store contract.
export function createInboxState() {
  const state = Effect.runSync(SubscriptionRef.make(initial));
  const patch = (update: Partial<InboxState>) => SubscriptionRef.update(state, (current) => ({ ...current, ...update,
    selectionVersion: update.selected === null ? current.selectionVersion + 1 : update.selectionVersion ?? current.selectionVersion }));
  const api = <T>(path: string, options?: RequestInit) => Effect.tryPromise({
    try: async () => {
      const response = await fetch(`/api/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body as T;
    },
    catch: (error) => error instanceof Error ? error : new Error('Unable to reach Agent Mail')
  });
  const operation = <A>(effect: Effect.Effect<A, Error>) => Effect.runPromise(effect.pipe(
    Effect.tapError((error) => patch({ error: error.message })),
    Effect.catch(() => Effect.void)
  ));

  const refresh = (append = false) => Effect.gen(function* () {
    const current = yield* SubscriptionRef.get(state);
    if (!current.mailbox) return;
    const version = current.requestVersion + 1;
    yield* patch({ loading: true, error: null, requestVersion: version });
    const params = new URLSearchParams({ folder: current.folder, q: current.query, unread: String(current.unreadOnly) });
    if (append && current.cursor) params.set('cursor', current.cursor);
    yield* Effect.gen(function* () {
      const [page, counts] = yield* Effect.all([api<MessagePage>(`messages?${params}`), api<InboxStats>('stats')], { concurrency: 2 });
      // Ignore results for a folder/filter that was changed while the request was in flight.
      const latest = yield* SubscriptionRef.get(state);
      if (latest.requestVersion !== version || latest.folder !== current.folder || latest.query !== current.query || latest.unreadOnly !== current.unreadOnly || latest.mailbox?.id !== current.mailbox?.id) return;
      yield* patch({ messages: append ? [...latest.messages, ...page.messages.filter((message) => !latest.messages.some((item) => item.id === message.id))] : page.messages,
        counts, cursor: page.next_cursor });
    }).pipe(Effect.ensuring(patch({ loading: false })));
  });

  return {
    subscribe(listener: (value: InboxState) => void) {
      listener(SubscriptionRef.getUnsafe(state));
      const fiber = Effect.runFork(Stream.runForEach(SubscriptionRef.changes(state), (value) => Effect.sync(() => listener(value))));
      return () => fiber.interruptUnsafe();
    },
    set: (update: Partial<InboxState>) => Effect.runSync(patch(update)),
    initialize: () => operation(Effect.gen(function* () {
      const session = yield* api<{ mailbox: Mailbox | null; domain: string; registration_requires_token: boolean; development: boolean }>('session');
      yield* patch({ ready: true, mailbox: session.mailbox, domain: session.domain, requiresToken: session.registration_requires_token, development: session.development });
      yield* refresh();
    })),
    refresh: (append = false) => operation(refresh(append)),
    changeFolder: (folder: Folder) => operation(Effect.gen(function* () {
      yield* patch({ folder, selected: null, query: '', unreadOnly: false, messages: [], view: 'inbox' });
      yield* refresh();
    })),
    search: (query: string) => operation(Effect.gen(function* () { yield* patch({ query }); yield* refresh(); })),
    filterUnread: (unreadOnly: boolean) => operation(Effect.gen(function* () { yield* patch({ unreadOnly }); yield* refresh(); })),
    register: (input: { username: string; name: string; registration_token?: string }) => operation(Effect.gen(function* () {
      yield* patch({ loading: true, error: null });
      yield* Effect.gen(function* () {
        const result = yield* api<{ mailbox: Mailbox; api_key: string }>('mailboxes', { method: 'POST', body: JSON.stringify(input), headers: { 'X-Agmx-Session': 'true' } });
        yield* patch({ mailbox: result.mailbox, apiKey: result.api_key, dialog: null, view: 'connect', selected: null });
        yield* refresh();
      }).pipe(Effect.ensuring(patch({ loading: false })));
    })),
    signin: (api_key: string) => operation(Effect.gen(function* () {
      yield* patch({ loading: true, error: null });
      yield* Effect.gen(function* () {
        const result = yield* api<{ mailbox: Mailbox }>('session', { method: 'POST', body: JSON.stringify({ api_key }) });
        yield* patch({ mailbox: result.mailbox, dialog: null, view: 'inbox', selected: null, apiKey: null });
        yield* refresh();
      }).pipe(Effect.ensuring(patch({ loading: false })));
    })),
    signout: () => operation(Effect.gen(function* () {
      yield* api('session', { method: 'DELETE' });
      yield* patch({ ...initial, ready: true, domain: SubscriptionRef.getUnsafe(state).domain });
      yield* api<{ domain: string; registration_requires_token: boolean; development: boolean }>('session').pipe(Effect.tap((session) => patch({ requiresToken: session.registration_requires_token, development: session.development })));
    })),
    openMessage: (id: string) => operation(Effect.gen(function* () {
      const current = yield* SubscriptionRef.get(state);
      const selectionVersion = current.selectionVersion + 1;
      yield* patch({ selectionVersion });
      const message = yield* api<Message>(`messages/${id}`);
      const latest = yield* SubscriptionRef.get(state);
      if (latest.selectionVersion !== selectionVersion || latest.mailbox?.id !== current.mailbox?.id) return;
      yield* patch({ selected: message });
      if (!message.read_at) {
        const updated = yield* api<Message>(`messages/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
        if (SubscriptionRef.getUnsafe(state).selectionVersion === selectionVersion) yield* patch({ selected: updated });
        yield* refresh();
      }
    })),
    updateMessage: (id: string, update: { read?: boolean; folder?: Folder }) => operation(Effect.gen(function* () {
      yield* api(`messages/${id}`, { method: 'PATCH', body: JSON.stringify(update) });
      yield* patch({ selected: null });
      yield* refresh();
    })),
    rotateKey: () => operation(Effect.gen(function* () {
      const result = yield* api<{ api_key: string }>('mailbox/key', { method: 'POST' });
      yield* patch({ apiKey: result.api_key, view: 'connect', notice: 'API key rotated. Update your agent configuration.' });
    })),
    copy: (text: string) => operation(Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text), catch: () => new Error('Copy failed. Select the text and copy it manually.')
    }).pipe(Effect.tap(() => patch({ notice: 'Copied to clipboard' }))))
  };
}
