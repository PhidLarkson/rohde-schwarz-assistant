# RTB24 Oscilloscope Wrapper Spec

Source team document: [Lab_Assistant_Build_Spec (1).docx](../Lab_Assistant_Build_Spec%20(1).docx)

## What the workspace contains

The RTB24 folder is not source code. It contains manuals, brochures, firmware images, and a vendor driver package that already exposes a C API and LabVIEW examples.

Most relevant inputs for this work:

- [RTB2 user manual](../Manuals/RTB2_UserManual_en_02.pdf) for remote operation, SCPI device control, remote control commands, and measurement behavior.
- [RTB2 getting started](../Manuals/RTB2_GettingStarted_en_01.pdf) for safety and basic setup context.
- [RTB2 release notes](../Firmware/RTB2_Release_Notes_03.000.pdf) for firmware version context.
- [RTB24 CVI driver](../Drivers/rsrtx-cvi-2.4.0.zip) and [LabVIEW examples](../Drivers/rsrtx_lv2015_examples.zip) for the concrete vendor API surface.

## Key finding

The vendor driver already provides the main building blocks for the wrapper:

- State and configuration access through `rsrtx_GetAttribute*` and `rsrtx_SetAttribute*`.
- Acquisition control through `rsrtx_ConfigureAcquisitionState`, `rsrtx_InitiateAcquisition`, `rsrtx_InitiateAcquisitionAndWait`, and `rsrtx_Abort`.
- Measurement access through `rsrtx_ConfigureMeasurementSource`, `rsrtx_ConfigureQuickMeasurements`, `rsrtx_QueryQuickMeasurementResults`, `rsrtx_ReadMainWaveformMeasurement`, and `rsrtx_FetchMainWaveformMeasurement`.
- Waveform retrieval through `rsrtx_ReadWaveform`, `rsrtx_FetchWaveform`, and related typed fetch helpers.

That means the safest design is a wrapper above the vendor driver, not a new raw SCPI layer unless the instrument connection requires it later.

For the Python implementation, `RsInstrument` is the preferred transport layer when the hardware is reachable through VISA or socket communication, because it already handles SCPI I/O, logging, simulation mode, and error checking.

## Wrapper goal

Expose three callable operations for the hackathon team:

1. Read state.
2. Set a parameter.
3. Run a measurement.

Every mutating action should include confirmation gating so accidental settings changes do not hit the instrument without an explicit approve step.

## Proposed callable surface

### `readState`

Purpose: return a normalized snapshot of instrument state.

Suggested inputs:

- `session`
- `scope` such as `all`, `acquisition`, `channel`, `trigger`, `measurement`, or `waveform`
- `keys` optional list of requested fields

Suggested output:

- `ok`
- `state` object with typed values
- `source`
- `timestamp`
- `raw` optional vendor values for debugging

Example shape:

```json
{
  "ok": true,
  "state": {
    "acquisitionState": "running",
    "horizontalRecordLength": 1000000,
    "channel1": {
      "enabled": true,
      "verticalScale": 0.5,
      "offset": 0.0
    }
  }
}
```

### `setParameter`

Purpose: change one instrument setting with built-in confirmation gating.

Suggested inputs:

- `session`
- `path` such as `channel.1.verticalScale` or `trigger.edge.source`
- `value`
- `confirmed` boolean
- `confirmationId` optional token from a prior preview step

Required behavior:

- First call should be a preview if `confirmed` is false.
- The wrapper returns a human-readable change summary.
- The actual vendor write only happens when `confirmed` is true and the request still matches the previewed change.

Suggested output:

- `ok`
- `needsConfirmation`
- `confirmationId`
- `summary`
- `previousValue`
- `proposedValue`

### `runMeasurement`

Purpose: configure and execute a measurement, then return the result.

Suggested inputs:

- `session`
- `measurementType` such as `frequency`, `peakToPeak`, `rms`, `riseTime`, `fallTime`, `delay`, or `cursor`
- `source`
- `gate` or `region` optional measurement gate
- `confirmed` boolean
- `confirmationId` optional token

Suggested behavior:

- Preview the exact measurement setup first.
- Only start the acquisition or measurement call after confirmation.
- Return both the measurement result and the acquisition context used to compute it.

Suggested output:

- `ok`
- `needsConfirmation`
- `confirmationId`
- `result`
- `unit`
- `source`
- `quality` or `status`

## Confirmation gating rules

- Any call that writes to the instrument requires an explicit confirmation token or `confirmed: true` after preview.
- The preview must include the exact path, current value, proposed value, and a short description of the effect.
- The confirm step must fail if the instrument state changed since preview.
- Read-only calls never require confirmation.
- Measurement calls should still preview if they alter setup or acquisition state.

## Recommended implementation order

1. Build `readState` on top of the vendor `GetAttribute` path.
2. Add `setParameter` with preview and confirm gating.
3. Add `runMeasurement` using the vendor measurement helpers.
4. Only fall back to direct SCPI if the vendor driver cannot reach the connected instrument.

## Proposed function catalog

This is the first-pass function set for William's core. Keep the surface small enough for the hackathon and cover only the paths the demo actually needs.

### READ functions

These return state only and never require confirmation.

- `read_instrument_id` -> identify the connected scope and firmware.
  - Vendor source: `rsrtx_GetAttributeViString` on instrument ID / model / serial fields.
- `read_acquisition_state` -> running, stopped, trigger state, and acquisition mode.
  - Vendor source: `rsrtx_GetAttributeViInt32` / `rsrtx_GetAttributeViBoolean`.
- `read_channel_state` -> enabled, scale, offset, coupling, probe attenuation.
  - Vendor source: `rsrtx_GetAttribute*`.
- `read_trigger_state` -> trigger source, level, mode, edge/polarity.
  - Vendor source: `rsrtx_GetAttribute*`.
- `read_horizontal_state` -> timebase / record length / sample rate.
  - Vendor source: `rsrtx_QueryHorizontalRecordLength`, `rsrtx_GetAttribute*`.
- `read_measurement_results` -> current auto or quick measurement values.
  - Vendor source: `rsrtx_QueryQuickMeasurementResults`, `rsrtx_ReadMainWaveformMeasurement`.

### WRITE functions

These must go through preview-first confirmation gating.

- `set_acquisition_state` -> start or stop acquisition.
  - Vendor source: `rsrtx_ConfigureAcquisitionState`, `rsrtx_InitiateAcquisition`, `rsrtx_Abort`.
- `set_channel_scale` -> vertical scale per channel.
  - Vendor source: `rsrtx_ConfigureChannelVerticalScale`.
- `set_channel_offset` -> vertical offset per channel.
  - Vendor source: `rsrtx_ConfigureChannelZeroOffset`, `rsrtx_ConfigureChannel`.
- `set_channel_coupling` -> AC/DC coupling if exposed by the selected path.
  - Vendor source: `rsrtx_SetAttribute*` or vendor channel config helpers.
- `set_trigger_source` -> select trigger channel/source.
  - Vendor source: `rsrtx_ConfigureTriggerSource`, `rsrtx_ConfigureEdgeTriggerSource`.
- `set_trigger_level` -> trigger threshold/level.
  - Vendor source: `rsrtx_ConfigureTriggerChannelLevel`.
- `set_timebase` -> horizontal scale / record length.
  - Vendor source: `rsrtx_ConfigureHorizontalRecordLength`, `rsrtx_ConfigureRecordLength`.
- `set_measurement_source` -> map a measurement to a channel/source.
  - Vendor source: `rsrtx_ConfigureMeasurementSource`.
- `configure_quick_measurements` -> enable or update quick measurements.
  - Vendor source: `rsrtx_ConfigureQuickMeasurements`, `rsrtx_ConfigureQuickMeasurementState`.

### MEASUREMENT functions

These may read only or may also change acquisition context, so preview them as a measurement action and confirm if the setup will mutate instrument state.

- `measure_quick` -> return the current quick measurement value(s).
  - Vendor source: `rsrtx_QueryQuickMeasurementResults`.
- `measure_main_waveform` -> compute a selected waveform measurement.
  - Vendor source: `rsrtx_ReadMainWaveformMeasurement`.
- `measure_main_waveform_fetch` -> fetch the value after acquisition if needed.
  - Vendor source: `rsrtx_FetchMainWaveformMeasurement`.
- `read_waveform` -> raw waveform for external analysis.
  - Vendor source: `rsrtx_ReadWaveform`.
- `fetch_waveform` -> waveform already captured by acquisition.
  - Vendor source: `rsrtx_FetchWaveform`, plus typed variants.

## Wrapper rules for the function catalog

- READ functions may run immediately.
- WRITE functions must first return a preview object with `needsConfirmation: true`.
- The confirm step must include a stable `confirmationId` and the exact proposed mutation.
- If a confirmation token is stale or the underlying state changed, reject the write and force a fresh preview.
- A mock/simulator backend must implement the same function names and response shapes so the rest of the team can integrate without hardware.

## Suggested response shape

Keep the contract uniform across the catalog:

```json
{
  "ok": true,
  "name": "set_timebase",
  "category": "WRITE",
  "needsConfirmation": true,
  "confirmationId": "abc123",
  "summary": "Change horizontal record length from 1000000 to 2000000 samples",
  "result": null,
  "error": null
}
```

## Best next files to inspect

- [RTB2_UserManual_en_02.pdf](../Manuals/RTB2_UserManual_en_02.pdf)
- [rsrtx.h inside rsrtx-cvi-2.4.0.zip](../Drivers/rsrtx-cvi-2.4.0.zip)
