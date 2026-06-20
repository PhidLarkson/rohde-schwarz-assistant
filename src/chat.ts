import { askGemini, type ChatTurn } from './genai';
import { getContextForQuery } from './rag';
import {
  executeFunction, getInstrumentState, getPendingConfirmation,
  confirmPending, denyPending, readStateRemote,
} from './instrument';
import { sessionLogger } from './session';
import { diagnoseTrace, type DiagnoseResult } from './anomaly';
import { getProgress } from './progress';
import {
  startWorkflow, getActiveWorkflow, getCurrentStep,
  advanceStep, getStepIndex, getTotalSteps, stopWorkflow,
  getWorkflowContext, getAvailableWorkflows,
} from './workflows';

// ── DOM refs ──
const messagesEl = document.getElementById('messages')!;
const inputEl = document.getElementById('input') as HTMLInputElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const confirmBanner = document.getElementById('confirm-banner')!;
const confirmText = document.getElementById('confirm-text')!;
const btnY = document.getElementById('btn-y')!;
const btnN = document.getElementById('btn-n')!;
const scopeStateEl = document.getElementById('scope-state')!;
const anomalyLogEl = document.getElementById('anomaly-log')!;
const progressEl = document.getElementById('progress')!;
const sessionLogEl = document.getElementById('session-log')!;
const wfStepsEl = document.getElementById('wf-steps')!;
const sessionLabelEl = document.getElementById('session-label')!;
const scopeLabelEl = document.getElementById('scope-label')!;
const dotScope = document.getElementById('dot-scope')!;
const btnExport = document.getElementById('btn-export')!;
const btnClear = document.getElementById('btn-clear')!;

// ── State ──
const history: ChatTurn[] = [];
const anomalies: DiagnoseResult[] = [];
let backendOnline = false;

// ── Helpers ──
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function addMsg(role: 'user' | 'assistant' | 'system' | 'tool', text: string, tags?: string[]) {
  const div = document.createElement('div');
  div.className = 'msg';
  const roleClass = `role-${role}`;
  const roleLabel = role === 'user' ? 'YOU' : role === 'assistant' ? 'RHODA' : role === 'tool' ? 'TOOL' : 'SYS';
  const tagHtml = (tags || []).map(t => {
    const cls = t === 'READ' ? 'tag-read' : t === 'WRITE' ? 'tag-write' : t === 'anomaly' ? 'tag-anomaly' : t === 'rag' ? 'tag-rag' : t === 'workflow' ? 'tag-workflow' : 'tag-read';
    return `<span class="msg-tag ${cls}">${esc(t)}</span>`;
  }).join('');

  const processed = text.replace(/⚠️\s*(.*)/g, '<span class="safety">⚠️ $1</span>');

  div.innerHTML = `
    <div class="msg-header">
      <span class="ts">${ts()}</span>
      <span class="role ${roleClass}">${roleLabel}</span>${tagHtml}
    </div>
    <div class="msg-body">${processed}</div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showConfirm(prompt: string) {
  confirmText.textContent = prompt;
  confirmBanner.classList.add('active');
}

function hideConfirm() {
  confirmBanner.classList.remove('active');
}

// ── Instrument panel ──
function renderScopeState() {
  const s = getInstrumentState();
  const ch1 = s.channels[1];
  const ch2 = s.channels[2];
  const onOff = (v: boolean) => v ? '<span class="v v-on">ON</span>' : '<span class="v v-off">OFF</span>';

  scopeStateEl.innerHTML = `
    <span class="k">CH1</span>${onOff(ch1.enabled)}
    <span class="k">CH1 scale</span><span class="v">${ch1.scale_v_div} V/div</span>
    <span class="k">CH1 coupling</span><span class="v">${ch1.coupling}</span>
    <span class="k">CH1 probe</span><span class="v">${ch1.probe_attenuation}</span>
    <span class="k">CH2</span>${onOff(ch2.enabled)}
    <span class="k">timebase</span><span class="v">${fmtTime(s.horizontal.timebase_s_div)}/div</span>
    <span class="k">trigger</span><span class="v">CH${s.trigger.source} ${s.trigger.slope}</span>
    <span class="k">trig mode</span><span class="v">${s.trigger.mode}</span>
    <span class="k">trig level</span><span class="v">${s.trigger.level_v} V</span>
    <span class="k">freq</span><span class="v">${s.measurement.frequency_hz != null ? s.measurement.frequency_hz + ' Hz' : '—'}</span>
    <span class="k">Vpp</span><span class="v">${s.measurement.vpp_v != null ? s.measurement.vpp_v + ' V' : '—'}</span>
    <span class="k">Vrms</span><span class="v">${s.measurement.vrms_v != null ? s.measurement.vrms_v + ' V' : '—'}</span>
  `;
}

function fmtTime(s: number): string {
  if (s >= 1) return s + ' s';
  if (s >= 0.001) return (s * 1000).toFixed(1) + ' ms';
  if (s >= 0.000001) return (s * 1000000).toFixed(1) + ' µs';
  return (s * 1000000000).toFixed(1) + ' ns';
}

// ── Anomaly panel ──
function renderAnomalies() {
  if (anomalies.length === 0) {
    anomalyLogEl.innerHTML = '<div style="font-size:10px;color:var(--dim)">no anomalies detected</div>';
    return;
  }
  anomalyLogEl.innerHTML = anomalies.slice(-5).reverse().map(a => `
    <div class="anomaly-entry">
      ${a.unsafe_flag ? '<div class="anomaly-unsafe">⚠ SAFETY FLAG</div>' : ''}
      <div class="anomaly-cause">${esc(a.probable_cause)}</div>
      <div class="anomaly-conf">${(a.confidence * 100).toFixed(0)}% confidence · ${a.fix_steps.length} fix steps</div>
    </div>
  `).join('');
}

// ── Progress panel ──
function renderProgress() {
  const p = getProgress();
  const scores = p.topic_scores;
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    progressEl.innerHTML = '<div style="font-size:10px;color:var(--dim)">no data yet — start asking questions</div>';
    return;
  }
  progressEl.innerHTML = entries.map(([name, score]) => `
    <div class="prog-row">
      <div class="prog-label"><span>${esc(name)}</span><span>${score}%</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${Math.min(score as number, 100)}%"></div></div>
    </div>
  `).join('') + `<div style="font-size:10px;color:var(--dim);margin-top:6px">next: ${esc(p.recommended_next_topic)}</div>`;
}

// ── Session log panel ──
function renderSessionLog() {
  const logs = sessionLogger.getSessionLogs().slice(-30);
  if (logs.length === 0) {
    sessionLogEl.innerHTML = '<div style="font-size:10px;color:var(--dim)">empty</div>';
    return;
  }
  sessionLogEl.innerHTML = logs.map(l => {
    const t = l.timestamp.substring(11, 19);
    const r = l.role[0].toUpperCase();
    const cls = `slog-role-${r}`;
    const content = l.tool_call ? `${l.tool_call.category} ${l.tool_call.name}` : l.content.substring(0, 60);
    return `<div class="slog"><span class="slog-ts">${t}</span><span class="slog-role ${cls}">${r}</span><span class="slog-content">${esc(content)}</span></div>`;
  }).join('');
  sessionLogEl.scrollTop = sessionLogEl.scrollHeight;
}

// ── Workflow panel ──
function renderWorkflow() {
  const wf = getActiveWorkflow();
  if (!wf) {
    wfStepsEl.innerHTML = '';
    return;
  }
  const idx = getStepIndex();
  const total = getTotalSteps();
  wfStepsEl.innerHTML = `<div style="font-size:10px;color:var(--cyan);margin:6px 0 4px">${esc(wf.title)} (${idx + 1}/${total})</div>` +
    wf.steps.map((s, i) => {
      const numCls = i === idx ? 'active' : '';
      const txtCls = i < idx ? 'done' : i === idx ? 'active' : '';
      return `<div class="wf-step"><span class="wf-num ${numCls}">${s.id}</span><span class="wf-text ${txtCls}">${esc(s.instruction)}</span></div>`;
    }).join('');
}

// ── Backend probe ──
async function probeBackend() {
  try {
    const r = await fetch('http://localhost:5001/api/health', { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const data = await r.json();
      backendOnline = true;
      const mode = data.instrument || 'mock';
      dotScope.className = mode === 'mock' ? 'dot dot-warn' : 'dot dot-on';
      scopeLabelEl.textContent = `scope: ${mode}`;
      return;
    }
  } catch {}
  backendOnline = false;
  dotScope.className = 'dot dot-off';
  scopeLabelEl.textContent = 'scope: local mock';
}

// ── Instrument action detection ──
function detectAction(text: string): { name: string; params: Record<string, unknown> } | null {
  const l = text.toLowerCase();
  if (/timebase|time.?base|time.?div/.test(l)) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*(?:ms|us|µs|ns|s)/);
    if (m) {
      let v = parseFloat(m[1]);
      if (l.includes('ms')) v *= 0.001;
      else if (l.includes('us') || l.includes('µs')) v *= 0.000001;
      else if (l.includes('ns')) v *= 0.000000001;
      return { name: 'set_timebase', params: { timebase_s_div: v } };
    }
  }
  if (/vertical.?scale|v.?div|volts.?per/.test(l)) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*(?:mv|v)/);
    if (m) {
      let v = parseFloat(m[1]);
      if (l.includes('mv')) v *= 0.001;
      const ch = l.match(/ch(?:annel)?\s*(\d)/);
      return { name: 'set_vertical_scale', params: { channel: ch ? parseInt(ch[1]) : 1, scale_v_div: v } };
    }
  }
  if (/coupling.*(ac|dc)/i.test(l)) {
    const coupling = /ac/i.test(l) ? 'AC' : 'DC';
    const ch = l.match(/ch(?:annel)?\s*(\d)/);
    return { name: 'set_channel_coupling', params: { channel: ch ? parseInt(ch[1]) : 1, coupling } };
  }
  if (/autoset|auto.?set/.test(l)) return { name: 'run_autoset', params: {} };
  return null;
}

// ── Main send handler ──
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendBtn.disabled = true;

  addMsg('user', text);
  sessionLogger.logUserInput(text);

  try {
    const lower = text.toLowerCase();

    // Confirmation responses
    const pending = getPendingConfirmation();
    if (pending) {
      if (/yes|confirm|proceed|go ahead|allow|okay|ok|do it/.test(lower)) {
        const r = confirmPending();
        hideConfirm();
        const msg = `parameter set: ${JSON.stringify(r.result)}`;
        addMsg('tool', msg, ['WRITE']);
        sessionLogger.logAssistantResponse(msg);
        history.push({ role: 'user', content: text }, { role: 'model', content: msg });
        refreshAll();
        sendBtn.disabled = false;
        return;
      }
      if (/no|cancel|deny|stop|don't/.test(lower)) {
        denyPending();
        hideConfirm();
        addMsg('system', 'action denied by user');
        history.push({ role: 'user', content: text }, { role: 'model', content: 'action denied' });
        sendBtn.disabled = false;
        return;
      }
    }

    // Workflow step advancement
    if (/next step|continue|done|move on|proceed/.test(lower) && getActiveWorkflow()) {
      const nextStep = advanceStep();
      if (nextStep) {
        let msg = `[step ${nextStep.id}/${getTotalSteps()}] ${nextStep.instruction}\n${nextStep.detail}`;
        if (nextStep.safetyCheck) msg += `\n⚠️ ${nextStep.safetyCheck}`;
        addMsg('assistant', msg, ['workflow']);
        sessionLogger.logAssistantResponse(msg);
        history.push({ role: 'user', content: text }, { role: 'model', content: msg });

        if (nextStep.instrumentAction) {
          const r = executeFunction({ ...nextStep.instrumentAction, confirmed: false });
          if (r.status === 'confirmation_required') {
            showConfirm(r.confirmation_prompt || 'confirm instrument change?');
            addMsg('tool', `pending: ${r.confirmation_prompt}`, ['WRITE']);
          }
        }
      } else {
        addMsg('system', `workflow complete: ${getActiveWorkflow()?.title || 'done'}`, ['workflow']);
      }
      refreshAll();
      sendBtn.disabled = false;
      return;
    }

    // Workflow start trigger
    if (/walk me through|guide me|help me measure|start workflow/.test(lower)) {
      let wfId: string | null = null;
      if (/sine|1.?khz|measure|frequency/.test(lower)) wfId = 'measure-1khz-sine';
      if (/safety|overvoltage|overload|danger/.test(lower)) wfId = 'safety-overvoltage';
      if (wfId) {
        const wf = startWorkflow(wfId);
        if (wf) {
          const step = getCurrentStep()!;
          let msg = `starting workflow: ${wf.title}\n\n[step 1/${getTotalSteps()}] ${step.instruction}\n${step.detail}`;
          if (step.safetyCheck) msg += `\n⚠️ ${step.safetyCheck}`;
          addMsg('assistant', msg, ['workflow']);
          sessionLogger.logAssistantResponse(msg);
          history.push({ role: 'user', content: text }, { role: 'model', content: msg });
          refreshAll();
          sendBtn.disabled = false;
          return;
        }
      }
    }

    // Anomaly detection
    if (/noise|noisy|clip|clipped|unstable|drift|alias|wrong|broken|fault|problem|issue|diagnos|overvoltage|overload/.test(lower)) {
      addMsg('system', 'running anomaly detection...', ['anomaly']);
      const diag = await diagnoseTrace({ description: text });
      anomalies.push(diag);

      let msg = diag.probable_cause;
      if (diag.unsafe_flag) msg = '⚠️ SAFETY CONCERN: ' + msg;
      msg += '\n\nfix steps:';
      diag.fix_steps.forEach((s, i) => { msg += `\n  ${i + 1}. ${s}`; });
      msg += `\n\nconfidence: ${(diag.confidence * 100).toFixed(0)}%`;

      addMsg('assistant', msg, ['anomaly']);
      sessionLogger.logAssistantResponse(msg, 'troubleshooting');
      history.push({ role: 'user', content: text }, { role: 'model', content: msg });
      refreshAll();
      sendBtn.disabled = false;
      return;
    }

    // Standard RAG + LLM flow
    const ragContext = getContextForQuery(text);
    if (ragContext) {
      addMsg('system', `retrieved ${ragContext.split('---').length} context chunks`, ['rag']);
    }

    const instrState = JSON.stringify(getInstrumentState(), null, 1);
    const wfContext = getWorkflowContext() || undefined;
    const response = await askGemini(text, ragContext, instrState, history, wfContext);

    addMsg('assistant', response);
    sessionLogger.logAssistantResponse(response);
    history.push({ role: 'user', content: text }, { role: 'model', content: response });
    if (history.length > 40) history.splice(0, history.length - 40);

    // Check for instrument action in response
    const writeMatch = response.match(/(?:set|change|adjust|switch|enable|disable|configure)\s+(?:the\s+)?(\w[\w\s]*?)(?:\s+to\s+|\s+from\s+)/i);
    if (writeMatch) {
      const action = detectAction(response);
      if (action) {
        const r = executeFunction(action);
        if (r.status === 'confirmation_required') {
          showConfirm(r.confirmation_prompt || 'confirm instrument change?');
          addMsg('tool', `pending: ${r.confirmation_prompt}`, ['WRITE']);
        }
      }
    }

    refreshAll();
  } catch (err) {
    addMsg('system', `error: ${(err as Error).message}`);
  }
  sendBtn.disabled = false;
  inputEl.focus();
}

function refreshAll() {
  renderScopeState();
  renderAnomalies();
  renderProgress();
  renderSessionLog();
  renderWorkflow();
}

// ── Event wiring ──
sendBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

btnY.addEventListener('click', () => {
  const r = confirmPending();
  hideConfirm();
  addMsg('tool', `confirmed: ${JSON.stringify(r.result)}`, ['WRITE']);
  sessionLogger.logAssistantResponse(`confirmed: ${JSON.stringify(r.result)}`);
  refreshAll();
});

btnN.addEventListener('click', () => {
  denyPending();
  hideConfirm();
  addMsg('system', 'action denied');
  refreshAll();
});

btnExport.addEventListener('click', () => {
  const json = sessionLogger.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rhoda-${sessionLogger.getSessionId()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

btnClear.addEventListener('click', () => {
  sessionLogger.resetSession();
  history.length = 0;
  anomalies.length = 0;
  stopWorkflow();
  messagesEl.innerHTML = '';
  refreshAll();
  addMsg('system', `new session: ${sessionLogger.getSessionId()}`);
});

document.querySelectorAll('.wf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.wf;
    if (!id) return;
    const wf = startWorkflow(id);
    if (!wf) return;
    const step = getCurrentStep()!;
    let msg = `starting workflow: ${wf.title}\n\n[step 1/${getTotalSteps()}] ${step.instruction}\n${step.detail}`;
    if (step.safetyCheck) msg += `\n⚠️ ${step.safetyCheck}`;
    addMsg('assistant', msg, ['workflow']);
    sessionLogger.logAssistantResponse(msg);
    refreshAll();
  });
});

// Section collapse toggle
document.querySelectorAll('.panel-section h3').forEach(h => {
  h.addEventListener('click', () => {
    h.parentElement!.classList.toggle('collapsed');
  });
});

// ── Init ──
sessionLabelEl.textContent = `session: ${sessionLogger.getSessionId().slice(-8)}`;

// Load previous conversation from session storage
const prevLogs = sessionLogger.getSessionLogs();
for (const l of prevLogs) {
  if (l.role === 'user') {
    addMsg('user', l.content);
  } else if (l.role === 'assistant') {
    const tags: string[] = [];
    if (l.topic === 'troubleshooting') tags.push('anomaly');
    if (l.tool_call) tags.push(l.tool_call.category);
    addMsg('assistant', l.content, tags);
  } else if (l.role === 'tool' && l.tool_call) {
    addMsg('tool', `${l.tool_call.category} ${l.tool_call.name}`, [l.tool_call.category]);
  }
}

if (prevLogs.length > 0) {
  addMsg('system', `restored ${prevLogs.length} events from previous session`);
  // Rebuild history for Gemini context
  for (const l of prevLogs) {
    if (l.role === 'user') history.push({ role: 'user', content: l.content });
    if (l.role === 'assistant') history.push({ role: 'model', content: l.content });
  }
  if (history.length > 40) history.splice(0, history.length - 40);
}

probeBackend();
refreshAll();
inputEl.focus();
