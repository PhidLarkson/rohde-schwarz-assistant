import { sessionLogger } from './session';

export interface WorkflowStep {
  id: number;
  instruction: string;
  detail: string;
  instrumentAction?: { name: string; params: Record<string, unknown> };
  safetyCheck?: string;
}

export interface Workflow {
  id: string;
  title: string;
  description: string;
  category: 'simple' | 'safety-critical';
  steps: WorkflowStep[];
}

const WORKFLOWS: Workflow[] = [
  {
    id: 'measure-1khz-sine',
    title: 'Measure a 1 kHz Sine Wave',
    description: 'Step-by-step guide to measure a 1 kHz sine wave on CH1 using an R&S oscilloscope.',
    category: 'simple',
    steps: [
      {
        id: 1,
        instruction: 'Connect the probe to the CH1 BNC input.',
        detail: 'Attach the probe tip to your signal source and clip the ground lead to the circuit ground.',
      },
      {
        id: 2,
        instruction: 'Set probe attenuation to 10X.',
        detail: 'Make sure the physical probe switch matches the oscilloscope channel setting.',
        instrumentAction: { name: 'set_probe_attenuation', params: { channel: 1, attenuation: '10X' } },
      },
      {
        id: 3,
        instruction: 'Enable CH1.',
        detail: 'Press the CH1 button on the front panel or confirm below.',
        instrumentAction: { name: 'set_channel_enabled', params: { channel: 1, enabled: true } },
      },
      {
        id: 4,
        instruction: 'Set vertical scale to 1 V/div.',
        detail: 'This gives a good starting view for a typical 1 kHz test signal.',
        instrumentAction: { name: 'set_vertical_scale', params: { channel: 1, scale_v_div: 1.0 } },
      },
      {
        id: 5,
        instruction: 'Set timebase to 500 µs/div.',
        detail: 'At 500 µs/div you will see about 2 complete cycles of a 1 kHz signal.',
        instrumentAction: { name: 'set_timebase', params: { timebase_s_div: 0.0005 } },
      },
      {
        id: 6,
        instruction: 'Set trigger to CH1, rising edge, auto mode.',
        detail: 'This synchronizes the display so the waveform appears stable.',
        instrumentAction: { name: 'set_trigger', params: { source: 1, slope: 'rising', mode: 'auto' } },
      },
      {
        id: 7,
        instruction: 'Adjust trigger level to the signal midpoint.',
        detail: 'Set the trigger level to approximately half the peak-to-peak amplitude.',
        instrumentAction: { name: 'set_trigger', params: { source: 1, level_v: 1.0 } },
      },
      {
        id: 8,
        instruction: 'Verify the waveform is stable on screen.',
        detail: 'You should see a clean sine wave. If it drifts, readjust the trigger level.',
      },
      {
        id: 9,
        instruction: 'Read the measurement values.',
        detail: 'Use the Measure function to read frequency (expect ~1 kHz) and Vpp.',
        instrumentAction: { name: 'get_measurement', params: {} },
      },
      {
        id: 10,
        instruction: 'Done! Review your results.',
        detail: 'Expected: stable sine wave, frequency ~1000 Hz. Fine-tune vertical scale and timebase as needed.',
      },
    ],
  },
  {
    id: 'safety-overvoltage',
    title: 'Handle an Overvoltage Warning',
    description: 'Safety-critical workflow: what to do when the oscilloscope shows an overload or overvoltage warning.',
    category: 'safety-critical',
    steps: [
      {
        id: 1,
        instruction: 'STOP — Disconnect the probe from the circuit immediately.',
        detail: 'Do NOT touch the probe tip. Pull the BNC connector from the oscilloscope input.',
        safetyCheck: 'Overvoltage can damage the instrument and create a safety hazard.',
      },
      {
        id: 2,
        instruction: 'Check the signal voltage with a multimeter.',
        detail: 'Before reconnecting, measure the voltage at the test point using a handheld multimeter rated for the expected range.',
        safetyCheck: 'Never assume the voltage is safe — always verify.',
      },
      {
        id: 3,
        instruction: 'Verify the voltage is within safe limits.',
        detail: 'R&S oscilloscope limits: 300 V CAT II (1X probe), 600 V CAT II (10X probe tip). If the signal exceeds these, do NOT connect the oscilloscope.',
        safetyCheck: 'Exceeding input limits can permanently damage the input amplifier.',
      },
      {
        id: 4,
        instruction: 'Select the correct probe attenuation.',
        detail: 'If voltage is high, use a 10X or 100X probe to bring the signal within range. Set the oscilloscope channel to match.',
        instrumentAction: { name: 'set_probe_attenuation', params: { channel: 1, attenuation: '10X' } },
      },
      {
        id: 5,
        instruction: 'Set the oscilloscope to the maximum V/div range.',
        detail: 'Before reconnecting, set the vertical scale to the highest value so the input amplifier is not saturated.',
        instrumentAction: { name: 'set_vertical_scale', params: { channel: 1, scale_v_div: 10.0 } },
      },
      {
        id: 6,
        instruction: 'Reconnect the probe carefully and verify.',
        detail: 'Connect the probe and observe the waveform. Gradually decrease the vertical scale to get a clear display. The overload warning should be gone.',
      },
    ],
  },
];

let activeWorkflow: Workflow | null = null;
let currentStepIndex = 0;

export function getAvailableWorkflows(): { id: string; title: string; category: string }[] {
  return WORKFLOWS.map(w => ({ id: w.id, title: w.title, category: w.category }));
}

export function startWorkflow(id: string): Workflow | null {
  const wf = WORKFLOWS.find(w => w.id === id);
  if (!wf) return null;
  activeWorkflow = wf;
  currentStepIndex = 0;
  sessionLogger.logSystemEvent(`Workflow started: ${wf.title}`);
  return wf;
}

export function getActiveWorkflow(): Workflow | null {
  return activeWorkflow;
}

export function getCurrentStep(): WorkflowStep | null {
  if (!activeWorkflow) return null;
  return activeWorkflow.steps[currentStepIndex] || null;
}

export function advanceStep(): WorkflowStep | null {
  if (!activeWorkflow) return null;
  if (currentStepIndex < activeWorkflow.steps.length - 1) {
    currentStepIndex++;
    sessionLogger.logSystemEvent(`Workflow step ${currentStepIndex + 1}: ${activeWorkflow.steps[currentStepIndex].instruction}`);
    return activeWorkflow.steps[currentStepIndex];
  }
  sessionLogger.logSystemEvent(`Workflow completed: ${activeWorkflow.title}`);
  activeWorkflow = null;
  currentStepIndex = 0;
  return null;
}

export function getStepIndex(): number {
  return currentStepIndex;
}

export function getTotalSteps(): number {
  return activeWorkflow?.steps.length || 0;
}

export function stopWorkflow(): void {
  if (activeWorkflow) {
    sessionLogger.logSystemEvent(`Workflow stopped: ${activeWorkflow.title}`);
  }
  activeWorkflow = null;
  currentStepIndex = 0;
}

export function getWorkflowContext(): string | null {
  if (!activeWorkflow) return null;
  const step = getCurrentStep();
  if (!step) return null;
  return `[ACTIVE WORKFLOW: "${activeWorkflow.title}"]\nThe student is on step ${step.id} of ${activeWorkflow.steps.length}.\nCurrent step: ${step.instruction}\nDetail: ${step.detail}${step.safetyCheck ? '\nSAFETY: ' + step.safetyCheck : ''}\nGuide the student through this specific step. When they complete it, tell them and move to the next step.`;
}
