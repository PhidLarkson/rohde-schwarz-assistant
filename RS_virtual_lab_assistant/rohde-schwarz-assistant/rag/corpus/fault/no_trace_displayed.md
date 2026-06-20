---
source: no_trace_displayed
category: fault
---

# Fault: No Trace Displayed

**Symptom**: The screen shows no waveform at all — just a flat line or blank display.

**Probable cause**: The channel is turned off, the trigger is set to Normal mode with no valid trigger condition being met (so the scope never sweeps), the probe is disconnected or faulty, or the vertical scale/offset has pushed the trace off the visible display area.

**Fix steps**:
1. Confirm the channel is enabled (channel "on" indicator/button).
2. Switch the trigger mode to Auto temporarily to force a free-run sweep and confirm a signal is present at all.
3. Check probe connections at both the scope and the signal source end.
4. Check the vertical offset/position setting — the trace may be present but scrolled off-screen.
5. Once a signal is visible in Auto trigger mode, re-set the trigger level within the signal's range and switch back to Normal mode if a stable trigger is desired.

**Unsafe flag**: false — this is a setup/configuration issue, not a hazard.
