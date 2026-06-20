---
source: rtb2_trigger_setup
category: procedure
---
Procedure: Trigger Setup on the R&S RTB2

The RTB2 supports several trigger types: Edge, Width, Video/TV, Pattern, Runt, Rise Time, and Timeout.

Edge Trigger (most common):
1. Set trigger type: TRIGger:A:TYPE EDGE
2. Set source: TRIGger:A:SOURce CH1 (options: CH1|CH2|CH3|CH4|EXTernanalog|LINE)
3. Set slope: TRIGger:A:EDGE:SLOPe POSitive (options: POSitive|NEGative|EITHer)
4. Set level: TRIGger:A:LEVel1:VALue 0.5 (in volts, depends on vertical scale)
5. Set mode: TRIGger:A:MODE AUTO (options: AUTO|NORMal)
   - AUTO: instrument triggers repeatedly even without valid trigger event — always shows trace
   - NORMal: instrument only acquires when trigger conditions are met — clean display for periodic signals
6. Auto-find level: TRIGger:A:FINDlevel (sets trigger level to 50% of signal amplitude)

Trigger coupling: TRIGger:A:EDGE:COUPling DC|AC|LFReject
- DC: direct coupling, trigger signal unchanged
- AC: removes DC offset from trigger signal
- LFReject: 15 kHz highpass filter, use for high-frequency signals only

Noise rejection filters:
- TRIGger:A:EDGE:FILTer:HFReject ON — 5 kHz lowpass filter
- TRIGger:A:EDGE:FILTer:NREJect ON — 100 MHz lowpass filter

Holdoff (prevents re-triggering too quickly):
- TRIGger:A:HOLDoff:MODE TIME|OFF
- TRIGger:A:HOLDoff:TIME <seconds>

Common issues:
- Waveform rolling/drifting: trigger level is outside signal amplitude — use TRIGger:A:FINDlevel
- No trace displayed: check TRIGger:A:MODE is AUTO (NORMal requires matching signal)
- Wrong trigger source selected: verify TRIGger:A:SOURce matches the channel with signal

Force trigger: *TRG (generates an immediate trigger event)
