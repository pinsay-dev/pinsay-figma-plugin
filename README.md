# PinSay Figma Plugin

The PinSay Figma Community plugin connects your Figma designs directly with PinSay feedback:

- **Scenario A (Attach to comment):** Select a frame, component, or section in Figma and attach it with thumbnail and CSS specs to an existing PinSay comment thread.
- **Scenario B (Pin on live site):** Pick a target page in your PinSay project and send the selected frame directly to the live site to open the widget and pin the comment.

This repository is a **read-only mirror** of the plugin's folder in PinSay's main (private) repository,
updated at each plugin release. Licence: [MIT](LICENSE).

## Getting Started

```bash
cd pinsay-figma-plugin
npm install
npm run build
npm test
```

## Local Development

1. Open Figma desktop.
2. Navigate to **Plugins** → **Development** → **Import plugin from manifest...**.
3. Select `pinsay-figma-plugin/manifest.json`.
4. Run `npm run watch` (or `npm run build`) to compile changes to `dist/`.

To test against a local API instead of production:
```bash
PINSAY_SERVER=http://localhost:5174 npm run build
```
Note that `http://localhost:5174` is configured in `manifest.json` under `devAllowedDomains`.

## Publishing (CEO)

1. Create the plugin in Figma desktop: **Plugins** → **Development** → **New plugin** under the PinSay organization/account.
2. Figma assigns a permanent plugin `id`. It is set in `manifest.json` as `"id": "1700222297788975458"`.
3. Build the production bundle: `npm run build`.
4. From Figma desktop, select the plugin and choose **Publish**.
5. Set the public name to **PinSay** and website link to `https://pinsay.dev`.

> **Note:** Community plugins cannot read `figma.fileKey` directly. The plugin will prompt the designer to paste the file's link once per file; the file key is then remembered in client storage.
