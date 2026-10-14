# Setup route compile fix

This patch fixes the startup compiler error observed while opening `/setup` with Svelte 5.

## Changes

- Replaced the invalid `class:chevron-open` directive on the imported `ChevronDown` component with a normal conditional `class` prop.
- Made the setup page's `logoInput` reference reactive using `$state`, so clicking the custom upload control uses a state-safe reference.
- Associated the community-logo label with the hidden file input using `for="communityLogoInput"` and `id="communityLogoInput"`.
- Replaced the visual label for the custom feed-ranking dropdown with a styled non-label caption; the dropdown button already exposes its accessible name via `aria-label`.
- Removed obsolete `.field select` CSS after setup migrated to the shared custom dropdown component.

## Apply and verify

Merge the included `nexus-next` folder into the existing project, retaining `.env` and `.env.local`.

```bash
npm install
npm run check
npm run dev
```

The project dependency install could not be completed in the patching environment because npm registry access timed out. Run the checks above locally to validate the complete framework build.
