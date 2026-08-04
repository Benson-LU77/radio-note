# 夜雨 FM · Radio Note

A late-night ambient radio you can write in.

Turn the knob, tune across five living scenes — rain on a night bus window, a warm room, a wind-swept forest, a campfire, a moonlit coast — and jot notes straight into your Obsidian vault while the rain keeps falling.

## Features

- **Radio-style interaction** — power on with a knob, switch scenes by tuning (drag the dial, swipe the scene, scroll, or use ←/→). Static noise and defocus between stations.
- **Five procedural scenes** — every visual is CSS/SVG drawn from scratch. No images, no copyright worries.
- **Natural generative audio** — Web Audio synthesis with slow LFO swells and randomized one-shot events: raindrop plips, distant birdsong, fire crackles, wave washes. No loops, no samples.
- **Obsidian notes** — connects to the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin. Browse, edit (autosave) and create notes; each new note is stamped with the time and the channel you were listening to.
- **Sleep timer, mixer, fullscreen** — master / main / ambience / bass sliders, 30/60-minute auto-stop.

## Channels

| Freq | Channel | Sound |
|------|---------|-------|
| 88.7 | LAST TRAIN | rain on glass, cabin hum |
| 92.1 | STAY HOME | soft rain, warm room tone |
| 95.3 | DEEP FOREST | wind, leaves, distant birds |
| 98.4 | CAMPFIRE | crackling fire, warm night |
| 101.6 | MOONLIT COAST | slow swells, light drizzle |

## Run it

```bash
npm install
npm run dev        # http://localhost:8080
```

### Obsidian setup (optional, for notes)

1. Install the **Local REST API** community plugin in Obsidian
2. Enable its **Non-encrypted (HTTP) Server** (port 27123)
3. In the app press `N`, paste the API key, connect

## Keys

`Enter` power on · `←/→` tune · `Space` play/pause · `N` notes · `Esc` close panels

---

Built with Next.js (vinext) + React. All scenes and sounds are generated in the browser.
