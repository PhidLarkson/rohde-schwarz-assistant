/**
 * Anomaly Detection / Troubleshooting (Core 4b)
 * Accepts a trace description or feature summary, returns probable cause + fix steps.
 * Rule-based lookup against known fault patterns. Falls back to Gemini for complex cases.
 *
 * Contract:
 *   DIAGNOSE_REQUEST { trace_features?: object, description?: string }
 *   → { probable_cause: string, confidence: number, fix_steps: string[], unsafe_flag: boolean }
 */

import { GoogleGenAI } from '@google/genai';
import { sessionLogger } from './session';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface DiagnoseRequest {
  trace_features?: Record<string, unknown>;
  description?: string;
}

export interface DiagnoseResult {
  probable_cause: string;
  confidence: number;
  fix_steps: string[];
  unsafe_flag: boolean;
}

interface FaultPattern {
  keywords: string[];
  cause: string;
  confidence: number;
  fix_steps: string[];
  unsafe: boolean;
}

const FAULT_PATTERNS: FaultPattern[] = [
  {
    keywords: ['clipped', 'flat top', 'flat bottom', 'saturated'],
    cause: 'Signal clipping — input amplitude exceeds the vertical scale range',
    confidence: 0.85,
    fix_steps: [
      'Increase the vertical scale (V/div) to fit the full waveform',
      'Check if the probe attenuation setting matches the physical probe (1X vs 10X)',
      'Verify input signal amplitude is within instrument limits',
    ],
    unsafe: false,
  },
  {
    keywords: ['noisy', 'fuzzy', 'thick trace', 'noise'],
    cause: 'Excessive noise on the signal — likely poor grounding or electromagnetic interference',
    confidence: 0.75,
    fix_steps: [
      'Connect the probe ground clip to the circuit ground',
      'Use a shorter ground lead to reduce pickup',
      'Enable bandwidth limiting (BW Limit) if high-frequency noise is not relevant',
      'Move away from sources of EMI (motors, switching supplies)',
    ],
    unsafe: false,
  },
  {
    keywords: ['unstable', 'drifting', 'rolling', 'not triggered', 'no trigger'],
    cause: 'Trigger not locked — the oscilloscope cannot synchronize to the signal',
    confidence: 0.80,
    fix_steps: [
      'Set trigger source to the channel displaying the signal',
      'Adjust trigger level to cross the waveform (use Auto level if available)',
      'Select the correct trigger mode (Edge trigger for periodic signals)',
      'Ensure the signal frequency is within the timebase range shown',
    ],
    unsafe: false,
  },
  {
    keywords: ['flat line', 'no signal', 'zero', 'dead', 'blank'],
    cause: 'No signal detected — input may be disconnected or channel is disabled',
    confidence: 0.80,
    fix_steps: [
      'Verify the probe is connected to the correct channel input',
      'Press the channel button to enable the channel display',
      'Check that the probe tip is making contact with the test point',
      'Test the probe on the compensation output to confirm it works',
    ],
    unsafe: false,
  },
  {
    keywords: ['overvoltage', 'overload', 'exceeded', 'warning'],
    cause: 'Input voltage exceeds safe operating limits',
    confidence: 0.95,
    fix_steps: [
      'IMMEDIATELY disconnect the probe from the circuit',
      'Verify the signal voltage is within probe and channel limits',
      'Use appropriate attenuation (10X or 100X probe) for high-voltage signals',
      'Never exceed the maximum input voltage rating of the instrument',
    ],
    unsafe: true,
  },
  {
    keywords: ['aliasing', 'staircase', 'stepped', 'jagged'],
    cause: 'Aliasing — sample rate is too low for the signal frequency',
    confidence: 0.75,
    fix_steps: [
      'Decrease the timebase (faster sweep) to increase sample rate',
      'The sample rate should be at least 5x the signal frequency',
      'Check if the signal frequency matches what you expect',
    ],
    unsafe: false,
  },
  {
    keywords: ['ringing', 'overshoot', 'undershoot', 'oscillation'],
    cause: 'Probe compensation is incorrect or impedance mismatch',
    confidence: 0.70,
    fix_steps: [
      'Perform probe compensation using the calibration output',
      'Adjust the compensation trimmer on the probe until the square wave is flat',
      'Ensure probe impedance matches the channel input impedance',
    ],
    unsafe: false,
  },
  {
    keywords: ['dc offset', 'shifted', 'baseline', 'not centered'],
    cause: 'DC offset present — coupling mode may be set incorrectly',
    confidence: 0.70,
    fix_steps: [
      'Switch channel coupling from DC to AC if you only need the AC component',
      'Use the vertical position knob to re-center the trace',
      'Check if the signal source has an unexpected DC bias',
    ],
    unsafe: false,
  },
];

function matchFaultPatterns(text: string): FaultPattern | null {
  const lower = text.toLowerCase();
  let bestMatch: FaultPattern | null = null;
  let bestScore = 0;

  for (const pattern of FAULT_PATTERNS) {
    let score = 0;
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

export async function diagnoseTrace(request: DiagnoseRequest): Promise<DiagnoseResult> {
  const description = request.description ||
    (request.trace_features ? JSON.stringify(request.trace_features) : '');

  if (!description) {
    return {
      probable_cause: 'No trace description provided',
      confidence: 0,
      fix_steps: ['Please describe what you see on the oscilloscope screen'],
      unsafe_flag: false,
    };
  }

  console.log('🔧 [ANOMALY] Diagnosing:', description.substring(0, 80));
  sessionLogger.logToolCall('diagnose_trace', { description: description.substring(0, 200) }, 'READ');

  // Try rule-based matching first
  const patternMatch = matchFaultPatterns(description);
  if (patternMatch && patternMatch.confidence >= 0.7) {
    const result: DiagnoseResult = {
      probable_cause: patternMatch.cause,
      confidence: patternMatch.confidence,
      fix_steps: patternMatch.fix_steps,
      unsafe_flag: patternMatch.unsafe,
    };

    sessionLogger.logAssistantResponse(
      `Diagnosis: ${result.probable_cause} (${(result.confidence * 100).toFixed(0)}% confidence)` +
      (result.unsafe_flag ? ' ⚠️ SAFETY CONCERN' : ''),
      'troubleshooting'
    );

    console.log('✅ [ANOMALY] Rule-based match:', result.probable_cause);
    return result;
  }

  // Fall back to Gemini for complex or unrecognized patterns
  try {
    const geminiResult = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a Rohde & Schwarz oscilloscope troubleshooting expert.

A student describes this trace issue: "${description}"

Respond ONLY in this JSON format:
{
  "probable_cause": "one sentence explaining the most likely cause",
  "confidence": 0.0 to 1.0,
  "fix_steps": ["step 1", "step 2", "step 3"],
  "unsafe_flag": true/false (true only if there is a risk of equipment damage or personal injury)
}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const responseText = geminiResult.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in diagnosis response');

    const parsed = JSON.parse(jsonMatch[0]);
    const result: DiagnoseResult = {
      probable_cause: parsed.probable_cause || 'Unable to determine cause',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      fix_steps: Array.isArray(parsed.fix_steps) ? parsed.fix_steps : [],
      unsafe_flag: !!parsed.unsafe_flag,
    };

    sessionLogger.logAssistantResponse(
      `Diagnosis: ${result.probable_cause}` +
      (result.unsafe_flag ? ' ⚠️ SAFETY CONCERN' : ''),
      'troubleshooting'
    );

    console.log('✅ [ANOMALY] Gemini diagnosis:', result.probable_cause);
    return result;
  } catch (err) {
    console.error('❌ [ANOMALY] Diagnosis failed:', err);
    sessionLogger.logSystemEvent(`Anomaly error: ${(err as Error).message}`);
    return {
      probable_cause: 'Unable to diagnose — please describe the issue in more detail',
      confidence: 0,
      fix_steps: ['Try describing the waveform shape, stability, and any error messages'],
      unsafe_flag: false,
    };
  }
}
