/**
 * Instrument API + Function Calling (Core 3)
 * Mock oscilloscope simulator with READ/WRITE gating.
 * WRITE calls MUST have confirmed=true or they are rejected.
 */

import { sessionLogger } from './session';

export type FunctionCategory = 'READ' | 'WRITE';

export interface InstrumentFunction {
  name: string;
  category: FunctionCategory;
  description: string;
  params: Record<string, { type: string; description: string; enum?: string[] }>;
  requires_confirmation: boolean;
  safety_limits?: Record<string, { min: number; max: number }>;
}

export interface CallFunctionRequest {
  name: string;
  params: Record<string, unknown>;
  confirmed?: boolean;
}

export interface CallFunctionResult {
  status: 'ok' | 'error' | 'confirmation_required';
  result?: unknown;
  error?: string;
  confirmation_prompt?: string;
}

// ── Simulated oscilloscope state ──

interface OscilloscopeState {
  channels: {
    [ch: number]: {
      enabled: boolean;
      coupling: 'AC' | 'DC';
      scale_v_div: number;
      offset_v: number;
      probe_attenuation: '1X' | '10X';
    };
  };
  horizontal: {
    timebase_s_div: number;
    position_s: number;
  };
  trigger: {
    source: number;
    level_v: number;
    slope: 'rising' | 'falling';
    mode: 'auto' | 'normal' | 'single';
  };
  measurement: {
    frequency_hz: number | null;
    vpp_v: number | null;
    vrms_v: number | null;
    period_s: number | null;
  };
}

const state: OscilloscopeState = {
  channels: {
    1: { enabled: true, coupling: 'DC', scale_v_div: 1.0, offset_v: 0, probe_attenuation: '10X' },
    2: { enabled: false, coupling: 'DC', scale_v_div: 1.0, offset_v: 0, probe_attenuation: '10X' },
    3: { enabled: false, coupling: 'DC', scale_v_div: 1.0, offset_v: 0, probe_attenuation: '10X' },
    4: { enabled: false, coupling: 'DC', scale_v_div: 1.0, offset_v: 0, probe_attenuation: '10X' },
  },
  horizontal: { timebase_s_div: 0.001, position_s: 0 },
  trigger: { source: 1, level_v: 0.5, slope: 'rising', mode: 'auto' },
  measurement: { frequency_hz: 1000, vpp_v: 2.0, vrms_v: 0.707, period_s: 0.001 },
};

// ── Function catalogue ──

export const INSTRUMENT_FUNCTIONS: InstrumentFunction[] = [
  {
    name: 'get_instrument_state',
    category: 'READ',
    description: 'Read the full current state of the oscilloscope (all channels, timebase, trigger, measurements)',
    params: {},
    requires_confirmation: false,
  },
  {
    name: 'get_channel_state',
    category: 'READ',
    description: 'Read the state of a specific channel',
    params: { channel: { type: 'number', description: 'Channel number (1-4)' } },
    requires_confirmation: false,
  },
  {
    name: 'get_measurement',
    category: 'READ',
    description: 'Read current measurement values (frequency, Vpp, Vrms, period)',
    params: {},
    requires_confirmation: false,
  },
  {
    name: 'set_channel_enabled',
    category: 'WRITE',
    description: 'Enable or disable a channel',
    params: {
      channel: { type: 'number', description: 'Channel number (1-4)' },
      enabled: { type: 'boolean', description: 'true to enable, false to disable' },
    },
    requires_confirmation: true,
  },
  {
    name: 'set_channel_coupling',
    category: 'WRITE',
    description: 'Set channel coupling mode',
    params: {
      channel: { type: 'number', description: 'Channel number (1-4)' },
      coupling: { type: 'string', description: 'Coupling mode', enum: ['AC', 'DC'] },
    },
    requires_confirmation: true,
  },
  {
    name: 'set_vertical_scale',
    category: 'WRITE',
    description: 'Set the vertical scale (volts per division) for a channel',
    params: {
      channel: { type: 'number', description: 'Channel number (1-4)' },
      scale_v_div: { type: 'number', description: 'Volts per division' },
    },
    requires_confirmation: true,
    safety_limits: { scale_v_div: { min: 0.001, max: 100 } },
  },
  {
    name: 'set_timebase',
    category: 'WRITE',
    description: 'Set the horizontal timebase (seconds per division)',
    params: {
      timebase_s_div: { type: 'number', description: 'Seconds per division' },
    },
    requires_confirmation: true,
    safety_limits: { timebase_s_div: { min: 0.000000001, max: 50 } },
  },
  {
    name: 'set_trigger',
    category: 'WRITE',
    description: 'Configure trigger settings',
    params: {
      source: { type: 'number', description: 'Trigger source channel (1-4)' },
      level_v: { type: 'number', description: 'Trigger level in volts' },
      slope: { type: 'string', description: 'Trigger slope', enum: ['rising', 'falling'] },
      mode: { type: 'string', description: 'Trigger mode', enum: ['auto', 'normal', 'single'] },
    },
    requires_confirmation: true,
    safety_limits: { level_v: { min: -100, max: 100 } },
  },
  {
    name: 'set_probe_attenuation',
    category: 'WRITE',
    description: 'Set probe attenuation for a channel',
    params: {
      channel: { type: 'number', description: 'Channel number (1-4)' },
      attenuation: { type: 'string', description: 'Probe attenuation', enum: ['1X', '10X'] },
    },
    requires_confirmation: true,
  },
  {
    name: 'run_autoset',
    category: 'WRITE',
    description: 'Run autoset to automatically configure the oscilloscope for the current signal',
    params: {},
    requires_confirmation: true,
  },
];

// ── Pending confirmations ──

let pendingCall: CallFunctionRequest | null = null;

export function getPendingConfirmation(): CallFunctionRequest | null {
  return pendingCall;
}

export function confirmPending(): CallFunctionResult {
  if (!pendingCall) return { status: 'error', error: 'No pending confirmation' };
  const call = { ...pendingCall, confirmed: true };
  pendingCall = null;
  return executeFunction(call);
}

export function denyPending(): CallFunctionResult {
  const was = pendingCall;
  pendingCall = null;
  sessionLogger.logToolCall(was?.name || 'unknown', was?.params || {}, 'WRITE', null, false);
  return { status: 'ok', result: 'Action cancelled by user.' };
}

// ── Execute ──

export function executeFunction(request: CallFunctionRequest): CallFunctionResult {
  const fn = INSTRUMENT_FUNCTIONS.find(f => f.name === request.name);
  if (!fn) return { status: 'error', error: `Unknown function: ${request.name}` };

  // WRITE gate
  if (fn.category === 'WRITE' && !request.confirmed) {
    pendingCall = request;
    const desc = describeAction(request);
    sessionLogger.logToolCall(request.name, request.params, 'WRITE');
    return {
      status: 'confirmation_required',
      confirmation_prompt: `I need your permission to: ${desc}. Shall I proceed?`,
    };
  }

  // Safety limits
  if (fn.safety_limits) {
    for (const [param, limits] of Object.entries(fn.safety_limits)) {
      const val = request.params[param] as number;
      if (val !== undefined && (val < limits.min || val > limits.max)) {
        return { status: 'error', error: `${param} = ${val} is outside safe limits (${limits.min} to ${limits.max})` };
      }
    }
  }

  const result = runSimulator(request);
  sessionLogger.logToolCall(request.name, request.params, fn.category, result, request.confirmed);
  return { status: 'ok', result };
}

function describeAction(req: CallFunctionRequest): string {
  switch (req.name) {
    case 'set_timebase': return `set timebase to ${req.params.timebase_s_div} s/div`;
    case 'set_vertical_scale': return `set CH${req.params.channel} vertical scale to ${req.params.scale_v_div} V/div`;
    case 'set_channel_coupling': return `set CH${req.params.channel} coupling to ${req.params.coupling}`;
    case 'set_channel_enabled': return `${req.params.enabled ? 'enable' : 'disable'} CH${req.params.channel}`;
    case 'set_trigger': return `set trigger: source CH${req.params.source}, level ${req.params.level_v}V, ${req.params.slope} edge, ${req.params.mode} mode`;
    case 'set_probe_attenuation': return `set CH${req.params.channel} probe to ${req.params.attenuation}`;
    case 'run_autoset': return 'run autoset on the oscilloscope';
    default: return `${req.name} with ${JSON.stringify(req.params)}`;
  }
}

function runSimulator(req: CallFunctionRequest): unknown {
  const p = req.params;

  switch (req.name) {
    case 'get_instrument_state':
      return { ...state };

    case 'get_channel_state': {
      const ch = state.channels[p.channel as number];
      return ch || { error: 'Invalid channel' };
    }

    case 'get_measurement':
      return { ...state.measurement };

    case 'set_channel_enabled': {
      const ch = state.channels[p.channel as number];
      if (ch) ch.enabled = p.enabled as boolean;
      return { channel: p.channel, enabled: p.enabled };
    }

    case 'set_channel_coupling': {
      const ch = state.channels[p.channel as number];
      if (ch) ch.coupling = p.coupling as 'AC' | 'DC';
      return { channel: p.channel, coupling: p.coupling };
    }

    case 'set_vertical_scale': {
      const ch = state.channels[p.channel as number];
      if (ch) ch.scale_v_div = p.scale_v_div as number;
      return { channel: p.channel, scale_v_div: p.scale_v_div };
    }

    case 'set_timebase':
      state.horizontal.timebase_s_div = p.timebase_s_div as number;
      return { timebase_s_div: p.timebase_s_div };

    case 'set_trigger':
      if (p.source !== undefined) state.trigger.source = p.source as number;
      if (p.level_v !== undefined) state.trigger.level_v = p.level_v as number;
      if (p.slope !== undefined) state.trigger.slope = p.slope as 'rising' | 'falling';
      if (p.mode !== undefined) state.trigger.mode = p.mode as 'auto' | 'normal' | 'single';
      return { ...state.trigger };

    case 'set_probe_attenuation': {
      const ch = state.channels[p.channel as number];
      if (ch) ch.probe_attenuation = p.attenuation as '1X' | '10X';
      return { channel: p.channel, attenuation: p.attenuation };
    }

    case 'run_autoset':
      state.horizontal.timebase_s_div = 0.001;
      state.channels[1].scale_v_div = 1.0;
      state.trigger.level_v = 1.0;
      state.trigger.mode = 'auto';
      state.measurement = { frequency_hz: 1000, vpp_v: 2.0, vrms_v: 0.707, period_s: 0.001 };
      return { message: 'Autoset complete. Signal detected: 1kHz sine wave, 2Vpp.' };

    default:
      return { error: 'Not implemented' };
  }
}

export function getInstrumentState(): OscilloscopeState {
  return { ...state };
}

export function getFunctionDescriptions(): string {
  return INSTRUMENT_FUNCTIONS.map(f =>
    `- ${f.name} [${f.category}]: ${f.description}`
  ).join('\n');
}

// ── Flask API Bridge ──
// When the Python Flask server is running, route calls through it.
// Falls back to local mock if the server is unreachable.

const FLASK_API = import.meta.env.VITE_INSTRUMENT_API || 'http://localhost:5001';
let flaskAvailable: boolean | null = null;

async function checkFlask(): Promise<boolean> {
  if (flaskAvailable !== null) return flaskAvailable;
  try {
    const r = await fetch(`${FLASK_API}/api/health`, { signal: AbortSignal.timeout(1500) });
    flaskAvailable = r.ok;
  } catch {
    flaskAvailable = false;
  }
  console.log(`🔌 Instrument API: ${flaskAvailable ? 'Flask server connected' : 'using local mock'}`);
  return flaskAvailable;
}

export async function readStateRemote(scope: string = 'all'): Promise<CallFunctionResult> {
  if (!(await checkFlask())) {
    return executeFunction({ name: 'get_instrument_state', params: {} });
  }
  try {
    const r = await fetch(`${FLASK_API}/api/instrument/state?scope=${scope}`);
    const data = await r.json();
    sessionLogger.logToolCall('read_state', { scope }, 'READ', data.result);
    return { status: data.ok ? 'ok' : 'error', result: data.result, error: data.error };
  } catch (err) {
    return executeFunction({ name: 'get_instrument_state', params: {} });
  }
}

export async function setParameterRemote(
  path: string,
  value: unknown,
  confirmed: boolean = false,
  confirmationId?: string,
): Promise<CallFunctionResult> {
  if (!(await checkFlask())) {
    // Map to local mock function name
    return executeFunction({
      name: mapPathToFunction(path),
      params: mapPathToParams(path, value),
      confirmed,
    });
  }
  try {
    const r = await fetch(`${FLASK_API}/api/instrument/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, value, confirmed, confirmationId }),
    });
    const data = await r.json();
    if (data.needsConfirmation) {
      pendingCall = { name: 'set_parameter', params: { path, value } };
      return {
        status: 'confirmation_required',
        confirmation_prompt: data.summary,
        result: data.result,
      };
    }
    sessionLogger.logToolCall('set_parameter', { path, value }, 'WRITE', data.result, confirmed);
    return { status: data.ok ? 'ok' : 'error', result: data.result, error: data.error };
  } catch (err) {
    return executeFunction({
      name: mapPathToFunction(path),
      params: mapPathToParams(path, value),
      confirmed,
    });
  }
}

export async function runMeasurementRemote(
  measurementType: string,
  source?: string,
): Promise<CallFunctionResult> {
  if (!(await checkFlask())) {
    return executeFunction({ name: 'get_measurement', params: {} });
  }
  try {
    const r = await fetch(`${FLASK_API}/api/instrument/measure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ measurementType, source, confirmed: true }),
    });
    const data = await r.json();
    sessionLogger.logToolCall('run_measurement', { measurementType, source }, 'READ', data.result);
    return { status: data.ok ? 'ok' : 'error', result: data.result, error: data.error };
  } catch (err) {
    return executeFunction({ name: 'get_measurement', params: {} });
  }
}

function mapPathToFunction(path: string): string {
  if (path.includes('timebase') || path.includes('record_length')) return 'set_timebase';
  if (path.includes('vertical_scale') || path.includes('scale')) return 'set_vertical_scale';
  if (path.includes('coupling')) return 'set_channel_coupling';
  if (path.includes('trigger')) return 'set_trigger';
  if (path.includes('enabled')) return 'set_channel_enabled';
  return 'set_timebase';
}

function mapPathToParams(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const channel = parts.find(p => /^\d+$/.test(p));
  return { channel: channel ? parseInt(channel) : 1, value };
}
