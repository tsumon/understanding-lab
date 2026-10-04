<h1 align="center">Understanding Lab</h1>

<p align="center"><strong>Explain it. Test it. Understand it.</strong></p>
<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="https://github.com/tsumon/understanding-lab/actions/workflows/ci.yml?query=branch%3Acodex%2Funderstanding-lab-mvp"><img alt="CI" src="https://github.com/tsumon/understanding-lab/actions/workflows/ci.yml/badge.svg?branch=codex/understanding-lab-mvp"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

Understanding Lab is a local-first learning app for checking whether you understand an AI concept, starting with overfitting. Explain the idea in your own words, make a prediction, explore a reproducible experiment, then explain again and try a transfer question. The app runs in a browser and saves an anonymous attempt on that browser by default.

## See the app

<p align="center"><a href="assets/readme/desktop-en.png"><img src="assets/readme/desktop-en.png" alt="Understanding Lab, English desktop view" width="720"></a></p>

<p align="center">
  <a href="assets/readme/mobile-en.png"><img src="assets/readme/mobile-en.png" alt="Understanding Lab, English mobile view" width="195"></a>
  &nbsp;&nbsp;
  <a href="assets/readme/desktop-zh-CN.png"><img src="assets/readme/desktop-zh-CN.png" alt="理解实验室，简体中文桌面界面" width="360"></a>
</p>

Images show synthetic examples in the local app. They are not model-generated teaching feedback.

## What you can do

- **Learn locally:** keep drafts and notes in your browser; cache the built app for offline use.
- **Switch languages:** use English or 简体中文 without rewriting your answers, notes, experiments, or historical feedback. Your preference stays in this browser.
- **Test an explanation:** compare curves and training/validation error across 324 precomputed configurations, then freeze a choice before revealing test error.
- **Stay in control:** export your attempt locally; opt into account saving, tutor feedback, or voice transcription separately when services are configured.

## How a lesson works

**Explain → predict → experiment → re-explain → transfer → reflect.** You can skip prompts and return to earlier answers. In the overfitting experiment, choose a model before revealing held-out test error. Changing the setup after reveal marks the test result as contaminated. The experiment catalog contains 324 reproducible configurations; its numeric outcomes are generated data, not a claim about every real dataset.

Learning works without an account or AI provider. Sending an answer to the optional tutor and saving an attempt to an account are separate actions with separate consent. Voice transcription is optional too: recording does not send audio until you explicitly request transcription. Tutor and transcription are disabled by default. Enabling the tutor can make a potentially billable provider probe at every server start. Configuration steps are in the [getting started guide](docs/getting-started.md).

## Run locally

Requires Node.js 22.12 or newer and npm. Node 22.23.2 / npm 10.9.8 were used for the verified setup. `better-sqlite3` includes a native module; on platforms without a matching prebuilt binary, installation may require local build tools.

```sh
git clone --branch codex/understanding-lab-mvp https://github.com/tsumon/understanding-lab.git
cd understanding-lab
npm ci
npm run dev
```

Open the local URL printed by Vite. No `.env`, account, model key, or server is needed for the anonymous text lesson. For offline use and optional account, tutor, and transcription services, follow [Getting started](docs/getting-started.md). The deeper [deployment guide](docs/deployment.md) is in Chinese.

## Project checks

```sh
npm run typecheck
npm test
npm run experiment:test
npm run build:offline
```

The experiment checks also require `uv` and Python 3.12.13; see [Contributing](CONTRIBUTING.md) for setup and browser checks. CI uses deterministic fixtures, not paid model calls.

## Current scope

One overfitting lesson, delivered as a responsive web app; no hosted service or native app package. Real-model teaching quality, human review (including the English translation), real OAuth, and physical-device voice acceptance are still pending. An intermittent WebKit draft/summary regression remains open. Engineering checks are not proof of learning outcomes.

## Documentation

- [Getting started](docs/getting-started.md): local setup and optional services
- [Contributing](CONTRIBUTING.md): changes, checks, and data handling
- [Deployment](docs/deployment.md) and [privacy boundaries](docs/privacy.md) (Chinese)
- [License](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

## License

Original project source and documentation are offered under the [MIT License](LICENSE), subject to the separate terms of dependencies and other materials described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
