---
source: function_safety_limits
category: safety
---

# Per-Function Safety Limits

These mirror the safety_limits defined in William's instrument function catalogue, so the assistant can explain *why* a limit exists when asking for confirmation.

- **set_timebase**: valid range is 0.001 ms to 1000 ms per division. Values outside this range are rejected by the instrument layer regardless of confirmation, since they fall outside the hardware's supported sweep range.
- **set_vertical_scale**: must keep the resulting display range within the channel's rated input limit — 400V peak / 300V RMS on the RTB24's CH1-CH4 inputs (1 MΩ impedance) — exceeding this risks damaging the input amplifier.
- **set_trigger_level**: on the RTB24, the external trigger input accepts a level from -5V to +5V. Setting a level outside the expected signal's range, or outside this hardware limit for the external trigger, will prevent triggering — the assistant should flag this as likely to fail rather than unsafe.
- General rule: any WRITE function must carry confirmed: true before the instrument layer will execute it — this confirmation gate is enforced at the function-calling layer, not just suggested by the model.

Real SCPI commands on the RTB24 (for cross-reference with William's function catalogue):
`TIMebase:SCALe`, `TIMebase:POSition`, `CHANnel<m>:SCALe`, `CHANnel<m>:COUPling`, `CHANnel<m>:STATe`, `CHANnel<m>:OFFSet`, `TRIGger:A:SOURce`, `TRIGger:A:TYPE`, `TRIGger:A:MODE`, `TRIGger:A:EDGE:SLOPe`, `TRIGger:A:LEVel<n>[:VALue]`, `PROBe<m>:SETup:ATTenuation:MANual`, `AUToscale` (Autoset), `*RST` (Preset), `*TRG` (Force Trigger), `RUN`/`STOP`/`SINGle` (acquisition control).
