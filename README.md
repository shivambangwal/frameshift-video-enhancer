# FrameShift — Video Enhancement Prototype

A static browser-based video enhancement UI prototype. The frontend is in `dist/`.

## What works

- Load a video into the browser for local preview.
- Adjust the browser-side preview and export the result in a format supported by the browser.

No AI model or backend provider is connected yet, so neural restoration is not included. Video files are handled in the browser; this repository does not contain a server that receives them.

## Preview locally

From the repository root, run:

```bash
python3 -m http.server 8000 --directory dist
```

Then open http://localhost:8000.

## Files

- `dist/index.html` — page structure
- `dist/styles.css` — styling
- `dist/app.js` — preview and export behavior

Local deployment metadata and generated output archives are intentionally excluded.
