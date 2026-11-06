# AGENTS.md: pinsay-figma-plugin

The PinSay Figma Community plugin.

## Stack and Commands
- **Stack:** TypeScript, esbuild, Vitest, `@figma/plugin-typings`
- **Commands:** `npm run typecheck && npm test && npm run build`

## Architecture & Layout
- `src/code.ts`: Figma sandbox side (plugin API, scene graph, selection, specs, export). No network access here.
- `src/ui/*`: UI iframe running inside Figma dialog. Performs all network requests (only to `__PINSAY_SERVER__`).
- `src/shared/*`: Shared types, messages contract, and link/spec helpers used by both sandbox and UI.

## Conventions & Rules
- All UI strings live in `src/ui/i18n.ts` supporting `en` and `ar`. Brand names "Figma" and "PinSay" stay in Latin script in Arabic translations.
- Every interpolated string rendered into HTML must be escaped against XSS.
- Never log, display, or leak API keys, personal access tokens, or session tokens.
