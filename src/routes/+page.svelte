<script lang="ts">
  import { onMount } from 'svelte';
  import { Archive, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Code, Copy, ExternalLink,
    Inbox, KeyRound, Mail, MoreHorizontal, Plus, RefreshCw, Search, Settings, Shield, Terminal, Unplug, X, Zap, Circle } from '@lucide/svelte';
  import { createInboxState } from '#lib/inbox-state';
  import type { Folder } from '#lib/types';

  const inbox = createInboxState();
  onMount(() => {
    inbox.initialize();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') inbox.refresh(); }, 15_000);
    return () => clearInterval(timer);
  });

  const folderNames: Record<Folder, string> = { inbox: 'Inbox', archive: 'Archive', quarantine: 'Quarantine' };
  const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeLabel = (date: string) => new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const senderName = (sender: string) => sender.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || sender;
  const endpoint = () => typeof window !== 'undefined' ? `${window.location.origin}/mcp` : 'https://agmx.io/mcp';
  const mcpConfig = () => JSON.stringify({ mcpServers: { 'agmx-mail': { url: endpoint(), headers: { Authorization: `Bearer ${$inbox.apiKey || 'YOUR_MAILBOX_API_KEY'}` } } } }, null, 2);

  function register(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    inbox.register({ name: String(data.get('name')), username: String(data.get('username')), registration_token: String(data.get('registration_token') || '') });
  }
  function signin(event: SubmitEvent) {
    event.preventDefault();
    inbox.signin(String(new FormData(event.currentTarget as HTMLFormElement).get('api_key')).trim());
  }
  function modal(node: HTMLDialogElement) {
    node.showModal();
    node.querySelector('input')?.focus();
  }
</script>

<svelte:head>
  <title>Agent Mail — agmx.io</title>
  <meta name="description" content="A dedicated inbox for every agent. Register an email address, receive messages, and connect your inbox through MCP." />
  <meta property="og:title" content="Agent Mail · agmx.io" />
  <meta property="og:description" content="Email infrastructure for autonomous agents. Your inbox, accessible through MCP." />
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <a href="/" class="brand" aria-label="Agent Mail home"><span class="brand-icon"><Mail size={22} strokeWidth={1.8} /></span><span>agent<span class="brand-mail">mail</span><small>BY AGMX.IO</small></span></a>
    <div class="workspace-label">WORKSPACE</div>
    <button class="workspace" onclick={() => inbox.set({ dialog: $inbox.mailbox ? 'signin' : 'create', error: null })}>
      <span class="workspace-avatar">{$inbox.mailbox?.name.charAt(0).toUpperCase() || 'A'}</span>
      <span><strong>{$inbox.mailbox?.name || 'Your agent workspace'}</strong><small>{$inbox.mailbox?.address || 'Create your first inbox'}</small></span><ChevronRight size={15} />
    </button>
    <nav aria-label="Main navigation">
      <div class="nav-label">MAILBOX</div>
      <button class:active={$inbox.view === 'inbox' && $inbox.folder === 'inbox'} onclick={() => inbox.changeFolder('inbox')}><Inbox size={18} /> Inbox <span class="nav-count">{$inbox.counts.unread}</span></button>
      <button class:active={$inbox.view === 'inbox' && $inbox.folder === 'archive'} onclick={() => inbox.changeFolder('archive')}><Archive size={18} /> Archive {#if $inbox.counts.archive}<span class="nav-count">{$inbox.counts.archive}</span>{/if}</button>
      <button class:active={$inbox.view === 'inbox' && $inbox.folder === 'quarantine'} onclick={() => inbox.changeFolder('quarantine')}><Shield size={18} /> Quarantine {#if $inbox.counts.quarantine}<span class="nav-count">{$inbox.counts.quarantine}</span>{/if}</button>
      <div class="nav-label second">DEVELOPER</div>
      <button class:active={$inbox.view === 'connect'} onclick={() => inbox.set({ view: 'connect', selected: null })}><Unplug size={18} /> MCP connection <span class="tiny-label">MCP</span></button>
      <button class:active={$inbox.view === 'docs'} onclick={() => inbox.set({ view: 'docs', selected: null })}><Code size={18} /> API reference <ExternalLink size={12} class="nav-end" /></button>
      <button class:active={$inbox.view === 'settings'} onclick={() => inbox.set({ view: 'settings', selected: null })}><Settings size={18} /> Settings</button>
    </nav>
    <div class="sidebar-bottom">
      <div class="built-for"><span class="spark"><Zap size={17} /></span><strong>Built for your next agent.</strong><p>Give it an address.<br />Let it take it from there.</p><button onclick={() => inbox.set({ view: 'docs' })}>Read the quickstart <ArrowRight size={14} /></button></div>
      <div class="sidebar-footer"><span>agmx.io</span><span class="version">v0.1</span></div>
    </div>
  </aside>

  <div class="main-shell">
    <header class="topbar">
      <div class="breadcrumbs">Workspace <ChevronRight size={13} /><strong>{$inbox.view === 'inbox' ? folderNames[$inbox.folder] : $inbox.view === 'connect' ? 'MCP connection' : $inbox.view === 'docs' ? 'API reference' : 'Settings'}</strong></div>
      <div class="top-actions"><span class="private-badge"><Shield size={13} /> Private inboxes</span><button class="icon-button" aria-label="Open quickstart" onclick={() => inbox.set({ view: 'docs' })}><CircleHelp size={19} /></button><button class="user-avatar" aria-label="Open mailbox settings" onclick={() => inbox.set({ view: 'settings' })}>{$inbox.mailbox?.name.charAt(0).toUpperCase() || 'A'}</button></div>
    </header>
    <main>
      {#if $inbox.error}<div class="alert error" role="alert">{$inbox.error}<button aria-label="Dismiss error" onclick={() => inbox.set({ error: null })}><X size={15} /></button></div>{/if}
      {#if $inbox.notice}<div class="alert success" role="status"><Check size={16} />{$inbox.notice}<button aria-label="Dismiss notification" onclick={() => inbox.set({ notice: null })}><X size={15} /></button></div>{/if}

      {#if $inbox.view === 'inbox'}
        <div class="page-heading"><div><div class="eyebrow">EMAIL, FOR AGENTS</div><h1>{$inbox.selected ? 'Message' : folderNames[$inbox.folder]}</h1><p>A real email address. An inbox your agent can actually use.</p></div><button class="button primary" onclick={() => inbox.set({ dialog: 'create', error: null })}><Plus size={17} /> Create inbox</button></div>
        <div class="stat-grid">
          <div class="stat-card"><span class="stat-icon peach"><Mail size={20} /></span><div><span class="stat-label">Inbox address</span><strong class="address-stat">{$inbox.mailbox?.address || 'No inbox yet'}</strong><small>{$inbox.mailbox ? $inbox.mailbox.name : 'An identity for your agent'}</small></div></div>
          <div class="stat-card"><span class="stat-icon lavender"><Inbox size={20} /></span><div><span class="stat-label">Received</span><strong>{$inbox.counts.inbox + $inbox.counts.archive + $inbox.counts.quarantine}<span class="stat-unit">emails</span></strong><small>Across all folders</small></div></div>
          <div class="stat-card"><span class="stat-icon sage"><Circle size={19} /></span><div><span class="stat-label">Unread</span><strong>{$inbox.counts.unread}<span class="stat-unit">emails</span></strong><small>Ready for your agent</small></div></div>
        </div>

        {#if $inbox.selected}
          <section class="message-detail panel">
            <div class="message-actions"><button class="text-button" onclick={() => inbox.set({ selected: null })}><ArrowLeft size={15} /> Back to inbox</button><div><button class="button secondary small" onclick={() => inbox.updateMessage($inbox.selected!.id, { read: false })}>Mark unread</button><button class="button secondary small" onclick={() => inbox.updateMessage($inbox.selected!.id, { folder: $inbox.selected!.folder === 'archive' ? 'inbox' : 'archive' })}><Archive size={15} />{$inbox.selected.folder === 'archive' ? 'Restore' : 'Archive'}</button>{#if $inbox.selected.folder === 'quarantine'}<button class="button secondary small" onclick={() => inbox.updateMessage($inbox.selected!.id, { folder: 'inbox' })}>Move to inbox</button>{/if}</div></div>
            <h2>{$inbox.selected.subject}</h2><div class="message-meta"><span class="sender-avatar">{senderName($inbox.selected.sender).charAt(0).toUpperCase()}</span><div><strong>{$inbox.selected.sender}</strong><small>To {$inbox.mailbox?.address} · {timeLabel($inbox.selected.received_at)}</small></div></div>
            {#if $inbox.selected.folder === 'quarantine'}<div class="alert">This message was quarantined by the spam filter. Score: {$inbox.selected.spam_score ?? 'unavailable'}.</div>{/if}
            <pre class="email-body">{$inbox.selected.text_body || '(This email has no text content.)'}</pre>
            {#if $inbox.selected.attachments.length}<div class="attachments"><h3>Attachments</h3>{#each $inbox.selected.attachments as attachment}<a href={`/api/attachments/${attachment.id}`} class="attachment"><ArrowDownToLine size={18} /><span>{attachment.filename}<small>{Math.ceil(attachment.size / 1024)} KB · {attachment.content_type}</small></span></a>{/each}</div>{/if}
          </section>
        {:else}
          <section class="inbox-panel panel">
            <div class="panel-heading"><div class="panel-title"><h2>{$inbox.mailbox?.name || 'Your inbox'}</h2><span class="count-pill">{$inbox.messages.length}</span>{#if $inbox.mailbox}<span class="address-caption">{$inbox.mailbox.address}</span>{/if}</div><button class="icon-button" aria-label="Refresh inbox" disabled={$inbox.loading || !$inbox.mailbox} onclick={() => inbox.refresh()}><RefreshCw size={16} class={$inbox.loading ? 'spinning' : ''} /></button></div>
            <div class="inbox-toolbar"><div class="filter-tabs"><button class:chosen={!$inbox.unreadOnly} onclick={() => inbox.filterUnread(false)}>All messages</button><button class:chosen={$inbox.unreadOnly} onclick={() => inbox.filterUnread(true)}>Unread <span>{$inbox.counts.unread}</span></button></div><form class="search-box" onsubmit={(event) => { event.preventDefault(); inbox.search(String(new FormData(event.currentTarget).get('q') || '')); }}><Search size={16} /><input name="q" aria-label="Search emails" placeholder="Search emails…" value={$inbox.query} disabled={!$inbox.mailbox} /><kbd>↵</kbd></form></div>
            {#if !$inbox.ready && !$inbox.error}<div class="empty-state"><RefreshCw size={26} class="spinning" /><h3>Opening your workspace…</h3></div>
            {:else if !$inbox.mailbox}
              <div class="empty-state"><div class="empty-illustration"><div class="mail-orbit orbit-one"></div><div class="mail-orbit orbit-two"></div><span class="empty-mail"><Inbox size={37} strokeWidth={1.35} /></span><span class="empty-plus"><Plus size={14} /></span></div><span class="mini-eyebrow">A FRESH START</span><h3>Your agent's inbox starts here.</h3><p>Give your agent a dedicated email address to receive<br class="desktop-break" /> messages, verifications, and everything in between.</p><button class="button primary" onclick={() => inbox.set({ dialog: 'create', error: null })}><Plus size={16} /> Create your first inbox</button><span class="empty-signin">Already have an inbox? <button onclick={() => inbox.set({ dialog: 'signin', error: null })}>Open it with your API key <ArrowRight size={12} /></button></span></div>
            {:else if !$inbox.messages.length}
              <div class="empty-state"><span class="empty-mail compact"><Inbox size={37} strokeWidth={1.35} /></span><h3>{$inbox.query ? 'No matching messages.' : $inbox.unreadOnly ? 'All caught up.' : $inbox.folder === 'inbox' ? 'Ready for the first hello.' : `Your ${$inbox.folder} is empty.`}</h3><p>{#if $inbox.folder === 'inbox' && !$inbox.query}Send an email to <strong>{$inbox.mailbox.address}</strong>.<br />New messages appear here automatically.{:else}Messages will appear here when they match this view.{/if}</p><button class="button secondary" onclick={() => inbox.copy($inbox.mailbox!.address)}><Copy size={15} /> Copy inbox address</button>{#if $inbox.development}<span class="development-note">Local development: run the SMTP receiver to test delivery.<br />Public email requires the server and MX records to be configured.</span>{/if}</div>
            {:else}
              <div class="message-list">{#each $inbox.messages as message}<button class="message-row" class:unread={!message.read_at} onclick={() => inbox.openMessage(message.id)}><span class="unread-dot" class:visible={!message.read_at}></span><span class="sender-avatar">{senderName(message.sender).charAt(0).toUpperCase()}</span><span class="message-sender">{senderName(message.sender)}</span><span class="message-content"><strong>{message.subject}</strong><span>{message.preview}</span></span>{#if message.attachment_count}<span class="attachment-count"><ArrowDownToLine size={13} />{message.attachment_count}</span>{/if}<time>{dateLabel(message.received_at)}</time><ChevronRight size={14} /></button>{/each}</div>
              {#if $inbox.cursor}<div class="load-more"><button class="button secondary small" disabled={$inbox.loading} onclick={() => inbox.refresh(true)}>Load more messages</button></div>{/if}
            {/if}
            <div class="panel-footer"><span><Shield size={13} /> Only your agent has access to this inbox</span><span>Auto refresh · 15 sec</span></div>
          </section>
          <div class="bottom-grid"><section class="connection-card"><span class="connect-icon"><Unplug size={23} /></span><div><span class="mini-eyebrow">NATIVE MCP ACCESS</span><h3>An inbox that speaks agent.</h3><p>Let your agent read and manage emails directly<br class="desktop-break" /> from its favorite tools. One connection, all set.</p><button class="text-button" onclick={() => inbox.set({ view: 'connect' })}>Connect with MCP <ArrowRight size={15} /></button></div><span class="code-decoration" aria-hidden="true">{'{ }'}</span></section><section class="how-card"><h3>From address to action.</h3><div><span>01</span><p><strong>Create an inbox</strong><small>Choose a name for your agent.</small></p><Check size={15} /></div><div><span>02</span><p><strong>Connect your agent</strong><small>Add your mailbox API key.</small></p><ChevronRight size={15} /></div><div><span>03</span><p><strong>Let the mail come in</strong><small>Read it through MCP or the API.</small></p><ChevronRight size={15} /></div></section></div>
        {/if}

      {:else if $inbox.view === 'connect'}
        <div class="page-heading"><div><div class="eyebrow">ONE CONNECTION. YOUR INBOX.</div><h1>Connect your agent</h1><p>Read and manage email from any client that supports remote MCP.</p></div><span class="protocol-badge"><Unplug size={16} /> Streamable HTTP</span></div>
        {#if !$inbox.mailbox}<section class="panel setup-empty"><Unplug size={32} /><h2>First, give your agent an inbox.</h2><p>Your inbox comes with its own API key and MCP access.</p><button class="button primary" onclick={() => inbox.set({ dialog: 'create' })}><Plus size={16} />Create inbox</button><button class="text-button" onclick={() => inbox.set({ dialog: 'signin' })}>Open an existing inbox <ArrowRight size={14} /></button></section>
        {:else}<div class="connect-grid"><section class="panel setup-panel"><span class="step-label">STEP 01</span><h2>Your mailbox key</h2><p>Use this key to authenticate your agent. It grants access only to <strong>{$inbox.mailbox.address}</strong>.</p>{#if $inbox.apiKey}<div class="key-notice"><KeyRound size={17} /> Save this key now. It is only shown once.</div><div class="secret-box"><code>{$inbox.apiKey}</code><button class="icon-button" aria-label="Copy API key" onclick={() => inbox.copy($inbox.apiKey!)}><Copy size={17} /></button></div><button class="text-button" onclick={() => inbox.set({ apiKey: null, notice: 'Key hidden. Use your saved copy to connect your agent.' })}>I saved my key <Check size={15} /></button>{:else}<div class="masked-key"><KeyRound size={18} /><span>Use the API key you saved at registration.</span></div><p class="muted-small">Keys are stored as hashes and cannot be recovered. You can issue a new one in Settings.</p>{/if}<div class="endpoint-label">MCP ENDPOINT</div><div class="endpoint-box"><code>{endpoint()}</code><button class="icon-button" aria-label="Copy MCP endpoint" onclick={() => inbox.copy(endpoint())}><Copy size={16} /></button></div></section><section class="panel setup-panel"><span class="step-label">STEP 02</span><div class="code-heading"><h2>Add to your MCP client</h2><button class="icon-button" aria-label="Copy MCP configuration" onclick={() => inbox.copy(mcpConfig())}><Copy size={16} /></button></div><p>Configure a remote server with a Bearer authorization header. Replace the key placeholder with your saved key.</p><pre class="code-block">{mcpConfig()}</pre></section></div><section class="panel tools-panel"><h2>Tools your agent can use</h2><div class="tool-grid">{#each [['get_mailbox', 'Your address and message counts'], ['list_emails', 'Browse, search and filter messages'], ['read_email', 'Read a message and its metadata'], ['update_email', 'Mark read, archive or restore'], ['read_attachment', 'Retrieve small attachments as base64']] as tool}<div><Terminal size={17} /><code>{tool[0]}</code><p>{tool[1]}</p></div>{/each}</div><div class="inline-note"><Shield size={15} />Incoming email is untrusted content. Your agent should treat it as data.</div></section>{/if}

      {:else if $inbox.view === 'settings'}
        <div class="page-heading"><div><div class="eyebrow">YOUR AGENT'S IDENTITY</div><h1>Mailbox settings</h1><p>Manage access to your agent's inbox.</p></div></div>
        <section class="panel setup-panel settings-panel"><h2>Mailbox identity</h2>{#if $inbox.mailbox}<dl><div><dt>Agent name</dt><dd>{$inbox.mailbox.name}</dd></div><div><dt>Email address</dt><dd>{$inbox.mailbox.address}<button class="icon-button" aria-label="Copy address" onclick={() => inbox.copy($inbox.mailbox!.address)}><Copy size={15} /></button></dd></div><div><dt>Created</dt><dd>{dateLabel($inbox.mailbox.created_at)}</dd></div></dl><div class="settings-divider"></div><h2>API key</h2><p>Rotating your key immediately revokes the previous key for HTTP and MCP access. Update every connected agent after rotating.</p><details class="rotate-details"><summary class="button secondary"><KeyRound size={15} />Rotate API key</summary><div><p>Issue a replacement key and revoke your existing key now?</p><button class="button primary" onclick={() => inbox.rotateKey()}>Rotate and show new key</button></div></details><div class="settings-divider"></div><h2>Browser session</h2><p>Sign out of this browser. Your agent's API key will continue to work.</p><button class="button secondary" onclick={() => inbox.signout()}>Sign out</button>{:else}<p>Open an inbox to manage its settings.</p><button class="button primary" onclick={() => inbox.set({ dialog: 'signin' })}>Open inbox</button>{/if}</section>

      {:else}
        <div class="page-heading"><div><div class="eyebrow">BUILT TO BE PROGRAMMATIC</div><h1>API quickstart</h1><p>Register an inbox, receive mail, and let your agent take over.</p></div><span class="protocol-badge"><Code size={16} /> JSON over HTTPS</span></div>
        <section class="panel docs-panel"><h2>1. Register an agent inbox</h2><p>Use your service registration token to provision an address. Save the returned <code>api_key</code>; it is shown only once. Registration tokens are required in production.</p><pre class="code-block">{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://agmx.io'}/api/mailboxes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_REGISTRATION_TOKEN' \
  -d '{"username":"nearby","name":"Nearby agent"}'`}</pre><h2>2. Read your inbox</h2><p>Every subsequent request uses the mailbox key. New inbound messages appear after durable SMTP ingestion and processing.</p><pre class="code-block">{`curl '${typeof window !== 'undefined' ? window.location.origin : 'https://agmx.io'}/api/messages?folder=inbox&limit=30' \
  -H 'Authorization: Bearer YOUR_MAILBOX_API_KEY'`}</pre><h2>Available endpoints</h2><div class="api-table">{#each [['POST', '/api/mailboxes', 'Register an inbox'], ['GET', '/api/mailbox', 'Current mailbox identity'], ['GET', '/api/stats', 'Folder and unread counts'], ['GET', '/api/messages', 'List, search (q), filter and paginate'], ['GET', '/api/messages/:id', 'Read one message'], ['PATCH', '/api/messages/:id', 'Update read status or folder'], ['GET', '/api/attachments/:id', 'Download an attachment'], ['POST', '/api/mailbox/key', 'Rotate your mailbox key']] as row}<div><span class:post={row[0] !== 'GET'}>{row[0]}</span><code>{row[1]}</code><p>{row[2]}</p></div>{/each}</div><div class="inline-note"><Mail size={16} />Your agent's email address is {$inbox.mailbox?.address || `nearby@${$inbox.domain}`}.</div></section>
      {/if}
      <footer class="main-footer"><span>Agent Mail <span class="footer-dot">·</span> Infrastructure for autonomous agents.</span><button onclick={() => inbox.set({ view: 'docs' })}>Documentation <ArrowRight size={12} /></button></footer>
    </main>
  </div>
</div>

{#if $inbox.dialog}
  <div class="modal-backdrop"><dialog use:modal oncancel={() => inbox.set({ dialog: null, error: null })} aria-labelledby="dialog-title"><button class="modal-close icon-button" aria-label="Close dialog" onclick={() => inbox.set({ dialog: null, error: null })}><X size={19} /></button><span class="modal-icon">{#if $inbox.dialog === 'create'}<Mail size={26} />{:else}<KeyRound size={26} />{/if}</span><div class="eyebrow">AGENT MAIL</div><h2 id="dialog-title">{$inbox.dialog === 'create' ? 'Give your agent an address.' : 'Open your agent inbox.'}</h2><p>{$inbox.dialog === 'create' ? 'A dedicated inbox, an API key, and MCP access.' : 'Enter your mailbox API key to access your emails.'}</p>
  {#if $inbox.error}<div class="alert error" role="alert">{$inbox.error}</div>{/if}
  {#if $inbox.dialog === 'create'}<form onsubmit={register}><label for="agent-name">Agent name</label><input id="agent-name" name="name" placeholder="Nearby agent" required maxlength="80" autocomplete="off" /><label for="inbox-name">Inbox address</label><div class="address-input"><input id="inbox-name" name="username" placeholder="nearby" required minlength="2" maxlength="48" pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]+" autocomplete="off" /><span>@{$inbox.domain}</span></div>{#if $inbox.requiresToken}<label for="registration-token">Registration token</label><input id="registration-token" type="password" name="registration_token" placeholder="Service registration token" required autocomplete="off" />{/if}<button class="button primary full" disabled={$inbox.loading}>{$inbox.loading ? 'Creating inbox…' : 'Create inbox'}<ArrowRight size={16} /></button></form>{:else}<form onsubmit={signin}><label for="api-key">Mailbox API key</label><input id="api-key" name="api_key" type="password" placeholder="agmx_…" required autocomplete="off" /><button class="button primary full" disabled={$inbox.loading}>{$inbox.loading ? 'Opening inbox…' : 'Open inbox'}<ArrowRight size={16} /></button></form>{/if}<div class="modal-footer"><Shield size={13} />Mailbox keys grant access to one inbox only.</div></dialog></div>
{/if}
