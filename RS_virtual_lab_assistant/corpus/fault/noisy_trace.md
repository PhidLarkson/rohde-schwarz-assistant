---
source: noisy_trace
category: fault
---

# Fault: Noisy or Jittery Trace

**Symptom**: The waveform shows excessive random noise riding on the signal, or the trace appears jittery/unstable from sweep to sweep even though the underlying signal should be clean.

**Probable cause**: Most commonly a bad or missing ground connection (ground clip not attached, or attached far from the signal source creating a ground loop), but can also be caused by a long unshielded probe lead picking up interference, or an incorrect trigger source/level causing the sweep to restart at inconsistent points.

**Fix steps**:
1. Verify the probe's ground clip is securely connected to a true ground reference point close to the signal source.
2. Shorten the ground lead if possible, or use a probe with a shorter ground spring tip for high-frequency signals.
3. Check the trigger source and level — an unstable trigger can look like noise even when the underlying signal is clean; re-confirm trigger settings per the trigger setup procedure.
4. If noise persists, check for nearby interference sources (switching power supplies, motors) and move the probe leads away from them.

**Unsafe flag**: false under normal circumstances — this is a signal-quality issue, not a hazard.
