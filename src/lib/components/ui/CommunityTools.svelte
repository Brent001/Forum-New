<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ArchiveRestore, Ban, Check, Copy, FileText, Smile, Trash2, Upload, Users, X } from '@lucide/svelte';
  import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
  import type { CommunityEmote } from '$lib/components/ui/EmoteText.svelte';

  type Moderator = { userId: string; username: string | null; displayName: string | null; avatarUrl: string | null; createdAt: Date | string; role: string };
  type BannedMember = { userId: string; username: string | null; displayName: string | null; reason: string | null; expiresAt: Date | string | null; createdAt: Date | string };
  type Community = { id: string; slug: string; name: string };
  type RemovedPost = { id: string; title: string; body: string; reason: string; createdAt: string; updatedAt: string; authorId: string; author: string; authorName: string };
  type RemovedPostEvent = RemovedPost & { communityId: string };
  let { community, initialEmotes = [], initialModerators = [], initialBans = [], initialRemovedPosts = [], canManageEmotes = false, canManageModerators = false, canBanMembers = false, canModerateContent = false } = $props<{
    community: Community; initialEmotes?: CommunityEmote[]; initialModerators?: Moderator[]; initialBans?: BannedMember[]; initialRemovedPosts?: RemovedPost[];
    canManageEmotes?: boolean; canManageModerators?: boolean; canBanMembers?: boolean; canModerateContent?: boolean;
  }>();

  let emotes = $state([...initialEmotes]);
  let moderators = $state([...initialModerators]);
  let bans = $state([...initialBans]);
  let removedPosts = $state([...initialRemovedPosts]);
  let expanded = $state(false);
  let activeTab = $state('emotes');
  let emoteCode = $state('');
  let emoteFile = $state<File | null>(null);
  let moderatorUsername = $state('');
  let banUsername = $state('');
  let banReason = $state('');
  let banDuration = $state('24');
  let banPermanent = $state(false);
  let busy = $state(false);
  let notice = $state('');
  let errorMessage = $state('');
  let copiedCode = $state('');
  const banDurationOptions: DropdownOption[] = [
    { value: '1', label: '1 hour' }, { value: '6', label: '6 hours' }, { value: '24', label: '24 hours' },
    { value: '72', label: '3 days' }, { value: '168', label: '7 days' }, { value: '720', label: '30 days' }
  ];
  const tabs = $derived([
    { value: 'emotes', label: 'Emotes', show: true, icon: 'smile' },
    { value: 'moderators', label: 'Moderators', show: canManageModerators, icon: 'users' },
    { value: 'bans', label: 'Bans', show: canBanMembers, icon: 'ban' },
    { value: 'removed', label: 'Removed posts', show: canModerateContent, icon: 'removed' }
  ].filter((tab) => tab.show));

  $effect(() => {
    removedPosts = [...initialRemovedPosts];
  });

  onMount(() => {
    const onRemoved = (event: Event) => {
      const detail = (event as CustomEvent<RemovedPostEvent>).detail;
      if (!detail || detail.communityId !== community.id || !canModerateContent) return;
      const { communityId: _communityId, ...removedPost } = detail;
      removedPosts = [removedPost, ...removedPosts.filter((item) => item.id !== removedPost.id)];
    };
    window.addEventListener('nexus:community-post-removed', onRemoved);
    return () => window.removeEventListener('nexus:community-post-removed', onRemoved);
  });

  async function uploadEmote() {
    errorMessage = ''; notice = '';
    if (!canManageEmotes) { errorMessage = 'Moderator permissions are required.'; return; }
    const code = emoteCode.trim().toLowerCase().replace(/^:+|:+$/g, '');
    if (!/^[a-z0-9_]{2,24}$/.test(code)) { errorMessage = 'Use 2–24 lowercase letters, numbers, or underscores for the shortcode.'; return; }
    if (!emoteFile) { errorMessage = 'Choose a PNG, JPEG, WebP, or GIF file.'; return; }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(emoteFile.type)) { errorMessage = 'Choose a supported image file.'; return; }
    if (emoteFile.size < 1 || emoteFile.size > 1024 * 1024) { errorMessage = 'Community emotes must be 1 MB or smaller.'; return; }
    if (emotes.some((emote) => emote.code.toLowerCase() === code)) { errorMessage = 'That shortcode is already taken.'; return; }
    busy = true;
    try {
      const presignResponse = await fetch('/api/uploads/presign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: emoteFile.name, contentType: emoteFile.type, size: emoteFile.size, purpose: 'emote', visibility: 'private', communityId: community.id }) });
      const presign = await presignResponse.json();
      if (!presignResponse.ok) throw new Error(presign.error || 'Could not prepare the emote upload.');
      const putResponse = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'content-type': emoteFile.type }, body: emoteFile });
      if (!putResponse.ok) throw new Error('Backblaze rejected the file. Check the bucket CORS and upload configuration.');
      const completeResponse = await fetch('/api/uploads/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objectKey: presign.objectKey, filename: emoteFile.name, visibility: 'private' }) });
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete.error || 'Could not verify the uploaded emote.');
      const saveResponse = await fetch(`/api/communities/${community.id}/emotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, imageAssetId: complete.assetId }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || 'Could not add the emote to the community.');
      emotes = [...emotes, saved.emote].sort((a, b) => a.code.localeCompare(b.code));
      emoteCode = ''; emoteFile = null;
      const fileInput = document.getElementById(`emote-file-${community.id}`) as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      notice = `:${code}: is ready to use in this community.`;
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Emote upload failed.'; }
    finally { busy = false; }
  }

  async function removeEmote(emote: CommunityEmote) {
    if (!canManageEmotes || busy) return;
    if (!window.confirm(`Remove :${emote.code}: from c/${community.slug}?`)) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/emotes?emoteId=${encodeURIComponent(emote.id ?? '')}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not remove emote.');
      emotes = emotes.filter((item) => item.id !== emote.id);
      notice = `:${emote.code}: was removed.`;
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not remove emote.'; }
    finally { busy = false; }
  }

  async function addModerator() {
    const username = moderatorUsername.trim().replace(/^@/, '');
    if (!username || busy) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/moderators`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', username }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not add moderator.');
      moderators = [...moderators, { userId: result.moderator.id, username: result.moderator.username, displayName: result.moderator.username, avatarUrl: null, createdAt: new Date(), role: 'moderator' }];
      moderatorUsername = ''; notice = `@${result.moderator.username} is now a community moderator.`;
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not add moderator.'; }
    finally { busy = false; }
  }

  async function removeModerator(moderator: Moderator) {
    if (busy) return;
    if (!window.confirm(`Remove @${moderator.username ?? 'this member'} as a moderator?`)) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/moderators`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', userId: moderator.userId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not remove moderator.');
      moderators = moderators.filter((item) => item.userId !== moderator.userId); notice = 'Moderator permissions removed.';
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not remove moderator.'; }
    finally { busy = false; }
  }

  async function banMember() {
    const username = banUsername.trim().replace(/^@/, '');
    if (!username || busy) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/bans`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ban', username, reason: banReason, durationHours: Number(banDuration), permanent: banPermanent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not ban this member.');
      const expiry = banPermanent ? null : new Date(Date.now() + Number(banDuration) * 3600000);
      bans = [{ userId: result.user.id, username: result.user.username, displayName: result.user.username, reason: banReason || null, expiresAt: expiry, createdAt: new Date() }, ...bans.filter((item) => item.userId !== result.user.id)];
      notice = banPermanent ? `@${result.user.username} was permanently banned from this community.` : `@${result.user.username} was banned for ${banDuration} hour(s).`;
      banUsername = ''; banReason = ''; banPermanent = false;
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not ban member.'; }
    finally { busy = false; }
  }

  async function unbanMember(member: BannedMember) {
    if (busy) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/bans`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'unban', userId: member.userId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not lift community ban.');
      bans = bans.filter((item) => item.userId !== member.userId); notice = `Community ban lifted for @${member.username ?? 'member'}.`;
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not lift ban.'; }
    finally { busy = false; }
  }

  async function restorePost(post: RemovedPost) {
    if (busy || !canModerateContent) return;
    busy = true; errorMessage = ''; notice = '';
    try {
      const response = await fetch(`/api/communities/${community.id}/moderation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'restore', postId: post.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not restore this post.');
      removedPosts = removedPosts.filter((item) => item.id !== post.id);
      notice = `Restored “${post.title}”. It is visible in the community feed again.`;
      await invalidateAll();
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Could not restore this post.'; }
    finally { busy = false; }
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(`:${code}:`); copiedCode = code; notice = `Copied :${code}:`; }
    catch { notice = `Use :${code}: in a post or comment.`; }
  }
  function formatExpiry(value: string | Date | null) {
    if (!value) return 'Permanent';
    return `Until ${new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
</script>

<section class="community-toolbox">
  <div class="toolbox-head">
    <div class="toolbox-title"><span class="toolbox-icon"><Smile size={18}/></span><div><h2>Community emotes & safety</h2><p>Discord-style emotes, trusted moderators, and member controls for c/{community.slug}.</p></div></div>
    <div class="toolbox-head-actions"><span class="tool-count">{emotes.length}/100 emotes</span>{#if canManageEmotes || canManageModerators || canBanMembers || canModerateContent}<button class="tool-toggle" onclick={() => expanded = !expanded} aria-expanded={expanded}>{expanded ? 'Close tools' : 'Manage community'}</button>{/if}</div>
  </div>
  <div class="public-emote-grid">
    {#each emotes.slice(0, 14) as emote (emote.id ?? emote.code)}<button class="public-emote" title={`Copy :${emote.code}:`} onclick={() => copyCode(emote.code)}><img src={emote.imageUrl} alt={`:${emote.code}:`} loading="lazy"/><span>:{emote.code}:</span></button>{/each}
    {#if !emotes.length}<p class="emote-empty-copy">No custom emotes yet. Community moderators can upload transparent PNGs or animated GIFs.</p>{/if}
    {#if emotes.length > 14}<button class="public-emote show-more-emotes" onclick={() => { expanded = true; activeTab = 'emotes'; }}>+{emotes.length - 14} more</button>{/if}
  </div>
  {#if notice}<p class="tool-notice" role="status"><Check size={14}/>{notice}</p>{/if}
  {#if errorMessage}<p class="tool-error" role="alert">{errorMessage}</p>{/if}

  {#if expanded && tabs.length}
    <div class="community-management">
      <nav class="management-tabs" aria-label="Community tools">{#each tabs as tab (tab.value)}<button class:tab-active={activeTab === tab.value} onclick={() => activeTab = tab.value}>{#if tab.value === 'emotes'}<Smile size={15}/>{:else if tab.value === 'moderators'}<Users size={15}/>{:else if tab.value === 'bans'}<Ban size={15}/>{:else}<FileText size={15}/>{/if}{tab.label}</button>{/each}</nav>
      {#if activeTab === 'emotes'}
        {#if canManageEmotes}
          <div class="emote-upload-row"><div class="field-group"><label for={`emote-code-${community.id}`}>Shortcode</label><div class="code-field"><span>:</span><input id={`emote-code-${community.id}`} bind:value={emoteCode} maxlength="24" placeholder="party_parrot"/><span>:</span></div></div><div class="field-group file-field"><label for={`emote-file-${community.id}`}>Emote image</label><input id={`emote-file-${community.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" onchange={(event) => emoteFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null}/><small>{emoteFile ? `${emoteFile.name} · ${(emoteFile.size / 1024).toFixed(0)} KB` : 'GIF / PNG / WebP · max 1 MB'}</small></div><button class="action-button" onclick={uploadEmote} disabled={busy}><Upload size={15}/>{busy ? 'Uploading…' : 'Add emote'}</button></div>
          <p class="tool-help">Use a simple shortcode such as <code>:brent_hype:</code>. Moderators can add and remove custom emotes; members can insert them in replies and post text.</p>
        {/if}
        <div class="manage-emote-grid">{#each emotes as emote (emote.id ?? emote.code)}<div class="managed-emote"><img src={emote.imageUrl} alt={`:${emote.code}:`} loading="lazy"/><span>:{emote.code}:</span><button type="button" onclick={() => copyCode(emote.code)} aria-label={`Copy ${emote.code}`} title="Copy shortcode"><Copy size={13}/></button>{#if canManageEmotes}<button type="button" onclick={() => removeEmote(emote)} aria-label={`Remove ${emote.code}`} title="Remove emote" disabled={busy}><Trash2 size={13}/></button>{/if}</div>{/each}</div>
      {:else if activeTab === 'moderators' && canManageModerators}
        <div class="management-form"><div class="field-group"><label for={`moderator-username-${community.id}`}>Add moderator by username</label><input id={`moderator-username-${community.id}`} bind:value={moderatorUsername} placeholder="username" onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addModerator(); } }}/></div><button class="action-button" onclick={addModerator} disabled={busy || !moderatorUsername.trim()}><Users size={15}/>Add moderator</button></div>
        <p class="tool-help">Moderators can manage community posts, emotes, and community bans. Only the creator or a site administrator can grant or revoke moderator access.</p>
        <div class="moderator-list">{#each moderators as moderator (moderator.userId)}<div class="member-row"><span class="member-avatar">{(moderator.displayName || moderator.username || 'M').slice(0,1).toUpperCase()}</span><div class="member-row-copy"><strong>{moderator.displayName || moderator.username || 'Community moderator'}</strong><small>@{moderator.username || 'unknown'} · Moderator</small></div><button class="remove-member" onclick={() => removeModerator(moderator)} disabled={busy} aria-label={`Remove ${moderator.username} as moderator`}><X size={14}/></button></div>{:else}<p class="tool-help">No additional moderators assigned yet.</p>{/each}</div>
      {:else if activeTab === 'removed' && canModerateContent}
        <p class="tool-help">Posts removed by community moderators stay here until restored. Restoring a post makes it visible in c/{community.slug} again.</p>
        <div class="removed-post-list">{#each removedPosts as post (post.id)}<article class="removed-post-row"><div class="removed-post-copy"><strong>{post.title}</strong><p>{post.body || 'No post text.'}</p><small>By @{post.author} · {post.reason}</small></div><button type="button" class="action-button" onclick={() => restorePost(post)} disabled={busy}><ArchiveRestore size={14}/>Restore</button></article>{:else}<p class="tool-help">No removed posts waiting for review.</p>{/each}</div>
      {:else if activeTab === 'bans' && canBanMembers}
        <div class="management-form ban-form"><div class="field-group"><label for={`ban-username-${community.id}`}>Username to ban</label><input id={`ban-username-${community.id}`} bind:value={banUsername} placeholder="username"/></div><div class="field-group"><label>Duration</label><Dropdown label="Ban duration" value={banDuration} options={banDurationOptions} onChange={(value) => banDuration = value} fullWidth /></div><div class="field-group reason-field"><label for={`ban-reason-${community.id}`}>Reason (shown to moderators)</label><input id={`ban-reason-${community.id}`} bind:value={banReason} maxlength="500" placeholder="Repeated spam, harassment…"/></div><label class="permanent-toggle"><input type="checkbox" bind:checked={banPermanent}/> Permanent community ban</label><button class="action-button danger-action" onclick={banMember} disabled={busy || !banUsername.trim()}><Ban size={15}/>Ban member</button></div>
        <p class="tool-help">Community bans only affect this community. Expired temporary bans no longer block access. Site-wide suspensions remain in the owner dashboard.</p>
        <div class="moderator-list">{#each bans as member (member.userId)}<div class="member-row"><span class="member-avatar ban-avatar">{(member.displayName || member.username || 'M').slice(0,1).toUpperCase()}</span><div class="member-row-copy"><strong>{member.displayName || member.username || 'Banned member'}</strong><small>@{member.username || 'unknown'} · {formatExpiry(member.expiresAt)}{#if member.reason} · {member.reason}{/if}</small></div><button class="remove-member" onclick={() => unbanMember(member)} disabled={busy} aria-label={`Unban ${member.username}`} title="Lift ban"><Check size={14}/></button></div>{:else}<p class="tool-help">No active community bans.</p>{/each}</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .community-toolbox { margin-top:12px; overflow:visible; border:1px solid var(--reddit-border,#2a393e); border-radius:12px; background:var(--reddit-card,#152226); }
  .toolbox-head { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 15px; border-bottom:1px solid var(--reddit-border,#2a393e); }
  .toolbox-title { display:flex; align-items:center; gap:11px; min-width:0; }
  .toolbox-icon { display:grid; place-items:center; width:36px; height:36px; flex:0 0 36px; border-radius:9px; background:rgba(255,176,0,.1); color:#ffbf45; }
  .toolbox-title h2 { font-size:13px; font-weight:800; color:var(--reddit-text-strong,#f2f4f5); }
  .toolbox-title p { margin-top:3px; color:var(--reddit-muted,#91a0a5); font-size:11px; line-height:1.4; }
  .toolbox-head-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .tool-count { color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .tool-toggle { border:1px solid var(--reddit-border,#2a393e); border-radius:999px; padding:7px 11px; color:var(--reddit-text,#d7dadc); font-size:10px; font-weight:800; white-space:nowrap; }
  .tool-toggle:hover { border-color:#ffb000; color:#ffcd70; }
  .public-emote-grid { display:flex; align-items:center; gap:7px; overflow-x:auto; padding:10px 13px; scrollbar-width:thin; }
  .public-emote { display:flex; align-items:center; gap:7px; flex:0 0 auto; max-width:150px; border:1px solid transparent; border-radius:8px; padding:6px 8px; background:var(--reddit-panel,#0f1b1f); color:var(--reddit-muted,#91a0a5); }
  .public-emote:hover { border-color:#4a6268; color:var(--reddit-text-strong,#f2f4f5); }
  .public-emote img { width:26px; height:26px; object-fit:contain; }
  .public-emote span { max-width:94px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; }
  .show-more-emotes { min-height:40px; font-size:11px; font-weight:800; }
  .emote-empty-copy { color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .tool-notice,.tool-error { display:flex; align-items:center; gap:6px; margin:0 13px 10px; border-radius:7px; padding:8px 10px; font-size:11px; }
  .tool-notice { background:rgba(71,179,137,.08); color:#8fd8b9; }
  .tool-error { background:rgba(255,69,69,.08); color:#ffaaa4; }
  .community-management { border-top:1px solid var(--reddit-border,#2a393e); padding:12px; }
  .management-tabs { display:flex; gap:4px; overflow-x:auto; border-bottom:1px solid var(--reddit-border,#2a393e); margin-bottom:14px; }
  .management-tabs button { display:inline-flex; align-items:center; gap:6px; border-bottom:2px solid transparent; padding:10px 12px; color:var(--reddit-muted,#91a0a5); font-size:11px; font-weight:800; white-space:nowrap; }
  .management-tabs button:hover,.management-tabs button.tab-active { color:var(--reddit-text-strong,#f2f4f5); }
  .management-tabs button.tab-active { border-color:#ffb000; }
  .emote-upload-row { display:grid; grid-template-columns:minmax(160px,.7fr) minmax(200px,1fr) auto; align-items:end; gap:10px; }
  .field-group { display:grid; gap:6px; min-width:0; }
  .field-group label { color:var(--reddit-muted,#91a0a5); font-size:10px; font-weight:800; }
  .field-group input:not([type=file]) { min-width:0; width:100%; border:1px solid var(--reddit-border,#2a393e); border-radius:7px; background:var(--reddit-panel,#0f1b1f); padding:9px 10px; color:var(--reddit-text-strong,#f2f4f5); font-size:12px; outline:0; }
  .field-group input:focus { border-color:#6c9aa5; }
  .code-field { display:flex; align-items:center; border:1px solid var(--reddit-border,#2a393e); border-radius:7px; background:var(--reddit-panel,#0f1b1f); padding:0 9px; color:#ffbf45; }
  .code-field input { border:0 !important; background:transparent !important; padding:9px 4px !important; box-shadow:none !important; }
  .file-field input { width:100%; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .file-field small { color:var(--reddit-muted,#91a0a5); font-size:9px; }
  .action-button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:36px; border-radius:7px; background:#ffb000; padding:8px 12px; color:#201804; font-size:11px; font-weight:900; white-space:nowrap; }
  .action-button:hover:not(:disabled) { background:#ffd064; }
  .action-button:disabled { opacity:.45; cursor:not-allowed; }
  .danger-action { background:#f0a49b; color:#32110e; }
  .tool-help { margin:10px 0; color:var(--reddit-muted,#91a0a5); font-size:10px; line-height:1.55; }
  .tool-help code { color:#ffcd70; }
  .manage-emote-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; margin-top:10px; }
  .managed-emote { display:flex; align-items:center; min-width:0; gap:7px; border:1px solid var(--reddit-border,#2a393e); border-radius:8px; padding:7px; background:var(--reddit-panel,#0f1b1f); }
  .managed-emote img { width:31px; height:31px; flex:0 0 31px; object-fit:contain; }
  .managed-emote span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--reddit-text,#d7dadc); font-size:10px; }
  .managed-emote button { display:grid; place-items:center; width:26px; height:26px; flex:0 0 26px; border-radius:5px; color:var(--reddit-muted,#91a0a5); }
  .managed-emote button:hover { background:var(--reddit-hover,#223237); color:var(--reddit-text-strong,#f2f4f5); }
  .management-form { display:grid; grid-template-columns:minmax(180px,1fr) auto; align-items:end; gap:10px; }
  .ban-form { grid-template-columns:minmax(130px,1fr) 140px minmax(180px,1.4fr) auto; }
  .permanent-toggle { display:flex; align-items:center; gap:6px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .permanent-toggle input { accent-color:#ffb000; }
  .moderator-list { display:grid; gap:5px; margin-top:11px; }
  .removed-post-list { display:grid; gap:7px; margin-top:10px; }
  .removed-post-row { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--reddit-border,#2a393e); border-radius:9px; padding:10px; background:var(--reddit-panel,#0f1b1f); }
  .removed-post-copy { min-width:0; flex:1; }
  .removed-post-copy strong { display:block; color:var(--reddit-text-strong,#f2f4f5); font-size:12px; line-height:1.4; overflow-wrap:anywhere; }
  .removed-post-copy p { margin-top:4px; color:var(--reddit-text,#d7dadc); font-size:10px; line-height:1.5; overflow-wrap:anywhere; }
  .removed-post-copy small { display:block; margin-top:4px; color:var(--reddit-muted,#91a0a5); font-size:9px; line-height:1.5; overflow-wrap:anywhere; }
  .member-row { display:flex; align-items:center; gap:9px; border:1px solid var(--reddit-border,#2a393e); border-radius:8px; padding:8px; }
  .member-avatar { display:grid; place-items:center; width:33px; height:33px; flex:0 0 33px; border-radius:50%; background:#344e54; color:#cde3e8; font-size:12px; font-weight:900; }
  .ban-avatar { background:#512b2a; color:#ffb3a9; }
  .member-row-copy { flex:1; min-width:0; }
  .member-row-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--reddit-text,#d7dadc); font-size:11px; }
  .member-row-copy small { display:block; margin-top:3px; overflow-wrap:anywhere; color:var(--reddit-muted,#91a0a5); font-size:9px; line-height:1.45; }
  .remove-member { display:grid; place-items:center; width:29px; height:29px; flex:0 0 29px; border-radius:6px; color:#ffaaa4; }
  .remove-member:hover { background:rgba(255,80,80,.1); }
  .remove-member:disabled { opacity:.5; }
  @media(max-width:800px) { .toolbox-head { align-items:flex-start; flex-direction:column; } .toolbox-head-actions { width:100%; justify-content:space-between; } .emote-upload-row { grid-template-columns:1fr; } .management-form,.ban-form { grid-template-columns:1fr; } .action-button { width:100%; } .removed-post-row { align-items:stretch; flex-direction:column; } }
</style>
