import { askGemini, type ChatTurn } from './genai';
import { getContextForQuery } from './rag';
import {
  executeFunction, getInstrumentState, getPendingConfirmation,
  confirmPending, denyPending, getFunctionDescriptions,
} from './instrument';
import { sessionLogger } from './session';
import { diagnoseTrace } from './anomaly';
import { getProgress } from './progress';
import {
  getAvailableWorkflows, startWorkflow, getActiveWorkflow,
  getCurrentStep, advanceStep, getStepIndex, getTotalSteps,
  stopWorkflow, getWorkflowContext,
} from './workflows';

const messagesEl = document.getElementById('messages')!;
const inputEl = document.getElementById('chat-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const confirmBar = document.getElementById('confirm-bar')!;
const confirmText = document.getElementById('confirm-text')!;
const confirmYes = document.getElementById('btn-confirm-yes')!;
const confirmNo = document.getElementById('btn-confirm-no')!;
const workflowStatus = document.getElementById('workflow-status')!;
const instrumentStateEl = document.getElementById('instrument-state')!;
const progressBarsEl = document.getElementById('progress-bars')!;
const exportBtn = document.getElementById('btn-export')!;

const history: ChatTurn[] = [];

function addMessage(role: 'user' | 'assistant' | 'system', text: string) {
  const div = document.createElement('div');
  div.className = `message msg-${role}`;

  const avatarText = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚠️';
  const roleName = role === 'user' ? 'You' : role === 'assistant' ? 'Rhoda' : 'System';

  div.innerHTML = `
    <div class="msg-avatar">${avatarText}</div>
    <div class="msg-content">
      <div class="msg-role">${roleName}</div>
      ${text.split('\n').map(p => `<p>${escapeHtml(p)}</p>`).join('')}
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showConfirmation(prompt: string) {
  confirmText.textContent = prompt;
  confirmBar.classList.add('visible');
}

function hideConfirmation() {
  confirmBar.classList.remove('visible');
}

function updateInstrumentPanel() {
  const state = getInstrumentState();
  const ch1 = state.channels[1];
  instrumentStateEl.innerHTML = `
    <div class="state-row"><span class="state-label">CH1</span><span class="state-value">${ch1.enabled ? 'ON' : 'OFF'} ${ch1.coupling} ${ch1.scale_v_div}V/div</span></div>
    <div class="state-row"><span class="state-label">Timebase</span><span class="state-value">${(state.horizontal.timebase_s_div * 1000).toFixed(2)} ms/div</span></div>
    <div class="state-row"><span class="state-label">Trigger</span><span class="state-value">CH${state.trigger.source} ${state.trigger.slope} ${state.trigger.mode}</span></div>
    <div class="state-row"><span class="state-label">Freq</span><span class="state-value">${state.measurement.frequency_hz ?? '—'} Hz</span></div>
    <div class="state-row"><span class="state-label">Vpp</span><span class="state-value">${state.measurement.vpp_v ?? '—'} V</span></div>
  `;
}

function updateProgress() {
  const progress = getProgress();
  const scores = progress.topic_scores;
  const topics = Object.entries(scores);

  if (topics.length === 0) {
    progressBarsEl.innerHTML = '<p style="font-size:11px;color:var(--muted)">Start a conversation to track progress.</p>';
    return;
  }

  progressBarsEl.innerHTML = topics.map(([name, score]) => `
    <div class="topic-bar">
      <div class="label"><span>${name}</span><span>${score}%</span></div>
      <div class="bar"><div class="fill" style="width:${Math.min(score, 100)}%"></div></div>
    </div>
  `).join('');
}

function updateWorkflowStatus() {
  const wf = getActiveWorkflow();
  if (!wf) {
    workflowStatus.textContent = '';
    return;
  }
  workflowStatus.textContent = `📋 ${wf.title} — Step ${getStepIndex() + 1}/${getTotalSteps()}`;
}

async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  sendBtn.disabled = true;
  addMessage('user', text);
  sessionLogger.logUserInput(text);

  try {
    // Check for confirmation responses
    const pending = getPendingConfirmation();
    if (pending) {
      const lower = text.toLowerCase();
      if (/yes|confirm|proceed|go ahead|allow|okay|ok|do it/.test(lower)) {
        const result = confirmPending();
        hideConfirmation();
        const msg = `Done. ${JSON.stringify(result.result)}`;
        addMessage('assistant', msg);
        sessionLogger.logAssistantResponse(msg);
        history.push({ role: 'user', content: text }, { role: 'model', content: msg });
        updateInstrumentPanel();
        sendBtn.disabled = false;
        return;
      } else if (/no|cancel|deny|stop|don't/.test(lower)) {
        denyPending();
        hideConfirmation();
        const msg = 'Alright, I cancelled that action.';
        addMessage('assistant', msg);
        sessionLogger.logAssistantResponse(msg);
        history.push({ role: 'user', content: text }, { role: 'model', content: msg });
        sendBtn.disabled = false;
        return;
      }
    }

    // Check for workflow commands
    const lowerText = text.toLowerCase();
    if (lowerText.includes('next step') || lowerText.includes('continue') || lowerText.includes('done with this step')) {
      const wf = getActiveWorkflow();
      if (wf) {
        const nextStep = advanceStep();
        if (nextStep) {
          const msg = `Step ${nextStep.id} of ${getTotalSteps()}: ${nextStep.instruction}\n\n${nextStep.detail}${nextStep.safetyCheck ? '\n\n⚠️ Safety: ' + nextStep.safetyCheck : ''}`;
          addMessage('assistant', msg);
          sessionLogger.logAssistantResponse(msg);
          history.push({ role: 'user', content: text }, { role: 'model', content: msg });

          if (nextStep.instrumentAction) {
            const result = executeFunction({ ...nextStep.instrumentAction, confirmed: false });
            if (result.status === 'confirmation_required') {
              showConfirmation(result.confirmation_prompt || 'Confirm this instrument change?');
            }
          }
        } else {
          const msg = `Workflow "${wf.title}" completed! All steps done.`;
          addMessage('system', msg);
          sessionLogger.logSystemEvent(msg);
        }
        updateWorkflowStatus();
        updateInstrumentPanel();
        sendBtn.disabled = false;
        return;
      }
    }

    // Check for anomaly/troubleshooting
    if (/noise|noisy|clip|unstable|drift|alias|wrong|broken|fault|problem|issue|diagnos/.test(lowerText)) {
      const diagnosis = await diagnoseTrace({ description: text });
      let msg = `Diagnosis: ${diagnosis.probable_cause}\n\nFix steps:\n`;
      msg += diagnosis.fix_steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      if (diagnosis.unsafe_flag) msg = '⚠️ SAFETY CONCERN\n\n' + msg;
      addMessage('assistant', msg);
      sessionLogger.logAssistantResponse(msg, 'troubleshooting');
      history.push({ role: 'user', content: text }, { role: 'model', content: msg });
      sendBtn.disabled = false;
      return;
    }

    // RAG + instrument state + Gemini
    const ragContext = getContextForQuery(text);
    const instrState = JSON.stringify(getInstrumentState(), null, 1);
    const wfContext = getWorkflowContext() || undefined;

    const response = await askGemini(text, ragContext, instrState, history, wfContext);
    addMessage('assistant', response);
    sessionLogger.logAssistantResponse(response);
    history.push({ role: 'user', content: text }, { role: 'model', content: response });
    if (history.length > 40) history.splice(0, history.length - 40);

    // Check if response implies a WRITE action
    const writeMatch = response.match(/(?:set|change|adjust|switch|enable|disable|configure)\s+(?:the\s+)?(\w[\w\s]*?)(?:\s+to\s+|\s+from\s+)/i);
    if (writeMatch) {
      const action = detectInstrumentAction(response);
      if (action) {
        const result = executeFunction(action);
        if (result.status === 'confirmation_required') {
          showConfirmation(result.confirmation_prompt || 'Confirm this instrument change?');
        }
      }
    }

    updateInstrumentPanel();
    updateProgress();
    updateWorkflowStatus();
  } catch (err) {
    addMessage('system', `Error: ${(err as Error).message}`);
  }
  sendBtn.disabled = false;
  inputEl.focus();
}

function detectInstrumentAction(response: string): { name: string; params: Record<string, unknown> } | null {
  const lower = response.toLowerCase();
  if (/timebase|time.?base|time.?div/.test(lower)) {
    const numMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:ms|us|µs|ns|s)/);
    if (numMatch) {
      let val = parseFloat(numMatch[1]);
      if (lower.includes('ms')) val *= 0.001;
      else if (lower.includes('us') || lower.includes('µs')) val *= 0.000001;
      else if (lower.includes('ns')) val *= 0.000000001;
      return { name: 'set_timebase', params: { timebase_s_div: val } };
    }
  }
  if (/vertical.?scale|v.?div|volts.?per/.test(lower)) {
    const numMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mv|v)/);
    if (numMatch) {
      let val = parseFloat(numMatch[1]);
      if (lower.includes('mv')) val *= 0.001;
      const chMatch = lower.match(/ch(?:annel)?\s*(\d)/);
      return { name: 'set_vertical_scale', params: { channel: chMatch ? parseInt(chMatch[1]) : 1, scale_v_div: val } };
    }
  }
  if (/coupling.*(ac|dc)/i.test(lower)) {
    const coupling = /ac/i.test(lower) ? 'AC' : 'DC';
    const chMatch = lower.match(/ch(?:annel)?\s*(\d)/);
    return { name: 'set_channel_coupling', params: { channel: chMatch ? parseInt(chMatch[1]) : 1, coupling } };
  }
  if (/autoset|auto.?set/.test(lower)) {
    return { name: 'run_autoset', params: {} };
  }
  return null;
}

// Event listeners
sendBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

confirmYes.addEventListener('click', () => {
  const result = confirmPending();
  hideConfirmation();
  const msg = `Confirmed. ${JSON.stringify(result.result)}`;
  addMessage('assistant', msg);
  sessionLogger.logAssistantResponse(msg);
  updateInstrumentPanel();
});

confirmNo.addEventListener('click', () => {
  denyPending();
  hideConfirmation();
  addMessage('assistant', 'Action cancelled.');
  sessionLogger.logAssistantResponse('Action cancelled.');
});

// Workflow buttons
document.querySelectorAll('.workflow-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.workflow;
    if (!id) return;
    const wf = startWorkflow(id);
    if (!wf) return;

    addMessage('system', `Starting workflow: ${wf.title}\n${wf.description}`);
    const step = getCurrentStep();
    if (step) {
      const msg = `Step ${step.id} of ${getTotalSteps()}: ${step.instruction}\n\n${step.detail}${step.safetyCheck ? '\n\n⚠️ Safety: ' + step.safetyCheck : ''}`;
      addMessage('assistant', msg);
      sessionLogger.logAssistantResponse(msg);
    }
    updateWorkflowStatus();
  });
});

// Export transcript
exportBtn.addEventListener('click', () => {
  const json = sessionLogger.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rhoda-transcript-${sessionLogger.getSessionId()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Init
updateInstrumentPanel();
updateProgress();
addMessage('assistant', 'Hello! I\'m Rhoda, your virtual lab assistant for Rohde & Schwarz oscilloscopes. Ask me about measurement procedures, safety guidelines, or troubleshooting — or start a guided workflow from the sidebar.');
inputEl.focus();
