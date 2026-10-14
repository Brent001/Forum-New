<script lang="ts">
  import { FileText, Image as ImageIcon, Link2, Plus, Send, Upload, Video, X, Smile, CalendarDays, Gamepad2, BookOpen } from '@lucide/svelte';
  import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
  import PostCard, { type PostSummary } from '$lib/components/ui/PostCard.svelte';
  import CommunityTools from '$lib/components/ui/CommunityTools.svelte';
  import EmotePicker from '$lib/components/ui/EmotePicker.svelte';
  import type { CommunityEmote } from '$lib/components/ui/EmoteText.svelte';
  import { uploadMediaFiles, uploadMediaFile } from '$lib/client/media-upload.js';
  import { notify } from '$lib/client/notifications.js';
  import { queuePostWithMedia } from '$lib/client/background-tasks.js';

  type Community = { id: string; name: string; slug: string; description: string | null; memberCount: number; category: string; communityType?: string; iconUrl: string | null; bannerUrl: string | null; isFeatured: boolean; isPrivate: boolean; isJoined: boolean; rules: Array<{ title: string; description: string }> | null };
  const { data } = $props() as { data: {
    community: Community; posts: PostSummary[]; viewer: { id: string; username: string; name: string; isOwner: boolean; isAdmin?: boolean } | null;
    emotes: CommunityEmote[]; moderators: Array<{userId:string;username:string|null;displayName:string|null;avatarUrl:string|null;createdAt:Date|string;role:string}>;
    bans: Array<{userId:string;username:string|null;displayName:string|null;reason:string|null;expiresAt:Date|string|null;createdAt:Date|string}>;
    removedPosts: Array<{id:string;title:string;body:string;reason:string;createdAt:string;updatedAt:string;authorId:string;author:string;authorName:string}>;
    canManageEmotes:boolean; canManageModerators:boolean; canModerateContent:boolean; canBanMembers:boolean; canManageProfile:boolean;
  } };

  let joined = $state(data.community.isJoined);
  let memberCount = $state(data.community.memberCount);
  let composerOpen = $state(false);
  let title = $state('');
  let body = $state('');
  let postType = $state('discussion');
  let url = $state('');
  let pollOptions = $state(['', '']);
  let selectedFiles = $state<File[]>([]);
  let uploadedAssetIds = $state<string[]>([]);
  let busy = $state(false);
  let uploadBusy = $state(false);
  let uploadPercent = $state(0);
  let uploadStage = $state('');
  let notice = $state('');
  let mobileAboutOpen = $state(false);
  let editProfileOpen = $state(false);
  let profileSaving = $state(false);
  let profileUploadBusy = $state(false);
  let profileUploadPercent = $state(0);
  let communityProfile = $state({ name: data.community.name, description: data.community.description ?? '', category: data.community.category, iconUrl: data.community.iconUrl ?? '', bannerUrl: data.community.bannerUrl ?? '' });

  const postTypes: Array<{value:string;label:string;description:string;icon:any}> = [
    { value: 'discussion', label: 'Post', description: 'Write a discussion', icon: FileText },
    { value: 'media', label: 'Images & Video', description: 'Share media', icon: ImageIcon },
    { value: 'link', label: 'Link', description: 'Share a URL or video', icon: Link2 },
    { value: 'poll', label: 'Poll', description: 'Ask the community', icon: Smile }
  ];
  const sortOptions: DropdownOption[] = [
    { value: 'new', label: 'New', detail: 'Most recent first' },
    { value: 'top', label: 'Top', detail: 'Highest-scored first' }
  ];
  let sort = $state('new');
  const orderedPosts = $derived([...data.posts].sort((a, b) => sort === 'top' ? b.score - a.score : Number(new Date(b.time)) - Number(new Date(a.time))));

  async function toggleJoin() {
    if (!data.viewer) return (window.location.href = '/login');
    try {
      const response = await fetch(`/api/communities/${data.community.id}/join`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update membership.');
      joined = result.joined; notify(joined ? 'Joined the community.' : 'Left the community.', 'success');
      memberCount = Math.max(0, memberCount + (joined ? 1 : -1));
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not update membership.'; notify(notice, 'error'); }
  }
  function count(value: number) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0); }
  function insertEmote(shortcode: string) { body = `${body}${body && !body.endsWith(' ') ? ' ' : ''}${shortcode} `; }
  function addPollOption() { if (pollOptions.length < 6) pollOptions = [...pollOptions, '']; }
  function removePollOption(index: number) { if (pollOptions.length > 2) pollOptions = pollOptions.filter((_, i) => i !== index); }

  async function uploadPostFiles(): Promise<boolean> {
    if (!selectedFiles.length) return true;
    uploadBusy = true; uploadPercent = 0; uploadStage = 'Preparing upload'; notice = '';
    try {
      const assets = await uploadMediaFiles(selectedFiles, 'post', {
        communityId: data.community.id,
        onProgress: (progress) => { uploadPercent = progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0; },
        onStage: (stage) => { uploadStage = stage; }
      });
      uploadedAssetIds = [...uploadedAssetIds, ...assets.map((asset) => asset.assetId)];
      selectedFiles = []; notice = 'Media uploaded and ready to attach.'; notify(notice, 'success');
      return true;
    } catch (error) { notice = error instanceof Error ? error.message : 'Media upload failed.'; notify(notice, 'error'); return false; }
    finally { uploadBusy = false; uploadStage = ''; }
  }
  function publishInBackground() {
    if (!data.viewer) return (window.location.href = '/login');
    if (!selectedFiles.length) { notice = 'Choose files before continuing in the background.'; return; }
    if (title.trim().length < 3) { notice = 'Add a title with at least 3 characters.'; return; }
    if (postType === 'link' && !url.trim()) { notice = 'Add the URL you want to share.'; return; }
    if (postType === 'poll' && pollOptions.filter((option) => option.trim()).length < 2) { notice = 'A poll needs at least two options.'; return; }
    queuePostWithMedia({ title: title.trim(), body, url: postType === 'link' ? url.trim() : '', postType: postType === 'media' ? 'discussion' : postType, communitySlug: data.community.slug, communityId: data.community.id, pollOptions: pollOptions.filter((option) => option.trim()), mediaAssetIds: uploadedAssetIds }, selectedFiles);
    selectedFiles = []; uploadedAssetIds = []; title = ''; body = ''; url = ''; pollOptions = ['', '']; composerOpen = false; notice = '';
  }
  async function uploadCommunityImage(file: File, kind: 'community-icon' | 'community-banner') {
    profileUploadBusy = true; profileUploadPercent = 0;
    try {
      const asset = await uploadMediaFile(file, kind, { visibility: 'private', communityId: data.community.id, onProgress: (progress) => { profileUploadPercent = progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0; } });
      if (kind === 'community-icon') communityProfile.iconUrl = asset.url; else communityProfile.bannerUrl = asset.url;
      notify(kind === 'community-icon' ? 'Community icon uploaded. Save the profile to apply it.' : 'Community banner uploaded. Save the profile to apply it.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Community image upload failed.', 'error'); }
    finally { profileUploadBusy = false; const fields = document.querySelectorAll<HTMLInputElement>('.community-profile-file'); fields.forEach((field) => field.value = ''); }
  }
  async function saveCommunityProfile() {
    if (profileSaving || profileUploadBusy) return;
    profileSaving = true;
    try {
      const response = await fetch(`/api/communities/${data.community.id}/profile`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(communityProfile) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save community profile.');
      communityProfile = { name: result.community.name ?? communityProfile.name, description: result.community.description ?? '', category: result.community.category ?? communityProfile.category, iconUrl: result.community.iconUrl ?? '', bannerUrl: result.community.bannerUrl ?? '' };
      editProfileOpen = false; notify('Community profile updated.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save community profile.', 'error'); }
    finally { profileSaving = false; }
  }

  async function publish() {
    if (!data.viewer) return (window.location.href = '/login');
    if (title.trim().length < 3) { notice = 'Add a title with at least 3 characters.'; return; }
    if (postType === 'link' && !url.trim()) { notice = 'Add the link you want to share.'; return; }
    if (postType === 'poll' && pollOptions.filter((option) => option.trim()).length < 2) { notice = 'A poll needs at least two options.'; return; }
    if (postType === 'media' && !selectedFiles.length && !uploadedAssetIds.length) { notice = 'Choose at least one photo, video, or audio file.'; return; }
    busy = true; notice = '';
    try {
      if (selectedFiles.length && !(await uploadPostFiles())) return;
      const response = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body, url: postType === 'link' ? url : '', postType: postType === 'media' ? 'discussion' : postType, communitySlug: data.community.slug, pollOptions: pollOptions.filter((option) => option.trim()), mediaAssetIds: uploadedAssetIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not publish post.');
      notify('Post published.', 'success'); window.location.href = result.redirectTo || `/post/${result.id}`;
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not publish post.'; notify(notice, 'error'); }
    finally { busy = false; }
  }

  function closeComposer() { composerOpen = false; notice = ''; }
</script>

<div class="community-page">
  <div class="community-banner surface-card">
    <div class="banner-art">{#if communityProfile.bannerUrl}<img src={communityProfile.bannerUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />{/if}<span aria-hidden="true"></span></div>
    <div class="banner-content">
      <div class="breadcrumbs"><a href="/communities">Communities</a><span>/</span><span>c/{data.community.slug}</span>{#if data.community.isPrivate}<span class="private-flag">Private</span>{/if}</div>
      <div class="community-mainline">
        <div class="community-identity">
          {#if communityProfile.iconUrl}<img src={communityProfile.iconUrl} alt="" loading="lazy" decoding="async" class="community-icon-large" />{:else}<span class="community-icon-large">{communityProfile.name.slice(0, 1).toUpperCase()}</span>{/if}
          <div class="community-copy"><div class="community-title-row"><h1>{communityProfile.name}</h1>{#if data.community.isFeatured}<span class="featured-flag">Featured</span>{/if}</div><div class="community-subtitle">c/{data.community.slug} <span>·</span> {communityProfile.category}</div><p class="community-description">{communityProfile.description || 'A community for people who are curious, kind, and ready to share ideas.'}</p><div class="community-stats"><span><b>{count(memberCount)}</b> members</span><span>·</span><span><b>{data.posts.length}</b> recent posts</span></div></div>
        </div>
        <div class="community-actions">{#if data.canManageProfile}<button class="community-about-edit-button" onclick={() => editProfileOpen = !editProfileOpen}>{editProfileOpen ? 'Close edit' : 'Edit profile'}</button>{/if}<button class="community-post-button" onclick={() => composerOpen = !composerOpen}><Plus size={16}/> Create post</button>{#if !data.community.isPrivate}<button onclick={toggleJoin} class:joined={joined} class="community-join-button">{joined ? 'Joined' : 'Join community'}</button>{/if}<button class="about-mobile-button" onclick={() => mobileAboutOpen = !mobileAboutOpen} aria-expanded={mobileAboutOpen}>About</button></div>
      </div>
    </div>
  </div>

  <nav class="community-special-nav" aria-label="Community spaces">
    <a href={`/c/${encodeURIComponent(data.community.slug)}`} class="active">Posts</a>
    <a href={`/c/${encodeURIComponent(data.community.slug)}/events`}><CalendarDays size={14}/> Events</a>
    {#if data.community.communityType === 'gaming'}<a href={`/c/${encodeURIComponent(data.community.slug)}/lfg`}><Gamepad2 size={14}/> Looking for group</a>{/if}
    {#if data.community.communityType === 'academic'}<a href={`/c/${encodeURIComponent(data.community.slug)}/resources`}><BookOpen size={14}/> Resource library</a>{/if}
  </nav>

  {#if editProfileOpen && data.canManageProfile}
    <section class="community-profile-editor surface-card" aria-label="Edit community profile">
      <header><div><h2>Edit community profile</h2><p>Customize how this community appears in feeds and discovery.</p></div></header>
      <div class="community-profile-grid">
        <label>Community name<input bind:value={communityProfile.name} maxlength="60" /></label>
        <label>Category<input bind:value={communityProfile.category} maxlength="40" /></label>
        <label class="profile-field-wide">Description<textarea bind:value={communityProfile.description} maxlength="500" rows="3"></textarea></label>
        <div class="profile-image-field"><label>Community icon<input class="community-profile-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" disabled={profileUploadBusy} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) void uploadCommunityImage(file, 'community-icon'); }} /></label>{#if communityProfile.iconUrl}<img src={communityProfile.iconUrl} alt="Community icon preview" />{/if}</div>
        <div class="profile-image-field"><label>Community banner<input class="community-profile-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" disabled={profileUploadBusy} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) void uploadCommunityImage(file, 'community-banner'); }} /></label>{#if communityProfile.bannerUrl}<img class="banner-preview" src={communityProfile.bannerUrl} alt="Community banner preview" />{/if}</div>
      </div>
      {#if profileUploadBusy}<div class="profile-upload-progress" role="progressbar" aria-valuenow={profileUploadPercent} aria-valuemin="0" aria-valuemax="100"><div><span>Uploading image to storage…</span><b>{profileUploadPercent}%</b></div><span><i style={`width:${profileUploadPercent}%`}></i></span></div>{/if}
      <div class="community-profile-actions"><span>Image uploads finish before the profile is saved.</span><button onclick={saveCommunityProfile} disabled={profileSaving || profileUploadBusy}>{profileSaving ? 'Saving…' : 'Save profile'}</button></div>
    </section>
  {/if}

  <CommunityTools community={{ id: data.community.id, slug: data.community.slug, name: communityProfile.name }} initialEmotes={data.emotes} initialModerators={data.moderators} initialBans={data.bans} initialRemovedPosts={data.removedPosts} canManageEmotes={data.canManageEmotes} canManageModerators={data.canManageModerators} canBanMembers={data.canBanMembers} canModerateContent={data.canModerateContent} />

  {#if composerOpen}
    <section class="community-composer surface-card" id="community-composer">
      <div class="composer-head"><div><h2>Create a post in c/{data.community.slug}</h2><p>Share with this community. Be clear, useful, and kind.</p></div><button class="close-composer" onclick={closeComposer} aria-label="Close composer"><X size={18}/></button></div>
      <div class="composer-tabs" role="tablist" aria-label="Post type">{#each postTypes as type (type.value)}<button type="button" role="tab" aria-selected={postType === type.value} class:tab-active={postType === type.value} onclick={() => postType = type.value}><type.icon size={16}/>{type.label}</button>{/each}</div>
      <input bind:value={title} maxlength="220" placeholder="Title" class="composer-field title-field" aria-label="Post title" />
      {#if postType === 'link'}<input bind:value={url} type="url" placeholder="https://example.com or a YouTube link" class="composer-field" aria-label="Link URL"/>{/if}
      {#if postType === 'discussion' || postType === 'link'}
        <textarea bind:value={body} rows="5" maxlength="12000" placeholder="What do you want to share with the community? You can use :emote_shortcodes: too." class="composer-field body-field" aria-label="Post text"></textarea>
        {#if data.emotes.length}<div class="composer-tools"><EmotePicker emotes={data.emotes} onSelect={insertEmote} label="Community emotes"/></div>{/if}
      {/if}
      {#if postType === 'poll'}
        <textarea bind:value={body} rows="3" maxlength="12000" placeholder="Add context for your poll (optional)" class="composer-field body-field" aria-label="Poll context"></textarea>
        <div class="poll-builder">{#each pollOptions as option, index}<div class="poll-option-row"><span>{index + 1}</span><input bind:value={pollOptions[index]} maxlength="100" placeholder={`Option ${index + 1}`} class="composer-field"/><button type="button" onclick={() => removePollOption(index)} disabled={pollOptions.length <= 2} aria-label="Remove poll option">×</button></div>{/each}{#if pollOptions.length < 6}<button class="add-option" onclick={addPollOption}>＋ Add option</button>{/if}</div>
      {/if}
      {#if postType === 'media'}
        <div class="upload-box"><div class="upload-copy"><span class="upload-icon"><Upload size={19}/></span><div><strong>Upload media to Backblaze B2</strong><p>Images, GIFs, video, or audio. Up to 8 attachments.</p></div></div><label class="file-button">Choose files<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm" onchange={(event) => { selectedFiles = Array.from((event.currentTarget as HTMLInputElement).files ?? []).slice(0, Math.max(0, 8 - uploadedAssetIds.length)); uploadedAssetIds = []; }}/></label>{#if selectedFiles.length || uploadedAssetIds.length}<div class="selected-files">{#each selectedFiles as file (file.name + file.size)}<span>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>{/each}{#if uploadedAssetIds.length}<span>{uploadedAssetIds.length} uploaded attachment(s)</span>{/if}<button type="button" onclick={() => { selectedFiles = []; uploadedAssetIds = []; }}>Clear</button></div>{/if}</div>
        <textarea bind:value={body} rows="3" maxlength="12000" placeholder="Add a caption or context (optional)" class="composer-field body-field" aria-label="Media caption"></textarea>
      {/if}
      {#if data.emotes.length && postType !== 'discussion' && postType !== 'link'}<div class="composer-tools"><EmotePicker emotes={data.emotes} onSelect={insertEmote} label="Insert community emote"/></div>{/if}
      {#if notice}<p class="composer-notice" role="status">{notice}</p>{/if}
      {#if uploadBusy}<div class="inline-upload-progress" role="progressbar" aria-valuenow={uploadPercent} aria-valuemin="0" aria-valuemax="100"><div><span>{uploadStage || 'Uploading media…'}</span><b>{uploadPercent}%</b></div><span class="inline-progress-track"><i style={`width:${uploadPercent}%`}></i></span></div>{/if}
      <div class="composer-footer"><span>Posting to <b>c/{data.community.slug}</b>{#if uploadBusy} · Uploading media…{/if}</span><div><button class="cancel-button" onclick={closeComposer}>Cancel</button>{#if selectedFiles.length}<button class="background-upload-action" onclick={publishInBackground} disabled={busy || uploadBusy}>Continue in background</button>{/if}<button class="publish-button" onclick={publish} disabled={busy || uploadBusy}><Send size={15}/>{busy ? 'Publishing…' : uploadBusy ? 'Uploading…' : 'Publish'}</button></div></div>
    </section>
  {/if}

  {#if mobileAboutOpen}<section class="mobile-about surface-card"><div class="mobile-about-heading"><strong>About c/{data.community.slug}</strong><button onclick={() => mobileAboutOpen = false} aria-label="Close about"><X size={16}/></button></div><p>{communityProfile.description || 'A place to share and discuss.'}</p><div class="rule-list">{#each (data.community.rules ?? []) as rule, i}<div><b>{i + 1}. {rule.title}</b><span>{rule.description}</span></div>{:else}<span>Be respectful, stay on topic, and report content that breaks the rules.</span>{/each}</div></section>{/if}

  <div class="community-feed-layout">
    <section class="community-feed">
      <div class="feed-toolbar"><div><h2>Posts</h2><p>Join the conversation in c/{data.community.slug}</p></div><Dropdown label="Sort posts" value={sort} options={sortOptions} onChange={(value) => sort = value}/></div>
      <div class="community-posts">{#each orderedPosts as post (post.id)}<PostCard {post} viewerId={data.viewer?.id ?? null} emotes={data.emotes} canModerate={data.canModerateContent}/>{:else}<div class="empty-community"><div class="empty-icon"><FileText size={23}/></div><h3>It's quiet here. Start the first post.</h3><p>Share a question, image, video, link, or poll to get things started.</p><button class="community-post-button" onclick={() => composerOpen = true}><Plus size={15}/> Create first post</button></div>{/each}</div>
    </section>
    <aside class="community-sidebar">
      <section class="about-card surface-card"><h2>About community</h2><p>{communityProfile.description || 'A community for people who are curious, kind, and ready to share ideas.'}</p><div class="about-stats"><div><strong>{count(memberCount)}</strong><span>Members</span></div><div><strong>{data.posts.length}</strong><span>Posts shown</span></div></div><div class="about-category"><span>Category</span><b>{communityProfile.category}</b></div><h3>Community rules</h3><div class="rule-list">{#each (data.community.rules ?? []) as rule, index}<div><b>{index + 1}. {rule.title}</b><span>{rule.description}</span></div>{:else}<span>Be respectful, stay on topic, and report content that breaks this community's rules.</span>{/each}</div><a href="/support" class="sidebar-help">Need help? Contact support ↗</a></section>
      <section class="sidebar-community-card"><strong>Good communities grow together.</strong><p>Post thoughtfully, welcome new members, and help moderators keep discussion healthy.</p><button onclick={() => composerOpen = true}>Start a discussion</button></section>
    </aside>
  </div>
</div>

<style>
  .community-page { width:100%; padding:0 16px 88px; margin:0 auto; }
  .community-banner { position:relative; overflow:hidden; border-radius:10px; isolation:isolate; }
  .banner-art { position:absolute; inset:0 0 auto; height:132px; overflow:hidden; background:linear-gradient(110deg,rgba(255,176,0,.1),rgba(99,171,184,.08)),repeating-linear-gradient(135deg,transparent 0 18px,rgba(255,255,255,.014) 18px 19px); mask-image:linear-gradient(to bottom,black,transparent); }
  .banner-art img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .banner-art span { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(8,11,18,.78),rgba(8,11,18,.2)); }
  .banner-content { position:relative; z-index:1; padding:13px 16px 17px; }
  .breadcrumbs { display:flex; align-items:center; gap:8px; color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .breadcrumbs a:hover { color:white; }
  .private-flag,.featured-flag { border:1px solid rgba(255,176,0,.2); border-radius:4px; padding:3px 6px; color:#ffd46f; font-size:9px; font-weight:800; }
  .community-mainline { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-top:22px; }
  .community-identity { display:flex; align-items:flex-start; gap:14px; min-width:0; }
  .community-icon-large { display:flex; width:62px; height:62px; flex:0 0 62px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.15); border-radius:50%; background:#ffb000; color:#142024; font-size:25px; font-weight:900; object-fit:cover; }
  .community-copy { min-width:0; }
  .community-title-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .community-title-row h1 { color:var(--reddit-text-strong,#f2f4f5); font-size:clamp(20px,2.1vw,28px); font-weight:800; letter-spacing:-.025em; overflow-wrap:anywhere; }
  .community-subtitle { display:flex; align-items:center; gap:7px; margin-top:3px; color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .community-description { margin-top:9px; max-width:850px; color:var(--reddit-text,#d7dadc); font-size:13px; line-height:1.55; }
  .community-stats { display:flex; align-items:center; gap:8px; margin-top:9px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .community-stats b { color:var(--reddit-text-strong,#f2f4f5); font-weight:800; }
  .community-actions { display:flex; align-items:center; flex-shrink:0; gap:8px; }
  .community-post-button,.community-join-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:36px; border:1px solid var(--reddit-border,#2a393e); border-radius:999px; background:var(--reddit-panel,#0f1b1f); padding:8px 14px; color:var(--reddit-text-strong,#f2f4f5); font-size:11px; font-weight:800; white-space:nowrap; }
  .community-post-button:hover,.community-join-button:hover { background:var(--reddit-hover,#223237); border-color:#ffb000; }
  .community-join-button { border-color:#ffb000; background:#ffb000; color:#1f1808; }
  .community-join-button.joined { border-color:var(--reddit-border,#2a393e); background:transparent; color:var(--reddit-text,#d7dadc); }
  .about-mobile-button { display:none; border:1px solid var(--reddit-border,#2a393e); border-radius:999px; padding:8px 12px; color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .community-composer { margin-top:12px; border-radius:10px; padding:16px; }
  .composer-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:13px; }
  .composer-head h2 { color:var(--reddit-text-strong,#f2f4f5); font-size:15px; font-weight:800; }
  .composer-head p { margin-top:4px; color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .close-composer { display:grid; place-items:center; width:31px; height:31px; border-radius:7px; color:var(--reddit-muted,#91a0a5); }
  .close-composer:hover { background:var(--reddit-hover,#223237); color:white; }
  .composer-tabs { display:flex; overflow-x:auto; gap:3px; border-bottom:1px solid var(--reddit-border,#2a393e); margin-bottom:12px; }
  .composer-tabs button { display:inline-flex; align-items:center; gap:7px; padding:11px 12px; border-bottom:2px solid transparent; color:var(--reddit-muted,#91a0a5); font-size:12px; font-weight:700; white-space:nowrap; }
  .composer-tabs button:hover,.composer-tabs button.tab-active { color:var(--reddit-text-strong,#f2f4f5); }
  .composer-tabs button.tab-active { border-color:#ffb000; }
  .composer-tabs button.tab-active :global(svg) { color:#ffb000; }
  .composer-field { display:block; width:100%; min-width:0; margin-top:9px; border:1px solid var(--reddit-border,#2a393e); border-radius:8px; background:var(--reddit-panel,#0f1b1f); padding:10px 12px; color:var(--reddit-text-strong,#f2f4f5); font-size:13px; outline:none; }
  .composer-field:focus { border-color:#7097a0; box-shadow:0 0 0 1px #7097a0; }
  .composer-field::placeholder { color:var(--reddit-muted,#91a0a5); }
  .title-field { margin-top:0; font-weight:700; }
  .body-field { resize:vertical; line-height:1.55; }
  .composer-tools { display:flex; align-items:center; gap:8px; margin-top:9px; }
  .poll-builder { display:grid; gap:7px; margin-top:9px; }
  .poll-option-row { display:flex; align-items:center; gap:8px; }
  .poll-option-row > span { display:grid; place-items:center; width:25px; height:25px; flex:0 0 25px; border:1px solid var(--reddit-border,#2a393e); border-radius:5px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .poll-option-row input { margin:0; }
  .poll-option-row button { width:30px; color:var(--reddit-muted,#91a0a5); font-size:21px; }
  .poll-option-row button:disabled { opacity:.3; }
  .add-option { width:fit-content; color:#ffbf45; font-size:11px; font-weight:800; padding:5px 0; }
  .upload-box { margin-top:10px; border:1px dashed #506369; border-radius:9px; padding:13px; }
  .upload-copy { display:flex; align-items:center; gap:10px; }
  .upload-icon { display:grid; place-items:center; width:38px; height:38px; flex:0 0 38px; border-radius:9px; background:var(--reddit-hover,#223237); color:#ffbf45; }
  .upload-copy strong { color:var(--reddit-text-strong,#f2f4f5); font-size:12px; }
  .upload-copy p { margin-top:3px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .file-button { display:inline-flex; align-items:center; margin-top:12px; border:1px solid var(--reddit-border,#2a393e); border-radius:999px; padding:8px 13px; color:var(--reddit-text,#d7dadc); font-size:11px; font-weight:800; cursor:pointer; }
  .file-button input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .selected-files { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:9px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .selected-files span { border-radius:5px; background:var(--reddit-hover,#223237); padding:5px 7px; overflow-wrap:anywhere; }
  .selected-files button { color:#ffaaa4; padding:5px; }
  .composer-notice { margin-top:9px; color:#ffd46f; font-size:11px; }
  .composer-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; border-top:1px solid var(--reddit-border,#2a393e); padding-top:12px; }
  .composer-footer > span { color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .composer-footer > span b { color:var(--reddit-text,#d7dadc); }
  .composer-footer > div { display:flex; gap:7px; }
  .cancel-button,.publish-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--reddit-border,#2a393e); border-radius:999px; padding:8px 13px; color:var(--reddit-text,#d7dadc); font-size:11px; font-weight:800; }
  .publish-button { border-color:#ffb000; background:#ffb000; color:#211a07; }
  .publish-button:disabled { opacity:.5; cursor:not-allowed; }
  .mobile-about { margin-top:10px; border-radius:10px; padding:13px; }
  .mobile-about-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; color:var(--reddit-text-strong,#f2f4f5); font-size:12px; }
  .mobile-about-heading button { color:var(--reddit-muted,#91a0a5); }
  .mobile-about > p { margin-bottom:10px; color:var(--reddit-text,#d7dadc); font-size:12px; line-height:1.5; }
  .community-feed-layout { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:18px; align-items:start; margin-top:15px; }
  .community-feed { min-width:0; }
  .feed-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:46px; margin-bottom:9px; border-bottom:1px solid var(--reddit-border,#2a393e); padding:0 2px 10px; }
  .feed-toolbar h2 { color:var(--reddit-text-strong,#f2f4f5); font-size:17px; font-weight:800; }
  .feed-toolbar p { margin-top:3px; color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .community-posts { display:grid; gap:9px; }
  .empty-community { display:flex; flex-direction:column; align-items:center; padding:54px 16px; border:1px dashed var(--reddit-border,#2a393e); border-radius:10px; background:var(--reddit-card,#152226); text-align:center; }
  .empty-icon { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; background:var(--reddit-hover,#223237); color:#ffbf45; }
  .empty-community h3 { margin-top:13px; color:var(--reddit-text-strong,#f2f4f5); font-size:14px; font-weight:800; }
  .empty-community p { max-width:360px; margin:7px 0 14px; color:var(--reddit-muted,#91a0a5); font-size:11px; line-height:1.5; }
  .community-sidebar { position:sticky; top:72px; display:grid; gap:10px; min-width:0; }
  .about-card { border-radius:10px; padding:14px; }
  .about-card h2 { color:var(--reddit-text-strong,#f2f4f5); font-size:13px; font-weight:800; }
  .about-card > p { margin-top:8px; color:var(--reddit-muted,#91a0a5); font-size:11px; line-height:1.6; }
  .about-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:13px; border-bottom:1px solid var(--reddit-border,#2a393e); padding-bottom:12px; }
  .about-stats > div { display:grid; gap:3px; }
  .about-stats strong { color:var(--reddit-text-strong,#f2f4f5); font-size:17px; font-weight:800; }
  .about-stats span,.about-category span { color:var(--reddit-muted,#91a0a5); font-size:10px; }
  .about-category { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:11px; color:var(--reddit-muted,#91a0a5); font-size:11px; }
  .about-category b { color:var(--reddit-text,#d7dadc); font-size:11px; }
  .about-card h3 { margin:15px 0 9px; color:var(--reddit-text-strong,#f2f4f5); font-size:11px; font-weight:800; }
  .rule-list { display:grid; gap:10px; color:var(--reddit-muted,#91a0a5); font-size:10px; line-height:1.55; }
  .rule-list div { display:grid; gap:3px; }
  .rule-list b { color:var(--reddit-text,#d7dadc); font-size:10px; }
  .sidebar-help { display:inline-block; margin-top:14px; color:#ffbf45; font-size:10px; font-weight:800; }
  .sidebar-community-card { border:1px solid rgba(255,176,0,.16); border-radius:10px; background:rgba(255,176,0,.04); padding:14px; }
  .sidebar-community-card strong { color:#ffdf96; font-size:12px; }
  .sidebar-community-card p { margin-top:7px; color:var(--reddit-muted,#91a0a5); font-size:10px; line-height:1.6; }
  .sidebar-community-card button { margin-top:12px; width:100%; border:1px solid rgba(255,176,0,.25); border-radius:7px; padding:8px; color:#ffdf96; font-size:10px; font-weight:800; }
  .sidebar-community-card button:hover { background:rgba(255,176,0,.08); }
  @media(max-width:1100px) { .community-feed-layout { grid-template-columns:minmax(0,1fr) 260px; gap:12px; } .community-page { padding-left:12px; padding-right:12px; } }
  @media(max-width:850px) { .community-feed-layout { grid-template-columns:minmax(0,1fr); } .community-sidebar { display:none; } .about-mobile-button { display:inline-flex; } }
  @media(max-width:620px) {
    .community-page { padding:0 8px 94px; }
    .banner-content { padding:11px 10px 13px; }
    .community-mainline { display:block; margin-top:17px; }
    .community-identity { gap:10px; }
    .community-icon-large { width:48px; height:48px; flex-basis:48px; font-size:20px; }
    .community-title-row h1 { font-size:20px; }
    .community-description { margin-top:7px; font-size:12px; }
    .community-actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:12px; }
    .about-mobile-button { grid-column:1/-1; justify-content:center; }
    .community-post-button,.community-join-button { min-height:38px; }
    .feed-toolbar { align-items:flex-end; }
    .feed-toolbar p { max-width:190px; line-height:1.5; }
    .community-composer { padding:11px; }
    .composer-tabs button { padding:10px 9px; font-size:11px; }
    .composer-tabs button :global(svg) { width:14px; }
    .composer-footer { align-items:flex-start; flex-direction:column; }
    .composer-footer > div { width:100%; }
    .composer-footer button { flex:1; }
    .empty-community { padding:38px 12px; }
  }

  .community-profile-editor{margin-top:12px;border-radius:10px;padding:16px}.community-profile-editor header h2{font-size:15px;font-weight:800;color:var(--reddit-text-strong,#f2f4f5)}.community-profile-editor header p{margin-top:4px;color:var(--reddit-muted,#91a0a5);font-size:11px}.community-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.community-profile-grid label{display:grid;gap:7px;color:#aab8bc;font-size:11px;font-weight:700}.community-profile-grid input:not([type=file]),.community-profile-grid textarea{width:100%;border:1px solid var(--reddit-border,#34474c);border-radius:7px;background:#0f1b1f;color:#e9edef;padding:9px 10px;font-size:12px;font-weight:400;outline:none}.community-profile-grid input[type=file]{display:block;max-width:100%;font-size:10px;color:#aab8bc}.profile-field-wide{grid-column:1/-1}.profile-image-field{display:grid;align-content:start;gap:8px;min-width:0}.profile-image-field img{height:54px;width:54px;object-fit:cover;border:1px solid #34474c;border-radius:8px}.profile-image-field img.banner-preview{height:70px;width:100%;max-width:300px;border-radius:7px}.community-profile-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #ffffff0b}.community-profile-actions>span{color:#718489;font-size:10px}.community-profile-actions button{border-radius:6px;background:#ff6b35;color:#1d2527;font-size:11px;font-weight:800;padding:9px 12px}.community-profile-actions button:disabled{opacity:.55}.profile-upload-progress{margin-top:12px}.profile-upload-progress>div{display:flex;justify-content:space-between;font-size:10px;color:#aab8bc}.profile-upload-progress b{color:#ff8656}.profile-upload-progress>span{display:block;height:5px;margin-top:7px;background:#2b3b40;border-radius:99px;overflow:hidden}.profile-upload-progress i{display:block;height:100%;background:#ff6b35;border-radius:99px}.inline-upload-progress{margin:12px 0;padding:10px;border:1px solid #34474c;border-radius:7px;background:#0f1b1f}.inline-upload-progress>div{display:flex;justify-content:space-between;gap:8px;color:#bac6c9;font-size:10px}.inline-upload-progress b{color:#ff8656}.inline-progress-track{display:block;height:5px;margin-top:7px;border-radius:99px;background:#2b3b40;overflow:hidden}.inline-progress-track i{display:block;height:100%;background:#ff6b35;transition:width .12s linear}.background-upload-action{border:1px solid #34474c;border-radius:6px;padding:7px 9px;color:#dbe3e5;font-size:10px;font-weight:700}.background-upload-action:hover{background:#26383d}
  @media(max-width:620px){.community-profile-grid{grid-template-columns:minmax(0,1fr)}.profile-field-wide{grid-column:auto}.community-profile-actions{align-items:flex-start;flex-direction:column}.community-profile-actions button{width:100%}}

  .community-about-edit-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;border:1px solid var(--reddit-border,#34474c);border-radius:6px;padding:0 10px;color:var(--reddit-text,#d7dadc);font-size:11px;font-weight:700}.community-about-edit-button:hover{border-color:#72858a;background:#213337}

  .community-special-nav { display:flex; gap:6px; overflow-x:auto; margin-top:9px; padding:0 0 5px; border-bottom:1px solid var(--reddit-border,#2a393e); }
  .community-special-nav a { display:inline-flex; align-items:center; gap:6px; flex:0 0 auto; border-radius:999px; padding:8px 12px; color:var(--reddit-muted,#91a0a5); font-size:11px; font-weight:800; }
  .community-special-nav a:hover,.community-special-nav a.active { background:var(--reddit-hover,#223237); color:var(--reddit-text-strong,#f2f4f5); }
  .community-special-nav a.active { box-shadow:inset 0 -2px #ff6b35; border-radius:8px; }
</style>
