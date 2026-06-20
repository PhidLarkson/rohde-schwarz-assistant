---
source: rtb2_measurements
category: procedure
---
Procedure: Performing Measurements on the R&S RTB2

The RTB2 supports two measurement systems: quick measurements and automatic measurements.

Quick Measurements:
- Press the Quick Meas button or use MEASurement<m>:AON to start
- Displays all standard measurements simultaneously: PEAK (Vpp), UPE (V+), LPE (V-), CYCR (RMS-Cycle), CYCM (Mean-Cycle), PER (period), FREQ (frequency), RTIM (rise time), FTIM (fall time)
- Results appear in a bar at the bottom of the display
- SCPI: MEASurement<m>:ARESult? returns all values in one query

Automatic Measurements (up to 8 simultaneous):
- Each measurement slot (1-8) can measure a different parameter
- Set the type: MEASurement<m>:MAIN <MeasType>
  Available types: FREQuency, PERiod, PEAK, UPEakvalue, LPEakvalue, AMPLitude, MEAN, RMS, HIGH, LOW, RTIMe, FTIMe, PPCount, NPCount, RECount, FECount, PDCYcle, NDCYcle, PPWidth, NPWidth, CYCMean, CYCRms, STDDev, CYCStddev, DELay, PHASe, BWIDth, POVershoot, NOVershoot
- Set the source: MEASurement<m>:SOURce CH1|CH2|CH3|CH4
- Enable: MEASurement<m>:ENABle ON
- Read result: MEASurement<m>:RESult:ACTual? [<MeasType>]
- A return value of 9.9E37 (NAN) means no valid measurement available

Important: After changing measurement parameters or channel settings, the instrument needs a setup time of about 200 ms plus the acquisition time (12 * horizontal scale + trigger period) before valid results are available. Use MEASurement<m>:TIMeout:AUTO ON to let the instrument handle this automatically.

Measurement gate:
- Limit the measurement region: MEASurement<m>:GATE ON
- Set gate mode: MEASurement<m>:GATE:MODE RELative|ABSolute
- Set gate boundaries: MEASurement<m>:GATE:ABSolute:STARt / :STOP

Statistics:
- Enable: MEASurement<m>:STATistics:ENABle ON
- Query average: MEASurement<m>:RESult:AVG?
- Query std deviation: MEASurement<m>:RESult:STDDev?
