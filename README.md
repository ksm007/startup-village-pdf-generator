# Startup Village PDF Generator

Generate polished, multi-page inspection reports as PDFs from structured JSON.

## Highlights

- TREC-style header pages prepended (optional footers suppressed to avoid duplication)
- Robust pagination with a footer-safe buffer (no content overlaps page numbers)
- Section headers (Roman numerals) and line items with I/NI/NP/D checkboxes
- Comments with wrapped text and a single bottom separator line
- Photo grid (3 columns), per-row scaling, captions, and safe page breaks
- Video links rendered as clickable, blue, underlined text: `Video link n: <url>`
- Legend box slimmed and aligned; checkboxes smaller and flattened (non-editable)

## Repository layout

- `generatePdf.js` — Main HTTP handler that composes the full report and writes `output.pdf`
- `server.js` — Express server with routes (see API) that calls `generatePdf`
- `create-header-page.js` — Generates the TREC header pages inserted at the beginning
- `worker.js` — Alternate/test path for per-section rendering (also writes sample PDFs under `pdfs/`)
- `local-generate.js` — Tiny runner that reads `inspection.json` and invokes `generatePdf` without the server
- `inspection.json` — Sample payload for local runs

## Prerequisites

- Node.js 18+
- Windows PowerShell (commands below assume PowerShell)

## Install

```powershell
# From the project root
npm install

# If the server fails to start due to missing Express, install it explicitly
npm install express
```

Notes:
- The current `package.json` lists `express.js` instead of `express`. If the server fails to start, add `express` as shown above.
- `nodemon` is referenced by the `start` script; if you want to use it:
  ```powershell
  npm install --save-dev nodemon
  ```
  Otherwise, run the server with `node server.js`.

## Quick start (local, no server)

```powershell
# Generate a PDF using the bundled sample payload
node .\local-generate.js

# The output will be written to:
#   .\output.pdf
```

## Run the server

```powershell
# Option A: with node
node .\server.js

# Option B: with nodemon (if installed)
npm start
```

If the process exits with code 1, see Troubleshooting.

## API

- POST `/genPdf`
  - Body: JSON shaped like `inspection.json` (top-level `{ inspection: { ... } }`)
  - Response: `{ ok: true, message: "pdf created successfully" }`
  - Side-effect: writes `output.pdf` in the project root

Example (PowerShell):
```powershell
$body = Get-Content .\inspection.json -Raw | ConvertFrom-Json
Invoke-RestMethod -Uri http://localhost:8080/genPdf -Method Post -Body ($body | ConvertTo-Json -Depth 100) -ContentType 'application/json'
```

### Other routes in server.js

`/genTOC` and `/genCompleteReport` are wired but depend on modules that may not be present. If those files are missing, the server will fail to start. You can comment out those routes or add the missing implementations.

## Input format (overview)

The generator expects an object shaped like:

```jsonc
{
  "inspection": {
    "address": { "fullAddress": "..." },
    "schedule": { "date": 1730505600000 },
    "sections": [
      {
        "name": "Interior Elements",
        "lineItems": [
          {
            "id": "...",
            "name": "Wiring",
            "inspectionStatus": "I", // or NI/NP/D
            "isDeficient": false,
            "comments": [
              {
                "label": "Aluminum Wiring Observed",
                "content": "... long wrapped text ...",
                "photos": [ { "url": "https://.../image.jpg", "caption": "optional" } ],
                "videos": [ { "url": "https://.../file.mp4" } ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Rendering details

- Header pages: Generated via `create-header-page.js` and inserted at the beginning of the final PDF. Their footers are suppressed when composing into the final document.
- Section headers: Centered, uppercase with Roman numerals, conservative spacing.
- Legend & checkboxes: Legend text + slim bordered box; 4 checkboxes (I/NI/NP/D) aligned underneath; fields flattened in the final PDF.
- Comments: Bold label, wrapped body text, then optional media.
- Photos: 3-column grid, per-row scaling, captions under images, safe pagination; footer buffer enforced.
- Videos: For each video, prints `Video link n: <url>` in blue, underlined, clickable. Long URLs wrap at URL-friendly separators.
- Footer: Page X of Y centered; TREC line and URL in the footer; content kept above via a 100px footer buffer.

## Output

- Main generation writes `output.pdf` to the project root.
- Some worker/test paths write under `./pdfs/` for inspection.

## Troubleshooting

- Server exits with code 1
  - Likely causes:
    - Missing dependency: Install Express (`npm install express`).
    - Mismatched imports: `server.js` requires modules not present (e.g., `create-table-of-contents`, `generate-complete-report`). Comment out those routes or add implementations.
    - Optional: install `nodemon` or invoke `node server.js` directly.
- Slow or failing images
  - The generator uses HTTP(S) with a 10s timeout and skips on error; check links or host availability.
- Content overlapping footer
  - A fixed footer buffer (100px) prevents overlaps; if you customize the footer, increase `FOOTER_BUFFER` in `generatePdf.js`/`worker.js`.

## Development notes

- pdf-lib is used for composition; forms are flattened before saving.
- Image fetching uses built-in `http/https` with timeouts.
- Layout code prioritizes predictable pagination and readability over squeezing maximum content per page.

## License

MIT (or project’s preferred license)
