# Optional Nace AI integration

LWC can ask [Nace AI](https://nace.ai)'s decision model **Drex** for a second opinion on an
Evidence Gate result. This is optional. Without it, LWC works exactly the same.

> **Status.** The integration follows the official Drex API reference (OpenAPI "Drex API" 1.0.0,
> read on 20 October 2026 from https://console.nace.ai/llms-full.txt). It is covered by unit tests
> against mocked responses. **No call to the real Nace API was made during development**, because
> no key was available. See [What still needs a manual check](#what-still-needs-a-manual-check).

## Why Drex, and only Drex

Drex takes a JSON `state` and typed questions, and returns calibrated probabilities in one
synchronous call (`POST /v1/systemone`). That fits one real need of the gate: a heuristic radar
produces findings a human has to triage, and Drex can rank them.

LWC asks two kinds of questions:

| Question id | Type | Labels |
| --- | --- | --- |
| `overall` | choice | `ready-for-human-review`, `needs-more-evidence`, `not-ready` |
| `finding:<id>` (one per sent finding) | choice | `fix-before-merge`, `verify-manually`, `likely-noise` |

The answers appear in the **AI advisory (not evidence)** section with Drex's own `confidence`.
LWC never invents a confidence value.

**Perception is not used yet.** It reads documents through an asynchronous job API, and its list
of supported formats does not include source code. Its natural use in LWC would be extracting
acceptance criteria from a requirements PDF or DOCX. That is a separate feature, left for a later
version.

## What Nace can and cannot do here

| | |
| --- | --- |
| ✔ | Order the findings a human should look at first. |
| ✔ | Give a calibrated "how ready does this look" signal on top of the deterministic verdict. |
| ✖ | Change the verdict, a check, a claim status or a finding. The code makes this impossible, and tests prove it. |
| ✖ | Prove that code is correct or secure. "Drex sees no risk" is never reported as a pass. |
| ✖ | Replace tests, static analysis or a security review. |

## Setup

1. Create a key in the Nace console under **Dashboard › API Keys**. The full key is shown once.
2. Put the key in the environment. Never put it in a file:

   ```bash
   export NACE_API_KEY=nace_sk_...          # bash/zsh
   $env:NACE_API_KEY = "nace_sk_..."        # PowerShell, current session only
   ```

   In GitHub Actions, store it as a repository secret and pass it with
   `env: NACE_API_KEY: ${{ secrets.NACE_API_KEY }}`.
3. Look at what would be sent. This needs no key and sends nothing:

   ```bash
   lwc gate --ai-preview
   ```

4. Run the gate with the advisory:

   ```bash
   lwc gate --ai nace
   ```

   To enable it permanently, set `"ai": { "provider": "nace" }` in `lwc.config.json`.

### Settings

All settings are optional and go in `lwc.config.json` or `.lwc/config.json`:

```json
{
  "ai": {
    "provider": "off",
    "timeoutMs": 60000,
    "maxFindings": 40,
    "includePaths": true,
    "includeObservations": false,
    "includeRequirements": false,
    "maxRequirementChars": 4000,
    "nace": {
      "baseUrl": "https://console.nace.ai",
      "model": "drex-latest",
      "apiKeyEnv": "NACE_API_KEY"
    }
  }
}
```

- `model`: pin a version such as `drex-v2.0` for repeatable runs. The report always records the
  pinned version that served the request.
- `apiKeyEnv`: names the variable that holds the key. The key itself is never read from config.
  If any config layer contains a key such as `apiKey`, `token`, `secret` or `password`, `lwc gate`
  refuses to run.
- `baseUrl`: must be `https`. Plain `http` is accepted only for `localhost` and `127.0.0.1`, for
  local mock servers.

## Exactly what is sent

The request body is `{"model", "state", "questions"}`, and `state` is the advisory payload. It is
built from the finished gate report, not from the repository (`src/gate/payload.ts`).

**Sent:**

- schema id, verdict;
- task title and stage;
- claim id, text, kinds and status;
- for at most `maxFindings` findings, most severe first: id, rule, category, severity, status,
  title (a fixed catalog text) and the file path (`includePaths`);
- the number of findings left out.

**Sent only when you turn it on:**

- finding observations (`includeObservations`);
- requirement file excerpts, up to `maxRequirementChars` (`includeRequirements`).

**Never sent:**

- source code or file contents;
- line numbers;
- stdout or stderr of runs;
- environment variables;
- the journal;
- `.lwc/` files;
- git data beyond file paths.

All free text goes through redaction before it leaves the machine. Task titles, claims, optional
observations and optional requirements are covered. These values are replaced:

- secret patterns from the security analyzer (cloud keys, tokens, private keys, passwords in
  assignments, database URLs with passwords);
- e-mail addresses;
- 12–19 digit numbers, which covers Kazakhstan IIN/BIN and card numbers;
- phone numbers.

The report keeps a copy of the exact payload under `advisory.sentPayload`, plus the sha256 and size
of the request body. You can audit any past request.

## Errors

The provider never throws. Every failure becomes an advisory status, and the deterministic result
stands unchanged.

| Situation | Advisory status | Sent? |
| --- | --- | --- |
| `NACE_API_KEY` not set | `not-configured` | no |
| The variable does not match the documented key format `nace_sk_` + 43 characters | `not-configured` | no, to avoid leaking another secret |
| Non-https `baseUrl` | `not-configured` | no |
| 401 / 402 / 422 | `error`, with the documented `error.type` and `error.message` | yes |
| 429 / 500 / 529 | one retry, honouring `retry-after-ms` / `retry-after` (capped at 5 s), then `error` | yes |
| Network failure or timeout (one deadline for the whole call) | `error` | maybe |
| Non-JSON body, missing or mistyped answers, unknown labels, confidence outside [0, 1] | `invalid-response`; the whole answer is ignored | yes |

The key is sent only in the `Authorization: Bearer` header. It never appears in reports, logs,
the journal or error messages, and the tests check this. The tests also remove `NACE_API_KEY`
from every child process they start, so they can never reach the real API.

## Direct HTTP rather than the SDK

The official TypeScript SDK `nace-sdk` exists. It is version 0.2.0, Apache-2.0, has no
dependencies and is about 709 KB unpacked. LWC calls the HTTP API directly for these reasons:

- LWC needs one endpoint. The SDK covers about thirty, plus documents, jobs and workspaces.
- LWC promises zero runtime dependencies. A bundled 709 KB client would be the first.
- The SDK's source repository is not linked from npm. With `fetch`, every byte LWC sends is visible
  in about 250 lines of `src/providers/nace.ts`.
- Retries, timeouts and the error envelope are documented. Implementing the subset LWC needs is small.

If LWC later uses Perception's job API (upload, poll, SSE), the SDK becomes worth reconsidering.

## Data handling at Nace

Read the current [privacy policy](https://console.nace.ai/privacy) and terms yourself before
enabling the integration. As of 20 October 2026, the documentation says:

- customer content is not used to train, fine-tune or evaluate shared models unless you authorize it;
- customer content is deleted within 48 hours after processing on paid accounts and within 7 days
  on the free tier, according to the terms;
- an account-level zero-retention setting deletes documents and results within 1 hour after
  delivery;
- information is processed and stored in the United States and in other countries where Nace's
  service providers operate.

LWC makes no claim about any jurisdiction's legal requirements. That includes Kazakhstan.

## What still needs a manual check

The following could not be verified without a key. They are the first things to check with a real
account:

1. A real `POST /v1/systemone` call with the payload from `lwc gate --ai-preview` returns `200`, and
   the answers parse. Expected: advisory status `ok`.
2. The labels and confidences are useful on a real project, not just well-formed. This is a product
   question for the quality of the questions in `src/providers/nace.ts`.
3. The behaviour on `402` (no credit) and `429` (rate limit) matches the docs.
4. Token usage and cost for a typical payload of 40 findings. The docs say Drex bills input tokens
   only.
