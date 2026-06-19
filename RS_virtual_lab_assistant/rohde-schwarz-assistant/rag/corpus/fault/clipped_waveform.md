---
source: clipped_waveform
category: fault
---

# Fault: Clipped or Flat-Topped Waveform

**Symptom**: The top and/or bottom of the waveform appears flat-topped or cut off instead of following the signal's natural shape (e.g. a sine wave with flattened peaks).

**Probable cause**: The input signal's amplitude exceeds the scope's current vertical range (overdriven input), or the vertical scale (volts/div) is set too low for the signal amplitude.

**Fix steps**:
1. Increase the vertical scale (volts/div) so the full signal amplitude fits within the display.
2. If the signal genuinely exceeds the probe/channel's rated input range, reduce the signal amplitude at the source, or switch to a probe with higher attenuation (e.g. 10x instead of 1x).
3. Re-check the waveform after adjustment — it should show smooth, rounded peaks with no flattening.

**Unsafe flag**: Only raise as unsafe if the input voltage approaches or exceeds the channel's rated maximum input voltage — otherwise this is a measurement-setup issue, not a hazard.
