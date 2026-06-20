---
source: measure_1khz_sine_wave
category: procedure
---

# Measuring a 1 kHz Sine Wave (R&S RTB24)

1. Connect the probe to Channel 1 (CH1) BNC input, then to the signal source (probe first to the instrument, then to the device under test). Tap the CH1 label at the bottom of the display, tap "Probe", and confirm the attenuation factor matches what's printed on the probe (default delivered probes and instrument default are both 10:1, so if you're using the stock probe and haven't changed anything, no adjustment is needed).
2. Press the [Autoset] key. Autoset analyzes the active channel signal and automatically adjusts vertical scale/offset/position, horizontal timebase, and trigger settings (mode, type, source, coupling) to display a stable waveform in one step. This is the fastest path to a usable trace for a standard signal like this.
3. If manual adjustment is needed instead of/after Autoset:
   - Vertical scale: turn the channel's [Scale] knob (Vertical block) so the waveform fills most of the screen height without clipping — start around 500 mV/div for a typical 1-3 Vpp signal.
   - Timebase: turn the [Scale] knob (Horizontal block) to around 200 us/div so a few full cycles of a 1 kHz signal (1 ms period) are visible.
4. Confirm trigger source is CH1, type is Edge, and the level sits near the signal's midpoint — press the [Levels] knob to snap the trigger level to 50% of the signal amplitude automatically.
5. Read the measured frequency and amplitude from the scope's automatic measurement readout, or use cursors to measure period and peak-to-peak voltage manually.
6. Verify: period should read ~1 ms (1 kHz), and the trace should be a smooth, unclipped sine shape with no orange clipping-indicator arrows on the channel label.
