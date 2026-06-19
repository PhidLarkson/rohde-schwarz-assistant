# Rhoda — Virtual Lab Assistant

A conversational XR Virtual Lab Assistant that guides KNUST students through **Rohde & Schwarz oscilloscope** tasks step by step. Built on Meta IWSDK for Quest Headset, phone, tablet, and PC.

## What It Does

- **Conversational guidance** — ask Rhoda how to measure a signal, set a timebase, or use a probe and she walks you through it
- **Safety-gated instrument control** — every state-changing oscilloscope command requires explicit user confirmation before execution
- **AI-powered troubleshooting** — describe a bad trace and Rhoda diagnoses probable faults with fix steps
- **AR component identification** — point a device camera at a port or knob and ask "what is this?"
- **Personalized onboarding** — session logs feed a competency model that adapts what Rhoda teaches next

## Architecture (4 Cores)

| # | Component | Owner | Role |
|---|-----------|-------|------|
| 1 | **Stream I/O** | Afari | Mic/camera capture, STT/TTS, avatar lip-sync |
| 2 | **RAG / Context** | Gregory | Procedure docs, safety rules, fault patterns → context injection |
| 3 | **Instrument API** | William | Oscilloscope function calls (SCPI), confirmation gating, simulator mode |
| 4 | **Vision / Anomaly / Logging / Progress** | Prince | Component ID, trace diagnosis, session log, competency tracking |

All cores communicate through fixed JSON contracts (see spec doc for schemas).

## Tech Stack

- **Three.js + WebXR** — 3D rendering and immersive AR
- **Meta IWSDK** — interaction framework (grab, panels, hand tracking)
- **Google Gemini** — reasoning, generation, and vision (component ID)
- **GhanaNLP API** — Twi/English speech recognition (ASR) and synthesis (TTS)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd rhode-schwarz-xr-app
npm install

# 2. Configure API keys
cp .env.example .env
# Edit .env with your GhanaNLP and Gemini API keys

# 3. Run dev server
npm run dev
```

Open https://localhost:3000 — accept the self-signed cert. On Quest, open in Meta Quest Browser.

## Controls (XR Dashboard)

| Button | Action |
|--------|--------|
| **Mute / Unmute** | Toggle continuous listening |
| **Summon** | Bring Rhoda in front of you |
| **Autofollow** | Rhoda follows as you move |
| **Reset** | Clear conversation and restart session |

Press **M** on keyboard to show/hide the dashboard. In XR, left-hand select toggles it.

## Demo Script

1. Rhoda greets the student, reads oscilloscope state (READ call, no confirmation)
2. Student asks to measure a 1 kHz sine wave — Rhoda walks through steps, asks confirmation before changing settings (WRITE call)
3. Student points camera at a port — vision module identifies it with a safety note
4. Student is shown a bad trace — Rhoda diagnoses the fault and suggests remediation
5. Session summary: topic competency scores and recommended next exercise

## Project Structure

```
src/
  index.ts            — World setup, XR init, input wiring
  rhode_schwarz.ts    — Rhoda assistant: animations, voice pipeline, lip sync
  genai.ts            — Gemini + GhanaNLP API integration
  dashboard.ts        — Dashboard panel system (buttons, status)
  interactions.ts     — Interaction registry (triggers, effects)
  handRay.ts          — Hand pointer rays for XR selection
  audioRecorder.ts    — Mic capture
  audioFeedback.ts    — UI sound effects
ui/
  dashboard.uikitml   — Dashboard panel layout
public/
  gltf/               — 3D model + animation files
```

## Environment Variables

```
VITE_GHANANLP_API_KEY=   # from https://ghananlp.org
VITE_GEMINI_API_KEY=     # from https://aistudio.google.com
```

## Safety Rules

- No WRITE instrument command executes without `confirmed: true` from the user
- Default to simulator mode — real hardware only for final rehearsed demo
- Vision and anomaly modules surface safety warnings, never silently proceed
- Logging stores session IDs only, no PII

## License

[MIT](LICENSE)
