---
source: set_trigger
category: procedure
---

# Setting the Trigger (R&S RTB24)

The trigger determines when the scope starts/stabilizes a waveform sweep. The default and most common type is Edge trigger.

1. Press the [Trigger] key (in the Trigger control block) to open the Trigger menu, or use [Source] to cycle directly through analog trigger sources.
2. Choose a trigger source: an analog channel (C1-C4), a digital channel (D0-D15), the external trigger input ("Extern", front panel, range -5V to +5V), or a serial bus (if a protocol option is installed).
3. Choose "Trigger Type" = "Edge" for most periodic signals. Other types (Width, Video, Pattern, Runt, Risetime, Timeout, Line, Serial Bus) exist for specialized signals.
4. Set the "Slope": rising edge, falling edge, or both.
5. Set the trigger level using the [Levels] knob (turn to adjust; press the knob to snap to 50% of the signal amplitude automatically), or drag the trigger level marker directly on screen.
6. Set the trigger mode with [Auto Norm]:
   - "Auto": the scope free-runs and displays a waveform even if no trigger condition is met — useful while setting up, since you can see the signal before triggering is configured.
   - "Norm": the scope only updates the display when an actual trigger occurs — switch to this once a stable trigger is confirmed, so the display doesn't show stale/non-triggered data.
7. If the trace looks unstable or rolling, the trigger level is likely set outside the signal's range, or the source is set to the wrong channel. Use [Force Trigger] to force a single acquisition and confirm a signal is present at all.
8. SCPI remote commands: `TRIGger:A:SOURce`, `TRIGger:A:TYPE`, `TRIGger:A:MODE`, `TRIGger:A:EDGE:SLOPe`, `TRIGger:A:LEVel<n>[:VALue]`.
