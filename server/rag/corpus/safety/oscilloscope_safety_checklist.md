---
source: oscilloscope_safety_checklist
category: safety
---

# Oscilloscope Safety Checklist (R&S RTB24)

1. Always confirm the probe's attenuation setting (1x/10x) on the probe itself matches the channel setting on the scope before connecting — a mismatch causes incorrect voltage readings, not damage, but should still be flagged to the user.
2. The RTB24's channel (CH1-CH4) and external trigger inputs are rated for a maximum of 400V peak / 300V RMS, with 1 MΩ input impedance. Never exceed this on any channel input, regardless of probe attenuation.
3. The RTB24 is not rated for any measurement category (CAT) — it is designed only for circuits that are not directly connected to mains, or only indirectly connected to mains through other equipment. It must not be used for direct measurements on mains-powered or building-wiring circuits.
4. Voltages above 30V RMS, 42V peak, or 60V DC are considered hazardous contact voltages. Measurements at or above this level require an electrically skilled user and extra precautions (no touching exposed connections while powered, switching off the circuit under test when connecting/disconnecting probes).
5. Always connect the ground clip to a known ground reference before connecting the probe tip to the circuit under test, to avoid ground loops, floating measurements, and electric shock risk.
6. When probing high-voltage or high-common-mode circuits, use an appropriately isolated/differential probe rather than a standard ground-referenced passive probe.
7. Before any WRITE-category instrument command (changing timebase, trigger, scale, or any setting that alters instrument state), the assistant must explicitly ask the user to confirm before applying the change.
8. If a measurement looks unsafe (overvoltage indication, smoke, unusual heat from the instrument or probe), instruct the user to disconnect power immediately and not continue the measurement.
