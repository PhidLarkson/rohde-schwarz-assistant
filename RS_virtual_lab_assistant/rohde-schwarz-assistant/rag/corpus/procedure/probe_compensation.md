---
source: probe_compensation
category: procedure
---

# Probe Compensation (R&S RTB24)

Probe compensation matches the probe cable capacitance to the oscilloscope input capacitance, ensuring accurate amplitude from DC to the upper bandwidth limit. A poorly compensated probe distorts waveforms and causes measurement errors. Compensate a passive probe the first time you connect it to the instrument.

1. Connect the probe to the channel input you intend to use (CH1-CH4 on the RTB24).
2. Connect the probe tip and ground clip to the two compensation pins on the front panel (near the Pattern Generator connectors): the left pin is ground level, the next pin supplies the compensation square-wave signal.
3. Press the [Apps Selection] key, then tap "Probe Adjust".
4. Follow the on-screen wizard — it guides you step by step through the compensation process and tells you when the probe is correctly adjusted.
5. Use the compensation trimmer on the probe itself (per the probe's own documentation) to reach the optimum square-wave response as instructed by the wizard.
6. Compensation is probe-specific, not channel-specific — repeat for every probe you use, especially if you swap probes between channels.

Note: this is a guided wizard procedure on the RTB24, not a manual eyeball-and-adjust process — the instrument tells you when compensation is correct rather than relying on the user judging the waveform shape alone.
