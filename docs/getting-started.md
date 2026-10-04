# Getting started

Run the anonymous lesson locally first. It needs no account, API key, or server. This guide also explains how an operator can opt into account sync, tutor feedback, or speech transcription. Those services are not hosted by this project.

## How to run the local lesson

### Prerequisites

- Node.js 22.12 or newer and npm. Node 22.23.2 with npm 10.9.8 was used for the verified setup.
- Git and network access to install npm packages.
- On systems without a matching `better-sqlite3` prebuilt binary, local native build tools may be needed.

### Steps

```sh
git clone --branch codex/understanding-lab-mvp https://github.com/tsumon/understanding-lab.git
cd understanding-lab
npm ci
npm run dev
```

Open the local address printed by Vite. Start a lesson, explain overfitting, make a prediction, and open the experiment. The app stores an anonymous attempt in this browser's local storage. It does not automatically appear on another device.

Use **Language / 语言** to switch English and 简体中文. The choice is remembered locally; your writing and historical feedback are not translated. A tutor request already in progress keeps its original requested language.

### Verify

The page should load without `.env` or a running account server. Tutor and transcription actions require their optional services; the text lesson and experiment work without them.

## How to use the lesson offline

The development server is not the offline version. Build and preview the cached app:

```sh
npm run build:offline
npm run preview:offline
```

Open `http://127.0.0.1:4173` while online and wait for the page to say the learning material and experiment data are cached. Then disconnect and reload the same origin. Both languages and the text/experiment flow work locally; account saving, tutor requests and transcription still need their configured online services. Browser storage eviction or clearing site data can remove drafts and cached assets; use **Export current attempt** to keep a recovery copy.

## How to configure optional account and AI services

Only follow this section if you operate the service. The server binds to loopback at `127.0.0.1` and serves the built frontend and API from the same origin. Public deployment needs persistent storage, HTTPS reverse proxying, backup/restore practice, provider policy and budget decisions, and other prerequisites described in the [deployment guide (Chinese)](deployment.md).

1. Copy `.env.example` to an untracked `.env`. Set a random `BETTER_AUTH_SECRET` of at least 32 characters, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_ORIGIN`, and a persistent `DB_PATH`. For local development, the example origin is `http://localhost:3001`. Register a GitHub OAuth application whose callback is `${PUBLIC_ORIGIN}/api/auth/callback/github`. Do not add repository permissions. Never prefix server credentials with `VITE_`.

2. With tutor and transcription still disabled, explicitly migrate, build and start the local service:

   ```sh
   npm run db:migrate
   npm run build:offline
   npm run server
   ```

   Open the exact `PUBLIC_ORIGIN` in your browser. With the example settings, that is `http://localhost:3001`, not port 4173. Migration is an explicit step; ordinary server startup does not migrate the database. Back up any existing database before dependency or schema changes. For Vite development in a second terminal, its `/api` proxy targets port 3001; set `PUBLIC_ORIGIN` and the OAuth callback to the actual Vite origin instead.

3. Keep `TUTOR_ENABLED=false` and `TRANSCRIBE_ENABLED=false` unless you deliberately configure these features. For tutor calls, set `TUTOR_ENABLED=true`, `TUTOR_MODEL`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL`. Enabling the tutor can cause one potentially billable provider compatibility probe at every server start. Transcription has a separate switch and model; configure `TRANSCRIBE_ENABLED=true`, `TRANSCRIBE_MODEL`, `OPENAI_API_KEY` and `OPENAI_BASE_URL` only when ready. It does not perform a startup probe. Restart the service after changing configuration.

4. Install and maintain an FFmpeg executable for transcription, and set `FFMPEG_PATH` if it is not on `PATH`. This repository does not bundle an FFmpeg binary. Check the license and notices for the exact build you deploy.

The app uses separate actions for saving a session to an account and sending text to the tutor. Notes are excluded from tutor requests by default, but are included with an account save. A transcription is sent only after the learner explicitly requests transcription; the result enters an editable draft. Confirming it records an answer locally and does not send it to the tutor; **Send to AI** is another explicit action. Review [privacy boundaries (Chinese)](privacy.md) and your actual provider's data-retention terms before enabling these features.

## Troubleshooting

- **Native SQLite install fails:** install the build tools appropriate for your platform, then retry `npm ci` without editing the lockfile.
- **Account service exits at startup:** check `.env` values and run `npm run db:migrate` explicitly. Do not use a temporary filesystem for `DB_PATH`.
- **Tutor or transcription is unavailable:** confirm its feature switch and required server-only settings. Keep the feature disabled if you have not verified the provider/model configuration.
- **Microphone permission is unavailable:** continue with typed answers. Voice transcription is optional and browser/device permission behavior needs real-device validation.
- **Offline reload fails:** load the built preview while online and wait for the cache-ready message. Keep the same browser and origin; a different port is a different site.

## Further reading

- [Deployment guide (Chinese)](deployment.md): reverse proxy, database, migration, and release requirements
- [Privacy boundaries (Chinese)](privacy.md): local records, consent, account data, and provider boundaries
- [Contributing](../CONTRIBUTING.md): deterministic checks and safe test data
