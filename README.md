# PinSay Figma Plugin

The [PinSay](https://pinsay.dev) plugin for Figma: send a frame, component or group from your design to a PinSay
comment, so the person (or AI coding agent) who applies the feedback has the design and its CSS specs at hand.

Install: pending Figma Community review; the install link goes here once Figma approves the plugin. Docs at
[pinsay.dev/docs](https://pinsay.dev/docs/).
<!-- After approval, replace the line above with:
Install: [PinSay on Figma Community](https://www.figma.com/community/plugin/1700222297788975458) · docs at
[pinsay.dev/docs](https://pinsay.dev/docs/).
(docs/RELEASING.md § Figma plugin, step 6) -->

This repository is a **read-only mirror** of the plugin's folder in PinSay's main (private) repository,
updated at each plugin release. Licence: [MIT](LICENSE).

## What it does

- **Attach to comment:** pick an open comment in your PinSay project (search by text or `#number`) and reply to it
  with the selected frame: a thumbnail, its CSS specs and a link back to Figma, plus an optional note.
- **Pin on live site:** pick your project's site; the plugin opens it in your browser, and you click the element on
  the page to pin the frame there as a new comment.

## How to use it

1. In Figma, run **PinSay** from the Plugins menu and choose **Sign in with PinSay**. Approve the code in the browser
   window that opens.
2. Select one frame, component or group on the canvas.
3. Pick the project, then **Attach to comment** or **Pin on live site**.

The plugin needs the Figma integration enabled for your PinSay workspace.

## Figma file links

Community plugins cannot read `figma.fileKey` directly. The plugin asks you to paste the file's link once per file
(In Figma: **Share** → **Copy link**); the link is then remembered for that file.

## Build from source

```bash
npm install
npm run build    # → dist/
npm test
```

To try your build: in Figma desktop, **Plugins** → **Development** → **Import plugin from manifest…**, and select
this repository's `manifest.json`. `npm run watch` rebuilds on change.

## Contributing

This repository is a mirror: changes are made in PinSay's main repository and pushed here at each release, so
pull requests can't be merged directly. Found a bug or have an idea? Email support@pinsay.dev.

## License

[MIT](LICENSE) © PinSay
