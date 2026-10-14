<script lang="ts">
  import { page } from '$app/state';
  import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
  let category = $state('technical');
  const categoryOptions: DropdownOption[] = [{value:'account',label:'Account access'},{value:'technical',label:'Technical issue'},{value:'safety',label:'Safety / report abuse'},{value:'privacy',label:'Privacy request'},{value:'appeal',label:'Ban or moderation appeal'},{value:'billing',label:'Billing'},{value:'other',label:'Other'}];
  let subject = $state('');
  let message = $state('');
  let contactEmail = $state('');
  let website = $state('');
  let busy = $state(false);
  let notice = $state('');
  let failed = $state(false);
  async function submit() {
    if (busy) return; busy = true; notice = '';
    try {
      const response = await fetch('/api/support', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category, subject, message, contactEmail, website }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not submit support ticket.');
      subject = ''; message = ''; website = ''; notice = 'Your support request was recorded. Keep the details free of passwords, private keys, and unnecessary sensitive information.'; failed = false;
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not submit support ticket.'; failed = true; }
    finally { busy = false; }
  }
</script>
<div class="mx-auto max-w-[850px] px-4 pb-14 sm:px-6">
  <header class="surface-card rounded-[1.5rem] p-6 sm:p-8"><p class="text-[10px] font-extrabold uppercase tracking-[.18em] text-indigo-200">CUSTOMER SUPPORT</p><h1 class="mt-2 text-3xl font-extrabold tracking-tight text-white">How can we help?</h1><p class="mt-2 text-sm leading-6 text-slate-400">Report access problems, safety concerns, privacy questions, bugs, or appeal an account restriction. For urgent safety issues, select Safety and include only the information needed to understand the concern.</p></header>
  <form onsubmit={(event) => { event.preventDefault(); submit(); }} class="surface-card mt-4 rounded-[1.4rem] p-5 sm:p-7"><div class="grid gap-4 sm:grid-cols-2"><label class="field">Category<Dropdown label="Category" value={category} options={categoryOptions} onChange={(value) => category = value} fullWidth /></label><label class="field">Contact email (optional when signed in)<input bind:value={contactEmail} type="email" maxlength="254" class="control" placeholder="you@example.com"/></label></div><label class="field mt-4">Subject<input bind:value={subject} minlength="5" maxlength="120" required class="control" placeholder="Briefly describe the issue"/></label><label class="field mt-4">Details<textarea bind:value={message} minlength="10" maxlength="5000" rows="7" required class="control" placeholder="What happened? Include steps to reproduce when relevant."></textarea><span class="text-right text-[10px] font-normal text-slate-600">{message.length}/5000</span></label><label aria-hidden="true" class="sr-only">Leave empty<input bind:value={website} tabindex="-1" autocomplete="off"/></label>{#if notice}<p class={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${failed ? 'border-rose-300/10 text-rose-100' : 'border-emerald-300/10 text-emerald-100'}`} role="status">{notice}</p>{/if}<div class="mt-5 flex flex-wrap items-center justify-between gap-3"><p class="max-w-md text-[10px] leading-5 text-slate-600">Never send passwords, account recovery codes, DM private keys, or full payment details. Support messages are not end-to-end encrypted.</p><button disabled={busy} class="rounded-xl bg-indigo-300 px-5 py-3 text-xs font-extrabold text-slate-950 disabled:opacity-50">{busy ? 'Submitting…' : 'Submit support request ↗'}</button></div></form>
</div>
<style>.field{display:grid;gap:8px;color:#a7b1c5;font-size:11px;font-weight:700}.control{width:100%;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(0,0,0,.2);padding:11px 12px;color:#e2e8f0;font-size:13px;font-weight:400;outline:none}.control:focus{border-color:rgba(156,167,255,.35)}.control::placeholder{color:#5b667b}</style>
