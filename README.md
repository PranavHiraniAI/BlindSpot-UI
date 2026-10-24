# BlindSpot UI

An AI-powered visual UI auditor for a second opinion on website and app screenshots. Upload a PNG, JPEG, or WebP image, preview it, then ask Gemma for a prioritized, evidence-grounded review of potential usability and accessibility issues.

**This is a local hackathon MVP, not a WCAG certification tool.** The application has a real model integration, not canned reports. Live inference requires a working API key and access to the configured model.

## Why visual reasoning is central

Hierarchy, crowded layouts, faint text, ambiguous affordances, and the relationship between a label and its control are spatial, visual properties. A screenshot preserves these relationships when a text-only description does not. BlindSpot sends the actual image to Gemma; Gemma's visual reasoning produces the summary, evidence, impact, recommendation, confidence estimate, and optional approximate region for every finding. The application validates and presents that output rather than substituting a rules-based or prewritten audit.

The model cannot reliably establish contrast ratios, CSS target sizes, keyboard support, screen-reader behavior, hidden semantics, or responsiveness at unseen viewports. Findings need human review and source-level checks.

## Model and availability

- Default model: `gemma-4-26b-a4b-it`, configurable with the **server-only** `GEMMA_MODEL` variable.
- SDK: Google's [`@google/genai`](https://github.com/googleapis/js-genai), using `models.generateContent` with inline image bytes followed by the audit prompt.
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) and [current Gemma documentation](https://gemma.ai/).
- [Gemma 4 Apache 2.0 model license](https://ai.google.dev/gemma/apache_2). Google's [legacy Gemma terms page](https://ai.google.dev/gemma/terms) directs Gemma 4 users to that license; do not assume older model terms apply unchanged.
- Hosted requests are also subject to [Gemini API terms](https://ai.google.dev/gemini-api/terms), availability, account permissions, quotas, and any applicable charges.

**Availability caveat:** the model card documents Gemma 4 vision, but the requested model ID was not listed in the [public Gemini API model catalog](https://ai.google.dev/gemini-api/docs/models) during implementation. An open-weight model existing does not prove that the same ID is served by the Developer API. There is deliberately no automatic Gemini fallback or alternate hosting. Use the live check below to establish access for your account. Model-specific constrained JSON generation is not assumed: the prompt requires JSON and Zod validates the returned text.

## Run locally

Prerequisites: **Node.js 24 LTS** and npm 11 or newer. The installed system Node during development was 20.17.0, so checks were run with an isolated Node 24 runtime instead; upgrade before using the standard commands below. You do not need Python, Docker, a database, or Azure services.

From the repository root, in PowerShell:

```powershell
npm install
Copy-Item .env.example server/.env
```

Set `GEMINI_API_KEY` privately in `server/.env`. Do not paste it in chat, commit it, or put it in a `VITE_*` variable. Keep the default `GEMMA_MODEL` unless you have explicitly verified another intended model. Restart the backend after changing its environment file.

Start both processes:

```powershell
npm run dev
```

Or use two terminals, both at the repository root:

```powershell
npm run dev:server
```

```powershell
npm run dev:client
```

- Frontend: <http://127.0.0.1:5173>
- Backend health: <http://127.0.0.1:3001/api/health>
- Vite proxies `/api` to the backend. There is no permissive CORS configuration.

Select a screenshot or choose **Use sample screenshot**, then select **Analyze UI**. Sample selection does not automatically submit an image. The sample uses the same real API path and requires the same credentials; it is not an offline fake-results mode. With no key configured, you can inspect the interface and preview images, but analysis returns an actionable setup error.

If the backend port is occupied, set both process variables before starting the combined command:

```powershell
$env:PORT = '3002'
$env:API_PORT = '3002'
npm run dev
```

`PORT` controls Express; `API_PORT` configures Vite's server-side proxy only, not a browser environment variable. Vite chooses another available frontend port if 5173 is occupied; use its printed URL.

## Features

- PNG, JPEG, WebP uploads, drag-and-drop, preview, and expanded-image dialog.
- Original bundled sample screenshot, generated from a fictional project dashboard.
- Explicit Analyze action, loading timer, duplicate-submit prevention, errors, and retries.
- Summary, severity counts, up to eight prioritized findings, and severity filters.
- Category, evidence, likely impact, recommendation, and model-estimated confidence.
- Optional, approximate percentage-based screenshot regions linked to finding cards.
- Full-report JSON download and Markdown clipboard export, independent of the active filter.
- Responsive dark workbench, keyboard controls, focus indicators, reduced-motion support, live status announcements, and honest empty states.

## API and validation

`POST /api/audit` accepts `multipart/form-data` with exactly one file field named `screenshot`, no additional fields. Maximum upload: **5 MiB (5,242,880 bytes)**. Supported MIME types: `image/png`, `image/jpeg`, `image/webp`. Sharp verifies the actual format, dimensions, and successful decoding; corrupt, mismatched, animated/multipage, and greater-than-25-megapixel images are rejected before inference.

Successful response:

```json
{
  "summary": "Evidence-grounded overview",
  "findings": [
    {
      "title": "Potentially faint helper text",
      "category": "contrast",
      "severity": "medium",
      "evidence": "Helper text appears faint against the light form background.",
      "impact": "Some readers may have difficulty reading it.",
      "recommendation": "Darken the text and measure contrast in the source UI.",
      "confidence": 0.8,
      "region": { "x": 65, "y": 50, "width": 30, "height": 15 }
    }
  ]
}
```

This is a schema illustration, **not a captured Gemma result**. Categories: `readability`, `contrast`, `hierarchy`, `interaction`, `forms`, `layout`, `other`. Severities: `high`, `medium`, `low`. Confidence is finite and between 0 and 1, not a calibrated probability. Zero findings is valid, not proof of accessibility.

Zod strips unknown fields, trims and bounds strings, enforces enums and the eight-finding limit, and rejects invalid required data. Regions are optional: all coordinates must be percentages within the image, with positive size and in-bounds extents. Invalid regions are omitted, never fabricated or clamped. One enclosing JSON code fence is tolerated; invalid/truncated JSON is not heuristically repaired. Findings are stably sorted by severity.

Errors use `{ "error": { "code": "...", "message": "..." } }`:

| Status | Meaning |
| --- | --- |
| 400 | Missing, corrupt, excessive-dimension, or invalid multipart image |
| 413 | Upload exceeds 5 MiB |
| 415 | Unsupported image MIME type |
| 429 | Provider quota or rate limit |
| 503 | Missing key, unavailable model, or rejected provider configuration |
| 504 | Provider deadline exceeded |
| 502 | Provider failure, refused/incomplete output, or invalid model JSON |
| 500 | Unexpected application failure, with sanitized details |

`GET /api/health` reports server status, whether a key is configured, and the configured model name. It does **not** expose the key or certify that model access works. The provider deadline is approximately 60 seconds. Client cancellation may not stop provider execution or associated charges.

## Security and privacy

- API credentials are read only by server code. No client environment secret, database, authentication, screenshot history, filesystem upload storage, or remote-URL fetching.
- Uploads and reports are transient in server memory; API responses use `Cache-Control: no-store`. No raw images, raw provider responses, or keys are logged.
- Screenshots are transmitted to Google. **Server non-retention is not a claim about Google's retention or training policies.** Review the applicable API terms and remove sensitive, personal, confidential, and medical information before upload.
- Exports are explicitly downloaded or copied by the user. The built-in sample is public and fictional. Browser previews use object URLs that are revoked when replaced.
- Model text is rendered as React text, never HTML. Markdown exports escape model-controlled markup. Screenshot content is treated as untrusted evidence in the prompt.
- This MVP listens on loopback and is for trusted local use. Do not expose it publicly without adding authentication, rate/concurrency controls, abuse protection, and deployment hardening.

## Build and verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

For browser checks and sample regeneration, install the development browser once:

```powershell
npx playwright install chromium
npm run test:e2e
npm run sample
```

Browser tests start their own frontend/backend on 4173/3101, covering desktop/mobile workflows, keyboard focus, missing credentials through the real backend, region alignment, filtered reports, complete exports, malformed results, clipboard errors, and zero findings. Canned provider fixtures exist **only in tests**; these tests do not establish real Gemma availability.

Explicit live check (requires a key and model access):

```powershell
npm run verify:model
```

This inspects model metadata, then submits the original sample image through the real SDK and validates its report. Missing credentials or denied/unavailable model access fail the check; no fallback is used. During implementation, the live check was **blocked by an absent API key**. A successful real screenshot-to-Gemma inference has therefore **not been verified** in this environment.

Run built artifacts in separate root terminals:

```powershell
npm run start:server
```

```powershell
npm run preview:client
```

Vite preview uses the same API proxy (default preview port 4173). This is a local preview, not production deployment automation.

## Structure

```text
client/            React UI, CSS, and bundled sample image
server/src/        Express API, image validation, prompt and real SDK call
shared/audit.ts    Single Zod report contract and types
scripts/          Original sample renderer and opt-in live model check
tests/            Playwright desktop/mobile workflows
```

There is no generic service framework or shared package. Source-level server tests and export tests live beside their implementations. The root lockfile records the dependency graph for reproducible installs (`npm ci`).

## Open source and acknowledgments

Original BlindSpot UI code and the original fictional Fieldwork sample interface are provided under the [MIT License](LICENSE). No Gemma model weights are distributed. Model licenses, hosted API terms, fonts, dependencies, and pre-existing third-party materials remain subject to their own terms; the project's MIT license does not relicense them.

Key dependencies and their roles (see installed packages for full notices and transitive/native-component licenses):

| Dependency | Role | License |
| --- | --- | --- |
| React / React DOM | UI | MIT |
| Vite / TypeScript | Build / type checks | MIT / Apache-2.0 |
| Express / Multer | API / bounded memory uploads | MIT |
| `@google/genai` | Real Google model calls | Apache-2.0 |
| Zod | Report validation and sanitization | MIT |
| Sharp | Image format and decode validation | Apache-2.0; native components have separate notices |
| dotenv | Server-local environment loading | BSD-2-Clause |
| lucide-react | Interface icons | ISC |
| IBM Plex Sans via Fontsource | Bundled typography | OFL-1.1 |
| tsx / concurrently | Local development commands | MIT |
| Vitest / Supertest | Unit and API tests | MIT |
| Playwright | Browser tests and original sample capture | Apache-2.0 |
| Oxlint | Source linting | MIT |

**Coding assistant:** GitHub Copilot assisted with planning, implementation, documentation, and test development. Contributors remain responsible for review and correctness. No endorsement by Google, Gemma, or dependency authors is implied.