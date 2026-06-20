---
source: rtb2_remote_control
category: procedure
---
Procedure: Remote Control of the R&S RTB2 Oscilloscope

The RTB2 can be controlled remotely via USB TMC, LAN (TCPIP), or GPIB using SCPI commands.

Connection setup:
1. Connect via USB: plug the USB cable into the rear panel USB device port
2. Install the VISA driver (R&S VISA or NI-VISA) or use pyvisa-py (pure Python)
3. Install RsInstrument: pip install RsInstrument pyvisa-py

Python connection example:
```python
from RsInstrument import RsInstrument
instr = RsInstrument('USB::0x0AAD::0x01D6::102345::INSTR')
print(instr.idn_string)  # Rohde&Schwarz,RTB2004,...
```

Key SCPI commands for the RTB2:
- *IDN? — instrument identification
- *RST — reset to defaults
- AUToscale — automatic waveform setup
- RUN / STOP — start/stop acquisition
- ACQuire:STATe? — query acquisition state (RUN|STOPping|COMPlete|BREak)
- CHANnel<m>:STATe ON|OFF — enable/disable channel (m = 1..4)
- CHANnel<m>:SCALe <value> — vertical scale in V/div (range: 1e-3 to 10)
- CHANnel<m>:COUPling DCLimit|ACLimit|GND — input coupling
- TIMebase:SCALe <value> — horizontal scale in s/div (range: 1e-9 to 50)
- TRIGger:A:SOURce CH1|CH2|CH3|CH4 — trigger source
- TRIGger:A:LEVel1:VALue <value> — trigger level in volts
- TRIGger:A:EDGE:SLOPe POSitive|NEGative|EITHer — trigger slope
- TRIGger:A:MODE AUTO|NORMal — trigger mode
- MEASurement<m>:MAIN FREQuency|PEAK|RMS|MEAN — measurement type
- MEASurement<m>:ENABle ON — activate measurement
- MEASurement<m>:RESult:ACTual? — read measurement result

A result of 9.9E37 from a measurement query means no valid signal is present.
