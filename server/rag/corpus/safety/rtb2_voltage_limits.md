---
source: rtb2_voltage_limits
category: safety
---
Safety: R&S RTB2 Voltage Limits and Hazardous Voltages

From the R&S RTB 2 Getting Started Manual, Section 1.1:

Hazardous voltage thresholds:
- Voltages higher than 30 V RMS, or 42 V peak, or 60 V DC are regarded as hazardous contact voltages
- Only electrically skilled persons should measure hazardous voltages
- Do not touch exposed connections and components when power is applied
- Switch off the test circuit while connecting and disconnecting probe leads

Maximum input voltage on channel inputs (CH1-CH4):
- The maximum input voltage must not exceed the value specified in the specifications document
- With standard 10:1 passive probe (RT-ZP10): max 300 V CAT II at probe tip
- With 1:1 probe setting: max input is limited by the oscilloscope channel (typically 200 V peak)
- The rated voltage depends on the frequency — check the voltage limitation curves in the specifications

Probe safety rules:
- Use only probes and accessories that comply with the measurement category (CAT) of your task
- Set the correct attenuation factor on the instrument to match the probe — otherwise measurement results will not reflect the actual voltage level and you might misjudge the actual risk
- Never cause short circuits when measuring sources with high output currents
- Probe pins are extremely pointed and can penetrate clothes and skin — handle with great care
- Set up all probe connections to the instrument before applying power to the circuit under test
- When working with high voltages and current probes, observe additional operating conditions in the safety instructions
- Prevent mechanical shock to the probe — avoid excessive strain or sharp bends on the probe cable

Grounding:
- The oscilloscope ground (probe ground clip) is connected to earth ground through the power cord
- The ground clip must connect to the circuit's ground reference point
- NEVER connect the ground clip to a point with voltage relative to earth ground — this creates a short circuit through the oscilloscope's ground path
- For differential measurements (between two non-ground points), use a differential probe or the Math subtraction function (CH1 - CH2)
