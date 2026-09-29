# DESIGN.md

理解实验室的视觉合同。CSS 必须跟这些 token 走。这是教学工作台，不是营销落地页。

## Intent

冷静的实验室纸面：墨水色、暖灰纸、一条琥珀焦点。中文正文用系统 UI，标题用衬线，让「课」和「按钮」分开。不要紫色渐变、不要 Inter 当品牌、不要大圆角卡片堆。

## Type

- Body / UI: `system-ui, "PingFang SC", "Noto Sans SC", sans-serif`
- Display (h1 only): `"Iowan Old Style", Palatino, "Songti SC", "Noto Serif SC", serif`
- Body size: 16–17px equivalent, line-height 1.55
- h1: `clamp(1.85rem, 3.4vw, 2.65rem)`, line-height 1.2, tracking `-0.02em`
- h2: 1.2rem, weight 650
- Meta / hint: 0.86rem, color `--ink-mute`

## Color

| token | value | use |
| --- | --- | --- |
| `--paper` | `#f3f1ec` | page |
| `--ink` | `#1c2328` | text |
| `--ink-mute` | `#5a6a73` | hints, sources |
| `--sea` | `#1a5368` | primary actions, current step |
| `--sea-deep` | `#123d4d` | primary hover |
| `--amber` | `#c47a1a` | focus ring only |
| `--clay` | `#8a3a24` | warnings |
| `--moss` | `#215c40` | confirmed / synced |
| `--card` | `#fffcf7` | surfaces |
| `--rule` | `#d4d0c8` | borders |

Contrast: body text on paper and `--sea` white buttons must stay WCAG AA.

## Shape

- Radius: 2px controls, 4px chips, 6px cards. No 16px+ pills.
- Space: 4 / 8 / 12 / 16 / 24 / 40
- Shadow: `0 1px 0 rgba(28,35,40,0.04), 0 8px 24px rgba(28,35,40,0.04)` on cards. No glow.

## Motion

- Default: none, except `:hover` color 120ms linear and focus ring.
- `prefers-reduced-motion: reduce` disables even that.

## Components

- Primary button: `--sea` fill, white text, 2px radius.
- Secondary: paper fill, `--sea` text, `--rule` border.
- Focus: 3px `--amber` offset 3px, never remove outline.
- Step nav: quiet chips; current step `--sea` inverted.
- Warnings: clay text, no red gradient banners.

## Anti-patterns

No Inter/Roboto as brand, no purple, no 999px pills, no hero gradient, no empty illustration blobs.
