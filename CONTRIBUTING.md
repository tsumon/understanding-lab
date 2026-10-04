# Contributing

Thanks for helping improve Understanding Lab. Keep changes focused on the learning flow, its evidence, and the boundaries around local data and optional services.

## Development

Use Node.js 22.12 or newer and npm. Install from the committed lockfile and start the local app:

```sh
npm ci
npm run dev
```

Before submitting a change, run the deterministic checks that cover it. The standard local set is:

```sh
npm run typecheck
npm test
npm run experiment:test
npm run build:offline
```

`npm test` uses local test doubles and isolated temporary SQLite databases; it does not call a real model. `npm run experiment:test` requires [uv](https://docs.astral.sh/uv/getting-started/installation/) and the locked Python/NumPy environment. Prepare it without changing the lockfile:

```sh
uv sync --project tools/experiment --frozen --python 3.12.13
```

For browser checks, install the project-pinned browsers once, then run the suite (which builds the offline app and starts its own port 4173 preview):

```sh
npx playwright install chromium webkit
npm run test:e2e
```

Linux may also need Playwright's OS dependencies; CI uses `npx playwright install --with-deps chromium webkit`. Browser configurations emulate desktop, iPhone and Android views; they are not physical-device acceptance. Do not add retries, weaken assertions or loop runs to hide the known intermittent WebKit failure.

Run `npm run eval:check` for evaluation-data integrity. It does not call a provider or certify model output. `npm run eval:run` is opt-in and currently supports deterministic fixtures only; real-provider/human semantic acceptance remains separate.

## Data and credentials

- Use synthetic examples in tests and screenshots. Never commit real learner records, recordings, account data, `.env` files, provider keys, OAuth secrets, or database files.
- Keep the default tutor and transcription settings disabled. Do not enable live provider calls in tests or CI. Explicitly enabling the tutor can cause a potentially billable compatibility probe each time the server restarts.
- Treat “send to AI” and “save to account” as separate consent choices. Keep private notes out of tutor requests unless a user explicitly includes them.
- Do not describe fixture results, schema checks, or source review as real-model or human teaching validation.

## Optional service changes

The anonymous browser lesson should remain usable without a server or credentials. Account features require operator-configured GitHub OAuth, a persistent SQLite path, and explicit database migration. Tutor and transcription are separate opt-ins. Transcription deployment requires an externally installed FFmpeg executable (`FFMPEG_PATH` can select its location); verify the exact FFmpeg build's license and notices before distributing it. See [Getting started](docs/getting-started.md), the [deployment guide (Chinese)](docs/deployment.md), and [privacy boundaries (Chinese)](docs/privacy.md).

## License

By contributing, you agree that your original contributions to the project are offered under the [MIT License](LICENSE). Third-party dependencies retain their own terms; see [Third-party notices](THIRD_PARTY_NOTICES.md).
