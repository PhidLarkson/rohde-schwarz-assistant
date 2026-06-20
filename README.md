# Rhoda — Virtual Lab Assistant

**Track 2: Virtual Lab Assistant (Conversational / Voice)**
Rohde & Schwarz AI-Assisted Onboarding Hackathon | KNUST 2026

A conversational AI lab assistant that guides students through Rohde & Schwarz oscilloscope procedures step by step — via voice in XR or text chat in a browser.

---

## Deliverables

| Requirement | Status |
|---|---|
| Live demo: 2 guided workflows (simple + safety-critical) | "Measure 1 kHz Sine" + "Overvoltage Safety" workflows |
| Voice and/or chat interaction | Voice (XR avatar) + text chat (`/chat.html`) |
| Instrument configuration after confirmation | Safety-gated WRITE commands with explicit user approval |
| Conversation transcripts | Export via chat UI or `/api/session/transcript` |
| Instructor view of logs and failure points | `/instructor.html` dashboard |
| README on connecting to instruments or simulator | This document (see below) |

---

## What It Does

- **Conversational guidance** — ask Rhoda how to measure a signal, set a timebase, or use a probe and she walks you through it step by step
- **Two demo workflows** — structured "Measure a 1 kHz Sine Wave" and "Handle Overvoltage" walkthroughs with step tracking
- **Safety-gated instrument control** — every state-changing oscilloscope command requires explicit user confirmation
- **AI-powered troubleshooting** — describe a bad trace and Rhoda diagnoses probable faults with fix steps
- **AR component identification** — point a device camera at a port or knob and ask "what is this?"
- **Personalized progress tracking** — session logs feed a competency model that adapts what Rhoda teaches next
- **Instructor dashboard** — view session transcripts, competency scores, and common failure points

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  FRONTEND (Vite + TypeScript)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ XR Avatar│  │ Chat UI  │  │ Instructor View  │   │
│  │ index.ts │  │ chat.ts  │  │ instructor.html  │   │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘   │
│       │              │                                │
│  ┌────┴──────────────┴─────────────────────────────┐ │
│  │  genai.ts  │ rag.ts │ instrument.ts │ session.ts│ │
│  │  vision.ts │ anomaly.ts │ progress.ts│workflows │ │
│  └────┬──────────────┬─────────────────────────────┘ │
└───────┼──────────────┼───────────────────────────────┘
        │              │
┌───────┼──────────────┼───────────────────────────────┐
│  BACKEND (Flask)     │                                │
│  ┌────┴─────┐  ┌─────┴────┐  ┌──────────────────┐   │
│  │ RAG      │  │Instrument│  │ Session Logging   │   │
│  │ Retrieval│  │ API      │  │ + Progress        │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                     │                                 │
│              ┌──────┴──────┐                          │
│              │ Mock / Real │                          │
│              │ R&S RTB24   │                          │
│              └─────────────┘                          │
└───────────────────────────────────────────────────────┘
```

| Component | Owner | Role |
|---|---|---|
| **Stream I/O** | Afari | Mic/camera capture, STT/TTS, avatar lip-sync |
| **RAG / Context** | Gregory | Procedure docs, safety rules, fault patterns |
| **Instrument API** | William | Oscilloscope function calls (SCPI), confirmation gating |
| **Vision / Anomaly / Logging / Progress** | Prince | Component ID, trace diagnosis, session log, competency tracking |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- Python >= 3.10
- API keys: Gemini (Google AI Studio) and GhanaNLP

### 1. Install dependencies

```bash
git clone <repo-url>
cd rhoda-xr-app
npm install
pip install -r server/requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run

```bash
# Option A: Start everything with one command
./start.sh

# Option B: Run separately
python server/app.py &        # Backend on port 5001
npx vite                      # Frontend on port 8081
```

### 4. Access

| URL | Description |
|---|---|
| `https://localhost:8081` | XR Avatar (main app) |
| `https://localhost:8081/chat.html` | Text Chat Interface |
| `https://localhost:8081/instructor.html` | Instructor Dashboard |
| `http://localhost:5001/api/health` | Backend Health Check |

---

## Connecting to an R&S Oscilloscope

### Simulator Mode (default)

No hardware needed. The backend runs a mock oscilloscope that responds to all commands with simulated values. This is the default when `SCOPE_RESOURCE` is not set.

### Real Hardware (RTB24 via USB)

1. Connect the RTB24 to your computer via USB
2. Install the R&S VISA driver from the Rohde & Schwarz website
3. Install the Python driver: `pip install RsInstrument`
4. Set the environment variable:

```bash
# Auto-discover the first USB instrument
export SCOPE_RESOURCE=USB

# Or specify the VISA resource string directly
export SCOPE_RESOURCE="USB0::0x0AAD::0x01D6::102345::INSTR"
```

5. Start the backend:

```bash
python server/app.py
```

The backend will print the detected instrument ID on startup.

### Real Hardware (via LAN)

```bash
export SCOPE_RESOURCE="TCPIP::192.168.1.100::INSTR"
python server/app.py
```

### Discovering Instruments

```bash
# List all visible VISA resources
curl http://localhost:5001/api/instrument/discover
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Yes | Google Gemini API key from [AI Studio](https://aistudio.google.com) |
| `VITE_GHANANLP_API_KEY` | Yes | GhanaNLP API key from [ghananlp.org](https://ghananlp.org) |
| `SCOPE_RESOURCE` | No | VISA resource string for real oscilloscope (`USB`, `auto`, or full VISA address). Omit for simulator mode. |
| `PORT` | No | Backend port (default: 5001) |

---

## Demo Script

### Workflow 1: Measure a 1 kHz Sine Wave (Simple)

1. Open `/chat.html` and click "Measure 1 kHz Sine" in the sidebar
2. Rhoda walks through 10 steps: connect probe, set attenuation, enable CH1, set vertical scale, set timebase, configure trigger, adjust trigger level, verify waveform, read measurements, review
3. At each instrument-changing step, a confirmation prompt appears — approve or deny
4. The oscilloscope state panel updates in real time
5. Export the transcript when done

### Workflow 2: Handle Overvoltage Warning (Safety-Critical)

1. Click "Overvoltage Safety" in the sidebar
2. Rhoda walks through 6 safety steps: disconnect probe immediately, check voltage with multimeter, verify limits, select correct probe, set max V/div range, reconnect carefully
3. Safety warnings are highlighted at each step
4. Safety-critical steps require explicit confirmation

### Free Conversation

- Type "How do I measure a 1 kHz sine wave?" for a natural language response
- Type "My waveform is clipped" for troubleshooting diagnosis
- Type "set timebase to 500us/div" to trigger an instrument command with confirmation

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Backend status (instrument mode, RAG docs, session count) |
| GET | `/api/instrument/state` | Read oscilloscope state |
| POST | `/api/instrument/set` | Set instrument parameter (requires confirmation) |
| POST | `/api/instrument/measure` | Run a measurement |
| POST | `/api/instrument/confirm` | Confirm a pending write operation |
| GET | `/api/instrument/discover` | List available VISA instruments |
| POST | `/api/rag/retrieve` | Retrieve RAG context chunks |
| POST | `/api/session/log` | Log a session event |
| GET | `/api/session/logs` | Get all session logs |
| GET | `/api/session/transcript` | Export transcript as text file |
| GET | `/api/session/progress` | Get competency progress scores |
| GET | `/api/session/failure-points` | Get common failure points (instructor) |

---

## XR Controls

| Action | Effect |
|---|---|
| **Point at dashboard** | Visible beam ray, green highlight on hover |
| **Pinch/Select on dashboard button** | Activates the button |
| **Start Mic / Stop Mic** | Toggle continuous voice listening |
| **Summon** | Bring Rhoda in front of you |
| **Autofollow** | Rhoda follows as you move |
| **Identify** | Capture camera frame and identify oscilloscope component |
| **Reset** | Clear conversation and restart session |
| **Keyboard M** | Toggle dashboard visibility |

---

## Project Structure

```
src/
  index.ts            — XR world setup, input wiring
  rhode_schwarz.ts    — Rhoda avatar: animations, voice pipeline, lip sync
  genai.ts            — Gemini + GhanaNLP API integration
  chat.ts             — Text chat interface entry point
  dashboard.ts        — XR dashboard panel system
  rag.ts              — Embedded RAG retrieval (keyword-based)
  instrument.ts       — Client-side instrument simulator + Flask bridge
  session.ts          — Session logging (localStorage + server sync)
  progress.ts         — Competency tracking and curriculum ordering
  anomaly.ts          — Fault pattern detection + Gemini fallback
  vision.ts           — Camera-based component identification
  workflows.ts        — Structured demo workflow definitions
  handRay.ts          — XR hand pointer rays for selection
  audioRecorder.ts    — Microphone capture
  audioFeedback.ts    — UI sound effects
server/
  app.py              — Flask backend (unified API)
  instrument/         — Oscilloscope control (mock + RsInstrument)
  rag/                — Sentence-transformer RAG with corpus
chat.html             — Standalone chat interface
instructor.html       — Instructor dashboard
```

---

## Safety Rules

- No WRITE instrument command executes without `confirmed: true` from the user
- Default to simulator mode — real hardware only when `SCOPE_RESOURCE` is set
- Vision and anomaly modules surface safety warnings, never silently proceed
- Overvoltage detection triggers immediate disconnect guidance
- Logging stores session IDs only, no PII

---

## Tech Stack

- **Three.js + WebXR + Meta IWSDK** — 3D rendering and immersive AR
- **Google Gemini 2.5 Flash** — reasoning, generation, vision, STT, TTS
- **GhanaNLP API** — Twi speech recognition and synthesis
- **Flask + sentence-transformers** — backend RAG retrieval
- **RsInstrument** — R&S oscilloscope control via VISA/SCPI

---

## License

[MIT](LICENSE)
