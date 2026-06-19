---
source: channel_coupling
category: procedure
---

# Setting Channel Coupling (R&S RTB24)

Coupling determines whether the displayed signal includes its DC component or not.

1. Tap the channel label at the bottom of the display to open the channel's short menu (tap once to select, tap again to open the short menu if not already selected), or press the [Ch <n>] key and select "Coupling" in the full channel menu.
2. Choose:
   - "DC": the input signal passes unchanged — all components, including any DC offset, are shown. This is the typical default for the standard 1 kHz sine wave measurement workflow.
   - "AC": a highpass filter blocks the DC component so the waveform is centered on zero volts — useful when a large DC offset would otherwise push a small AC signal off-screen.
3. Important RTB24-specific safety note: if AC coupling is set, the attenuation of passive probes has **no effect** — voltage is applied to the instrument at 1:1. The user must still observe the channel's voltage limits (400V peak / 300V RMS) even though the probe's attenuation factor isn't being applied in AC mode, otherwise the instrument can be damaged.
4. SCPI remote command: `CHANnel<m>:COUPling`.
5. There is no GND coupling option on the RTB24 directly via this setting — to reference ground, use the "Ground" function in the channel menu, which connects the input to virtual ground (all channel data reads 0V) without changing the coupling setting.
