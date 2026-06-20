---
source: set_timebase
category: procedure
---

# Setting the Timebase (R&S RTB24)

The Time Scale (timebase) sets the horizontal scale in time/division, applying to all active waveforms.

1. Estimate the signal period (1 / frequency). For a 1 kHz signal, period = 1 ms.
2. Choose a timebase so 2-5 full cycles fit on screen — for a 1 kHz signal, around 100-200 us/div works well.
3. Turn the [Scale] knob in the Horizontal control block (clockwise stretches the waveform — the time/div value decreases), or press the [Horizontal] key to open the full menu and enter "Time Scale" directly.
4. Pressing the [Scale] knob toggles between coarse and fine adjustment.
5. This is a state-changing (WRITE) action — the assistant must ask the user to confirm the new timebase value before applying it.
6. SCPI remote command: `TIMebase:SCALe` (valid range per hardware: roughly 0.001 ms to 1000 ms per division — values outside this are rejected regardless of confirmation). Related: `TIMebase:POSition` sets the trigger offset from the reference point.
7. At slow timebases (>= 50 ms/div), the instrument automatically switches to a "slow mode" similar to roll mode.
8. After setting, verify the waveform shows a stable number of cycles; if the trace appears to roll or flicker, the trigger setting (not the timebase) is usually the cause.
