<script lang="ts">
  import { onMount } from 'svelte';
  import { decryptDMMessage, encryptDMMessage, getOrCreateIdentity, type ClientIdentity, type EncryptedPayload, type PublicIdentity } from '$lib/client/e2ee.js';
  type Conversation = { id: string; updatedAt: string; other: { id: string; username: string; displayName: string; avatarUrl: string | null; fingerprint: string | null }; lastMessageAt: string; lastSenderId: string | null };
  type MemberKey = PublicIdentity & { username: string; displayName: string };
  type MessageView = { id: string; senderId: string; createdAt: string; plaintext: string; failed?: boolean; ciphertext: string; nonce: string; envelopes: EncryptedPayload['envelopes'] };
  const { data } = $props() as { data: { viewer: { id: string; username: string; displayName: string } } };
  let identity = $state<ClientIdentity | null>(null);
  let keyState = $state('Preparing this device’s encryption key…');
  let fingerprint = $state('');
  let keyNotice = $state('');
  let conversations = $state<Conversation[]>([]);
  let activeConversationId = $state('');
  let members = $state<MemberKey[]>([]);
  let messages = $state<MessageView[]>([]);
  let username = $state('');
  let draft = $state('');
  let busy = $state(false);
  let loading = $state(false);
  let notice = $state('');

  async function loadConversations() {
    const response = await fetch('/api/messages/conversations');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load conversations.');
    conversations = result.conversations ?? [];
    const requested = new URLSearchParams(window.location.search).get('c');
    if (requested && conversations.some((item) => item.id === requested)) activeConversationId = requested;
    else if (!activeConversationId && conversations.length) activeConversationId = conversations[0].id;
    if (activeConversationId) await openConversation(activeConversationId);
  }
  async function openConversation(id: string) {
    if (!identity || loading) return;
    activeConversationId = id; loading = true; notice = ''; messages = [];
    try {
      const response = await fetch(`/api/messages/conversations/${id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open conversation.');
      members = (result.members ?? []).filter((member: any) => member.publicKey).map((member: any) => ({ userId: member.id, username: member.username, displayName: member.displayName, publicKey: member.publicKey, fingerprint: member.fingerprint }));
      const views: MessageView[] = [];
      for (const raw of result.messages ?? []) {
        try {
          const payload: EncryptedPayload = { id: raw.id, ciphertext: raw.ciphertext, nonce: raw.nonce, envelopes: raw.envelopes };
          const plaintext = await decryptDMMessage(payload, id, identity);
          views.push({ ...raw, plaintext, failed: false });
        } catch {
          views.push({ ...raw, plaintext: 'Unable to decrypt on this device. The local key may be missing or the sender key may have changed.', failed: true });
        }
      }
      messages = views;
      await fetch('/api/messages/conversations', { method: 'GET' });
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not load conversation.'; }
    finally { loading = false; }
  }
  async function startConversation() {
    if (busy || !username.trim()) return;
    busy = true; notice = '';
    try {
      const response = await fetch('/api/messages/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not start conversation.');
      username = ''; activeConversationId = result.conversationId;
      await loadConversations();
      await openConversation(result.conversationId);
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not start conversation.'; }
    finally { busy = false; }
  }
  async function sendMessage() {
    if (!identity || !activeConversationId || !draft.trim() || busy) return;
    if (draft.length > 4000) { notice = 'Messages are limited to 4,000 characters.'; return; }
    if (!members.some((member) => member.userId === data.viewer.id) || members.length < 2) { notice = 'A recipient has not set up encrypted messaging on this account yet.'; return; }
    busy = true; notice = '';
    try {
      const id = crypto.randomUUID();
      const payload = await encryptDMMessage(draft.trim(), activeConversationId, id, identity, members);
      const response = await fetch(`/api/messages/conversations/${activeConversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not send encrypted message.');
      draft = '';
      await openConversation(activeConversationId);
      await loadConversations();
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not send message.'; }
    finally { busy = false; }
  }
  async function reportMessage(message: MessageView) {
    if (!activeConversationId || message.senderId === data.viewer.id || message.failed) return;
    if (!window.confirm('This will submit the selected message text to the moderation team with your report. Other private messages will not be attached. Continue?')) return;
    const reason = window.prompt('Report reason: harassment, threat, spam, illegal, other', 'harassment');
    if (!reason) return;
    const response = await fetch(`/api/messages/conversations/${activeConversationId}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageId: message.id, reason, evidence: message.plaintext }) });
    const result = await response.json(); notice = response.ok ? 'Report sent with only the message you selected.' : (result.error || 'Could not submit report.');
  }
  onMount(() => {
    let alive = true;
    (async () => {
      try {
        identity = await getOrCreateIdentity(data.viewer.id);
        if (!alive) return;
        fingerprint = identity.fingerprint;
        const response = await fetch('/api/messages/key', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey: identity.publicKey }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not register public encryption key.');
        keyNotice = result.keyChanged ? 'Your public key changed. Previously encrypted messages may be unreadable on a device without the old key.' : '';
        keyState = 'End-to-end encryption is active on this browser.';
        await loadConversations();
      } catch (error) { keyState = error instanceof Error ? error.message : 'Secure messaging could not start.'; }
    })();
    return () => { alive = false; };
  });
</script>

<div class="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6">
  <header class="mb-5 rounded-[1.6rem] border border-indigo-300/10 bg-gradient-to-br from-indigo-300/[0.08] via-slate-950/50 to-teal-300/[0.045] p-5 sm:p-7">
    <p class="text-[10px] font-extrabold uppercase tracking-[.18em] text-indigo-200">PRIVATE MESSAGING</p>
    <h1 class="mt-2 text-3xl font-extrabold tracking-tight text-white">Only you and your recipients hold the message keys.</h1>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Messages are encrypted in this browser before upload. The server stores ciphertext and encrypted content-key envelopes, not plaintext chat bodies. The service still relays and stores encrypted messages; this is not direct peer-to-peer networking.</p>
    <div class="mt-4 flex flex-wrap items-center gap-2 text-[10px]"><span class="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 font-bold text-emerald-100">{keyState}</span>{#if fingerprint}<button class="rounded-full border border-white/10 px-3 py-1.5 text-slate-400 hover:text-white" onclick={() => navigator.clipboard.writeText(fingerprint)} title="Copy your public key fingerprint">Your key fingerprint: {fingerprint.slice(0, 19)}…</button>{/if}</div>
    {#if keyNotice}<p class="mt-3 text-xs text-amber-200">{keyNotice}</p>{/if}
  </header>
  <div class="grid min-h-[640px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
    <aside class="surface-card rounded-[1.4rem] p-4">
      <h2 class="text-sm font-extrabold text-white">Conversations</h2>
      <form class="mt-3 flex gap-2" onsubmit={(event) => { event.preventDefault(); startConversation(); }}><input bind:value={username} placeholder="Start with @username" aria-label="Username to message" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-indigo-300/30 focus:outline-none"/><button disabled={busy || !username.trim()} class="rounded-xl bg-indigo-300 px-3 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50">Start</button></form>
      <div class="mt-4 space-y-1">{#each conversations as conversation (conversation.id)}<button onclick={() => openConversation(conversation.id)} class={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${activeConversationId === conversation.id ? 'border border-indigo-300/15 bg-indigo-300/[0.08]' : 'hover:bg-white/[0.035]'}`}><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-300 to-teal-200 text-sm font-black text-slate-950">{conversation.other.displayName[0]?.toUpperCase() ?? 'M'}</span><span class="min-w-0 flex-1"><span class="block truncate text-xs font-bold text-slate-100">{conversation.other.displayName}</span><span class="mt-1 block truncate text-[10px] text-slate-500">@{conversation.other.username}</span><span class="mt-1 block text-[9px] text-slate-600">{conversation.other.fingerprint ? 'Encryption key registered' : 'Recipient key not set up'}</span></span></button>{:else}<p class="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs leading-5 text-slate-600">No conversations yet. Start one by entering a username.</p>{/each}</div>
    </aside>
    <section class="surface-card flex min-h-[640px] flex-col rounded-[1.4rem] p-4 sm:p-5">
      {#if activeConversationId}
        <div class="flex items-center justify-between border-b border-white/[0.06] pb-3"><div><h2 class="text-sm font-extrabold text-white">{conversations.find((item) => item.id === activeConversationId)?.other.displayName ?? 'Encrypted conversation'}</h2><p class="mt-1 text-[10px] text-slate-500">AES-GCM message encryption · P-256 ECDH key wrapping · SHA-256 fingerprints</p></div><button onclick={() => { const other = conversations.find((item) => item.id === activeConversationId)?.other; if (other?.fingerprint) navigator.clipboard.writeText(other.fingerprint); }} class="rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 hover:text-white">Copy other key fingerprint</button></div>
        <div class="flex-1 space-y-3 overflow-y-auto py-4">{#each messages as message (message.id)}<article class={`max-w-[88%] rounded-2xl border p-3 ${message.senderId === data.viewer.id ? 'ml-auto border-indigo-300/10 bg-indigo-300/[0.07]' : 'border-white/[0.07] bg-white/[0.025]'}`}><div class="mb-1.5 flex items-center justify-between gap-3"><span class="text-[10px] font-bold text-slate-400">{message.senderId === data.viewer.id ? 'You' : (members.find((member) => member.userId === message.senderId)?.displayName ?? 'Member')}</span><time class="text-[9px] text-slate-600">{new Date(message.createdAt).toLocaleString()}</time></div><p class={`whitespace-pre-wrap break-words text-sm leading-6 ${message.failed ? 'text-amber-200' : 'text-slate-200'}`}>{message.plaintext}</p>{#if message.senderId !== data.viewer.id && !message.failed}<button class="mt-2 text-[10px] font-semibold text-rose-200/70 hover:text-rose-100" onclick={() => reportMessage(message)}>Report this message…</button>{/if}</article>{:else}<p class="py-10 text-center text-xs text-slate-600">{loading ? 'Decrypting messages on this device…' : 'No messages yet. Start the conversation.'}</p>{/each}</div>
        <form class="border-t border-white/[0.06] pt-3" onsubmit={(event) => { event.preventDefault(); sendMessage(); }}><textarea bind:value={draft} maxlength="4000" rows="3" placeholder={members.length < 2 ? 'The recipient must open Messages once to activate their public key.' : 'Write a private message…'} class="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-300/25 focus:outline-none"/><div class="mt-2 flex items-center justify-between gap-3"><span class="text-[10px] leading-4 text-slate-600">Do not share messages unless reporting abuse. The report flow only includes the message you choose.</span><button disabled={busy || !draft.trim() || members.length < 2 || !identity} class="shrink-0 rounded-xl bg-indigo-300 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-50">{busy ? 'Sending…' : 'Encrypt & send ↗'}</button></div></form>
      {:else}<div class="flex flex-1 flex-col items-center justify-center text-center"><span class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-300/10 bg-indigo-300/[0.06] text-2xl">⌁</span><h2 class="text-lg font-extrabold text-white">Your private inbox</h2><p class="mt-2 max-w-sm text-xs leading-6 text-slate-500">Start a conversation. Each message is encrypted locally, and every recipient has a separately wrapped content key.</p></div>{/if}
      {#if notice}<p class="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.04] px-3 py-2 text-xs text-rose-100" role="status">{notice}</p>{/if}
    </section>
  </div>
  <details class="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4"><summary class="cursor-pointer text-xs font-bold text-slate-300">Security limits you should know</summary><p class="mt-3 text-xs leading-6 text-slate-500">Private keys are stored in this browser's IndexedDB and are not uploaded. Clearing browser data or using a new device can make old messages unreadable; key backup and recovery are not implemented. Verify fingerprints with the other person out-of-band to reduce key-substitution risk. The server controls the web app code it delivers, so this browser implementation alone cannot protect against a malicious site operator changing that code. For stronger operator resistance, use a separately audited or signed client. The server can still see participants, timing, message sizes and traffic metadata.</p></details>
</div>
