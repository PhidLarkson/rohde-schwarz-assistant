# Lab Assistant

This folder is the standalone working area for William's oscilloscope integration work.

## Contents

- `oscilloscope-wrapper-spec.md` - the current RTB24 wrapper spec and function catalog.
- `src/lab_assistant/` - the Python wrapper skeleton.
- `requirements.txt` - the Python dependency list for the real-hardware path.

## What to use first

Start with `oscilloscope-wrapper-spec.md`, then open `src/lab_assistant/scope_client.py`.

The wrapper uses a mock backend by default so the rest of the team can integrate without the scope connected. If real hardware is available, the code can switch to `RsInstrument`.
# Lab Assistant Wrapper

This package is the first Python pass for William's instrument core.

It provides:

- `read_state`
- `set_parameter`
- `run_measurement`

It is built around a confirmation gate and a mock backend so the rest of the hackathon team can integrate without physical hardware.

The preferred transport for real hardware is `RsInstrument` if it is available in the environment.
