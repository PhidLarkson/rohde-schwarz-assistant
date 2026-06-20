/**
 * RAG / Context Layer (Core 2)
 * Embedded procedure docs, safety rules, and fault patterns.
 * Simple keyword retrieval — no vector store needed for the hackathon.
 */

export interface RetrieveRequest {
  query: string;
  top_k?: number;
  category?: 'procedure' | 'safety' | 'fault' | 'all';
}

export interface Chunk {
  text: string;
  source: string;
  category: 'procedure' | 'safety' | 'fault';
  score: number;
}

export interface RetrieveResult {
  chunks: Chunk[];
}

interface Document {
  id: string;
  title: string;
  category: 'procedure' | 'safety' | 'fault';
  keywords: string[];
  content: string;
}

const CORPUS: Document[] = [
  // ── PROCEDURES ──
  {
    id: 'proc-measure-sine',
    title: 'Measure a 1kHz Sine Wave',
    category: 'procedure',
    keywords: ['measure', 'sine', 'wave', '1khz', 'signal', 'frequency', 'basic'],
    content: `Procedure: Measuring a 1kHz Sine Wave on R&S Oscilloscope

1. Connect the probe to CH1 BNC input. Attach ground clip to circuit ground.
2. Set probe attenuation to match physical probe (typically 10X).
3. Enable CH1 if not already active.
4. Set vertical scale to 1 V/div as a starting point.
5. Set timebase to 500 us/div (shows ~2 complete cycles of a 1kHz signal).
6. Set trigger source to CH1, rising edge, auto mode.
7. Adjust trigger level to approximately mid-signal amplitude.
8. The waveform should now be stable on screen.
9. Use Measure function to read frequency (expect ~1kHz) and Vpp.
10. Fine-tune vertical scale and timebase for optimal display.

Expected result: Stable sine wave, frequency reading ~1000Hz.`,
  },
  {
    id: 'proc-probe-comp',
    title: 'Probe Compensation',
    category: 'procedure',
    keywords: ['probe', 'compensation', 'calibration', 'square', 'trimmer', 'adjust', 'attenuation'],
    content: `Procedure: Probe Compensation

1. Connect probe to the PROBE COMP output on the front panel (typically outputs a 1kHz square wave).
2. Set CH1 to 10X attenuation to match the probe.
3. Set timebase to 500 us/div, vertical scale to 500 mV/div.
4. Observe the square wave shape:
   - Flat top and bottom = correctly compensated
   - Rounded corners (undershoot) = undercompensated → turn trimmer clockwise
   - Sharp spikes (overshoot/ringing) = overcompensated → turn trimmer counterclockwise
5. Use the small screwdriver to adjust the trimmer on the probe until square wave edges are flat.
6. Verify compensation is correct before making any measurements.

Warning: An incorrectly compensated probe gives inaccurate amplitude readings.`,
  },
  {
    id: 'proc-trigger-setup',
    title: 'Setting Up the Trigger',
    category: 'procedure',
    keywords: ['trigger', 'edge', 'level', 'stable', 'sync', 'rolling', 'unstable'],
    content: `Procedure: Setting Up the Trigger

The trigger synchronizes the display to the signal so the waveform appears stable.

1. Press the Trigger menu button.
2. Select Edge trigger type (most common).
3. Set source to the channel displaying your signal (e.g. CH1).
4. Choose slope: Rising (triggers on upward crossing) or Falling.
5. Set mode:
   - Auto: always shows a trace, even without a trigger event (good for finding signals)
   - Normal: only updates when trigger conditions are met (clean display for periodic signals)
   - Single: captures one trigger event then stops (for transient signals)
6. Adjust trigger level: the horizontal indicator should cross through the waveform.
7. If using Auto Level, press it to auto-set the trigger level to the signal midpoint.

Common issue: If the waveform is rolling/drifting, the trigger level is probably outside the signal amplitude range.`,
  },
  {
    id: 'proc-cursor-measure',
    title: 'Using Cursors for Manual Measurement',
    category: 'procedure',
    keywords: ['cursor', 'manual', 'measurement', 'delta', 'voltage', 'time', 'measure'],
    content: `Procedure: Using Cursors for Manual Measurement

1. Press the Cursor button on the front panel.
2. Select cursor type:
   - Voltage cursors (horizontal lines): measure amplitude difference
   - Time cursors (vertical lines): measure time difference and frequency
3. Use the adjustment knob to position Cursor 1 to one point on the waveform.
4. Switch to Cursor 2 and position it at another point.
5. Read the delta value displayed on screen:
   - Delta V: voltage difference between cursors
   - Delta T: time difference between cursors
   - 1/Delta T: frequency of the signal between cursors

Tip: Cursors are useful when automatic measurements don't capture what you need, such as rise time between specific voltage levels.`,
  },
  {
    id: 'proc-ac-dc-coupling',
    title: 'AC vs DC Coupling',
    category: 'procedure',
    keywords: ['coupling', 'ac', 'dc', 'offset', 'block', 'capacitor'],
    content: `Procedure: Choosing AC or DC Coupling

DC Coupling (default):
- Shows the complete signal including any DC offset
- Use when you need to see the true voltage level relative to ground
- Required for measuring DC voltages

AC Coupling:
- Blocks the DC component, showing only the AC variation
- Use when measuring a small AC signal riding on a large DC offset
- Example: measuring ripple on a 5V power supply

To change: Press the channel button (CH1/CH2) → select Coupling → choose AC or DC.

Warning: AC coupling adds a high-pass filter. Very low frequency signals (<10Hz) may be attenuated.`,
  },
  {
    id: 'proc-save-screenshot',
    title: 'Saving a Screenshot',
    category: 'procedure',
    keywords: ['save', 'screenshot', 'capture', 'usb', 'file', 'export', 'image'],
    content: `Procedure: Saving a Screenshot

1. Insert a USB flash drive into the front panel USB port.
2. Set up the display exactly as you want to capture it.
3. Press the Print/Save button (or Camera icon).
4. Select format: PNG (recommended) or BMP.
5. Choose destination: USB drive.
6. Press Save. The file is saved with a timestamp filename.

Tip: Name your files systematically for lab reports. Some R&S models allow you to set a filename prefix.`,
  },

  // ── SAFETY RULES ──
  {
    id: 'safety-voltage-limits',
    title: 'Input Voltage Limits',
    category: 'safety',
    keywords: ['voltage', 'limit', 'maximum', 'input', 'overload', 'damage', 'protection'],
    content: `Safety: Input Voltage Limits

Maximum input voltage for R&S oscilloscope channels:
- With 1X probe: 300V CAT II (DC + peak AC)
- With 10X probe: 600V CAT II (at probe tip)
- BNC input direct: 300V max

NEVER exceed these limits. Overvoltage can:
- Damage the input amplifier permanently
- Destroy the probe
- Create a safety hazard

Before connecting to an unknown circuit:
1. Use a multimeter first to check approximate voltage levels
2. Start with the highest attenuation probe available (10X or 100X)
3. Set the oscilloscope to the highest V/div range before connecting

If the scope displays an OVERLOAD warning, disconnect the probe immediately.`,
  },
  {
    id: 'safety-grounding',
    title: 'Proper Grounding',
    category: 'safety',
    keywords: ['ground', 'grounding', 'earth', 'clip', 'short', 'circuit', 'safety'],
    content: `Safety: Proper Grounding

The oscilloscope ground (probe ground clip) is connected to earth ground through the power cord.

Critical rules:
1. The ground clip MUST connect to the circuit's ground reference
2. NEVER connect the ground clip to a point that has voltage relative to earth ground — this creates a short circuit through the scope's ground path
3. When measuring between two non-ground points, use differential measurement (two channels, Math subtraction) instead of connecting the ground clip to a hot point

Common mistake: Connecting ground clip to the high side of a component — this shorts out the component through the scope ground and can damage the scope, the circuit, or both.

For floating measurements: Use a differential probe or set the scope to isolated mode if available.`,
  },
  {
    id: 'safety-probe-check',
    title: 'Pre-Measurement Probe Check',
    category: 'safety',
    keywords: ['probe', 'check', 'before', 'connect', 'verify', 'attenuation', 'inspect'],
    content: `Safety: Pre-Measurement Probe Check

Before connecting a probe to any circuit:

1. Inspect the probe cable for damage — cracked insulation, bent tips, worn ground clips
2. Verify probe attenuation matches the oscilloscope channel setting (1X/10X)
3. Ensure the probe is rated for the voltage you plan to measure
4. Check that the ground clip is not damaged and makes good contact
5. Perform probe compensation before first use or when switching between channels

Do NOT:
- Use a damaged probe
- Use a 1X probe on high-voltage circuits
- Touch exposed metal parts while measuring live circuits`,
  },
  {
    id: 'safety-power-on',
    title: 'Power-On Safety',
    category: 'safety',
    keywords: ['power', 'startup', 'boot', 'turn on', 'initial', 'warm'],
    content: `Safety: Power-On Procedure

1. Verify the power cord is properly connected and the outlet is grounded
2. Check that no probes are connected to live circuits before powering on
3. Turn on the oscilloscope and wait for self-test to complete
4. Allow 20 minutes warm-up time for accurate measurements
5. Verify the default settings are appropriate before connecting to a circuit

The oscilloscope performs internal calibration during warm-up. Measurements taken before warm-up may drift slightly.`,
  },

  // ── FAULT PATTERNS ──
  {
    id: 'fault-clipped',
    title: 'Clipped Waveform',
    category: 'fault',
    keywords: ['clipped', 'flat', 'top', 'bottom', 'saturated', 'cut off', 'amplitude'],
    content: `Fault: Clipped Waveform

Symptom: Waveform appears to have flat tops and/or flat bottoms — the signal is being cut off.

Causes:
1. Vertical scale too small — the signal exceeds the display range
2. Probe attenuation mismatch — scope thinks signal is smaller than it is
3. Input amplifier saturated — signal exceeds the channel's input range

Fix:
1. Increase vertical scale (V/div) until the full waveform is visible
2. Check probe attenuation: if using a 10X probe, ensure the channel is set to 10X
3. If clipping persists at maximum V/div, use a higher attenuation probe

Warning: Persistent clipping at maximum range may indicate the signal exceeds safe input limits.`,
  },
  {
    id: 'fault-noisy',
    title: 'Noisy Trace',
    category: 'fault',
    keywords: ['noisy', 'fuzzy', 'thick', 'noise', 'interference', 'emi', 'grounding'],
    content: `Fault: Noisy Trace

Symptom: The waveform appears thick, fuzzy, or has visible random fluctuations superimposed.

Causes:
1. Poor grounding — ground lead too long or not connected
2. Electromagnetic interference (EMI) from nearby equipment
3. Inherent signal noise from the circuit under test
4. Using 1X probe (no attenuation of noise)

Fix:
1. Use a shorter ground lead — the spring-tip ground is better than the alligator clip
2. Move the probe away from motors, switching power supplies, or digital circuits
3. Enable bandwidth limiting (BW Limit) to filter high-frequency noise
4. Use averaging mode to smooth out random noise
5. Switch to a 10X probe if currently using 1X`,
  },
  {
    id: 'fault-no-trigger',
    title: 'Unstable / Rolling Display',
    category: 'fault',
    keywords: ['unstable', 'rolling', 'drifting', 'trigger', 'sync', 'not triggered'],
    content: `Fault: Unstable or Rolling Display

Symptom: The waveform scrolls or drifts across the screen instead of being stable.

Causes:
1. Trigger level is outside the signal amplitude range
2. Wrong trigger source selected
3. Trigger mode set to Auto with no signal present
4. Signal frequency is too high or too low for current timebase

Fix:
1. Press Auto Level to auto-detect the correct trigger level
2. Set trigger source to the channel showing the signal
3. Use Normal mode instead of Auto for periodic signals
4. Adjust timebase — at least 2 complete cycles should be visible
5. If signal is very slow, increase timebase to see it`,
  },
  {
    id: 'fault-aliasing',
    title: 'Aliased Waveform',
    category: 'fault',
    keywords: ['aliasing', 'staircase', 'wrong', 'frequency', 'sample', 'rate', 'jagged'],
    content: `Fault: Aliased Waveform

Symptom: Waveform appears as a lower frequency than expected, looks like a staircase, or has an incorrect shape.

Cause: The sample rate is too low relative to the signal frequency (violates Nyquist criterion). The oscilloscope needs at least 2.5x the signal frequency in sample rate for reliable display; 5-10x is recommended.

Fix:
1. Decrease the timebase (faster sweep speed) — this increases the sample rate
2. Verify the signal frequency with a separate measurement or frequency counter
3. If the signal is very high frequency, ensure you're not at the oscilloscope's bandwidth limit

Rule of thumb: If changing the timebase changes the apparent signal shape or frequency, aliasing is likely the cause.`,
  },
];

function scoreMatch(doc: Document, queryWords: string[]): number {
  let score = 0;
  const contentLower = doc.content.toLowerCase();
  const titleLower = doc.title.toLowerCase();

  for (const word of queryWords) {
    if (doc.keywords.some(k => k.includes(word))) score += 3;
    if (titleLower.includes(word)) score += 2;
    const matches = contentLower.split(word).length - 1;
    score += Math.min(matches, 3);
  }
  return score;
}

export function retrieve(request: RetrieveRequest): RetrieveResult {
  const topK = request.top_k || 3;
  const queryWords = request.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const category = request.category || 'all';

  const candidates = category === 'all'
    ? CORPUS
    : CORPUS.filter(d => d.category === category);

  const scored = candidates
    .map(doc => ({ doc, score: scoreMatch(doc, queryWords) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    chunks: scored.map(s => ({
      text: s.doc.content,
      source: s.doc.title,
      category: s.doc.category,
      score: s.score,
    })),
  };
}

export function getContextForQuery(query: string): string {
  const result = retrieve({ query, top_k: 2, category: 'all' });
  if (result.chunks.length === 0) return '';
  return result.chunks.map(c =>
    `[${c.category.toUpperCase()}: ${c.source}]\n${c.text}`
  ).join('\n\n---\n\n');
}
