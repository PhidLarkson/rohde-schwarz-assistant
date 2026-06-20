import { askGemini, type ChatTurn } from './genai';
import { getContextForQuery } from './rag';
import { getPendingConfirmation, confirmPending, denyPending } from './instrument';
import { sessionLogger } from './session';
import { diagnoseTrace, type DiagnoseResult } from './anomaly';
import { getProgress } from './progress';
import {
  startWorkflow, getActiveWorkflow, getCurrentStep,
  advanceStep, getStepIndex, getTotalSteps, stopWorkflow,
  getWorkflowContext,
} from './workflows';

const BACKEND = 'http://localhost:5001';

// ── DOM ──
const messagesEl = document.getElementById('messages')!;
const inputEl = document.getElementById('input') as HTMLInputElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const confirmBanner = document.getElementById('confirm-bar')!;
const confirmText = document.getElementById('confirm-text')!;
const btnY = document.getElementById('btn-y')!;
const btnN = document.getElementById('btn-n')!;
const scopePanel = document.getElementById('scope-panel')!;
const anomPanel = document.getElementById('anom-panel')!;
const progPanel = document.getElementById('prog-panel')!;
const slogPanel = document.getElementById('slog-panel')!;
const wfStepsEl = document.getElementById('wf-steps')!;
const lblBe = document.getElementById('lbl-be')!;
const dotBe = document.getElementById('dot-be')!;
const lblHw = document.getElementById('lbl-hw')!;
const dotHw = document.getElementById('dot-hw')!;
const btnExport = document.getElementById('btn-export')!;
const btnClear = document.getElementById('btn-clear')!;

// ── State ──
const history: ChatTurn[] = [];
const anomalies: DiagnoseResult[] = [];
let backendOnline = false;
let instrumentMode = 'offline';
let lastScopeState: Record<string, any> | null = null;
let pendingConfirmationId: string | null = null;
let pendingConfirmationPath: string | null = null;
let pendingConfirmationValue: any = null;

// ── Helpers ──
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function now(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function addMsg(role: 'user' | 'assistant' | 'system' | 'tool', text: string, tags?: string[]) {
  const div = document.createElement('div');
  div.className = 'msg';
  const rl = role === 'user' ? 'YOU' : role === 'assistant' ? 'RHODA' : role === 'tool' ? 'INSTR' : 'SYS';
  const tagHtml = (tags || []).map(t => {
    const c = t === 'READ' ? 'tag-read' : t === 'WRITE' ? 'tag-write' : t === 'anomaly' ? 'tag-anomaly' : t === 'rag' ? 'tag-rag' : 'tag-wf';
    return `<span class="tag ${c}">${esc(t)}</span>`;
  }).join('');
  const body = text.replace(/⚠️\s*(.*)/g, '<span class="sf">⚠️ $1</span>');
  div.innerHTML = `<div class="msg-h"><span class="ts">${now()}</span><span class="role role-${role}">${rl}</span>${tagHtml}</div><div class="msg-body">${body}</div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Backend communication ──
async function fetchJSON(url: string, opts?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function probeBackend() {
  try {
    const data = await fetchJSON(`${BACKEND}/api/health`);
    backendOnline = true;
    instrumentMode = data.instrument || 'mock';
    dotBe.className = 'dot dot-on';
    lblBe.textContent = 'backend: online';
    if (instrumentMode === 'mock') {
      dotHw.className = 'dot dot-warn';
      lblHw.textContent = 'instrument: simulator';
    } else {
      dotHw.className = 'dot dot-on';
      lblHw.textContent = `instrument: ${instrumentMode}`;
    }
  } catch {
    backendOnline = false;
    instrumentMode = 'offline';
    dotBe.className = 'dot dot-err';
    lblBe.textContent = 'backend: offline';
    dotHw.className = 'dot dot-off';
    lblHw.textContent = 'instrument: not available';
  }
}

async function fetchScopeState() {
  if (!backendOnline) {
    lastScopeState = null;
    return;
  }
  try {
    const data = await fetchJSON(`${BACKEND}/api/instrument/state?scope=all`);
    if (data.ok) lastScopeState = data.result;
    else lastScopeState = null;
  } catch {
    lastScopeState = null;
  }
}

async function sendInstrumentSet(path: string, value: any, confirmed: boolean, confirmationId?: string): Promise<any> {
  return fetchJSON(`${BACKEND}/api/instrument/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value, confirmed, confirmationId }),
  });
}

async function sendInstrumentConfirm(path: string, value: any, confirmationId: string): Promise<any> {
  return fetchJSON(`${BACKEND}/api/instrument/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value, confirmationId }),
  });
}

async function sendMeasurement(type: string, source?: string): Promise<any> {
  return fetchJSON(`${BACKEND}/api/instrument/measure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measurementType: type, source: source || 'CH1', confirmed: true, confirmationId: 'direct' }),
  });
}

// ── Render panels ──
function renderScope() {
  if (!backendOnline) {
    scopePanel.innerHTML = '<div class="scope-disconnected">backend offline — start server with: python server/app.py</div>';
    return;
  }
  if (!lastScopeState) {
    scopePanel.innerHTML = '<div class="scope-disconnected">no instrument data</div>';
    return;
  }
  const s = lastScopeState;
  const rows: string[] = [];

  function row(k: string, v: string, cls = '') {
    rows.push(`<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);
  }

  if (s.instrument_id) row('id', s.instrument_id.substring(0, 30));
  if (s.acquisition_state) row('acq', s.acquisition_state);
  if (s.timebase_scale != null) row('timebase', fmtTime(s.timebase_scale) + '/div');

  const channels = s.channels || {};
  for (const ch of [1, 2, 3, 4]) {
    const c = channels[ch] || channels[String(ch)];
    if (!c) continue;
    const en = c.enabled === true || c.enabled === 'ON' || c.enabled === '1';
    if (!en && ch > 2) continue;
    row(`CH${ch}`, en ? 'ON' : 'OFF', en ? 'v-on' : 'v-off');
    if (en) {
      row(`CH${ch} scale`, (c.vertical_scale ?? c.scale ?? '?') + ' V/div');
      if (c.coupling) row(`CH${ch} coup`, c.coupling);
    }
  }

  const trig = s.trigger || {};
  if (trig.source) row('trig src', trig.source);
  if (trig.level != null) row('trig lvl', trig.level + ' V');
  if (trig.mode) row('trig mode', trig.mode);
  if (trig.edge) row('trig edge', trig.edge);

  scopePanel.innerHTML = `<div class="sg">${rows.join('')}</div>`;
}

function fmtTime(s: number): string {
  if (s >= 1) return s + ' s';
  if (s >= 0.001) return (s * 1000).toFixed(2) + ' ms';
  if (s >= 0.000001) return (s * 1000000).toFixed(1) + ' µs';
  return (s * 1000000000).toFixed(1) + ' ns';
}

function renderAnomalies() {
  if (anomalies.length === 0) { anomPanel.innerHTML = '<div style="font-size:10px;color:var(--dim)">none</div>'; return; }
  anomPanel.innerHTML = anomalies.slice(-5).reverse().map(a => `
    <div class="anom">
      ${a.unsafe_flag ? '<div class="anom-unsafe">⚠ SAFETY FLAG</div>' : ''}
      <div class="anom-cause">${esc(a.probable_cause)}</div>
      <div class="anom-meta">${(a.confidence * 100).toFixed(0)}% · ${a.fix_steps.length} steps</div>
    </div>`).join('');
}

function renderProgress() {
  const p = getProgress();
  const entries = Object.entries(p.topic_scores);
  if (entries.length === 0) { progPanel.innerHTML = '<div style="font-size:10px;color:var(--dim)">ask questions to build progress</div>'; return; }
  progPanel.innerHTML = entries.map(([n, s]) => `<div class="pr"><div class="pr-l"><span>${esc(n)}</span><span>${s}%</span></div><div class="pr-b"><div class="pr-f" style="width:${Math.min(s as number, 100)}%"></div></div></div>`).join('')
    + `<div style="font-size:9px;color:var(--dim);margin-top:4px">next → ${esc(p.recommended_next_topic)}</div>`;
}

function renderSessionLog() {
  const logs = sessionLogger.getSessionLogs().slice(-40);
  if (logs.length === 0) { slogPanel.innerHTML = '<div style="font-size:9px;color:var(--dim)">empty</div>'; return; }
  slogPanel.innerHTML = logs.map(l => {
    const t = l.timestamp.substring(11, 19);
    const r = l.role[0].toUpperCase();
    const content = l.tool_call ? `${l.tool_call.category} ${l.tool_call.name}` : l.content.substring(0, 50);
    return `<div class="sl"><span class="sl-ts">${t}</span><span class="sl-r sl-r-${r}">${r}</span><span class="sl-c">${esc(content)}</span></div>`;
  }).join('');
  slogPanel.scrollTop = slogPanel.scrollHeight;
}

function renderWorkflow() {
  const wf = getActiveWorkflow();
  if (!wf) { wfStepsEl.innerHTML = ''; return; }
  const idx = getStepIndex();
  wfStepsEl.innerHTML = `<div style="font-size:10px;color:var(--cyan);margin:4px 0 2px">${esc(wf.title)} [${idx + 1}/${getTotalSteps()}]</div>`
    + wf.steps.map((s, i) => {
      const nc = i === idx ? 'act' : '';
      const tc = i < idx ? 'done' : i === idx ? 'act' : '';
      return `<div class="ws"><span class="ws-n ${nc}">${s.id}</span><span class="ws-t ${tc}">${esc(s.instruction)}</span></div>`;
    }).join('');
}

async function refreshAll() {
  await fetchScopeState();
  renderScope();
  renderAnomalies();
  renderProgress();
  renderSessionLog();
  renderWorkflow();
}

// ── Instrument action detection ──
function detectAction(text: string): { path: string; value: any } | null {
  const l = text.toLowerCase();
  if (/timebase|time.?base|time.?div/.test(l)) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*(?:ms|us|µs|ns|s)/);
    if (m) {
      let v = parseFloat(m[1]);
      if (l.includes('ms')) v *= 0.001;
      else if (l.includes('us') || l.includes('µs')) v *= 0.000001;
      else if (l.includes('ns')) v *= 0.000000001;
      return { path: 'timebase.scale', value: v };
    }
  }
  if (/vertical.?scale|v.?div|volts.?per/.test(l)) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*(?:mv|v)/i);
    if (m) {
      let v = parseFloat(m[1]);
      if (/mv/i.test(l)) v *= 0.001;
      const ch = l.match(/ch(?:annel)?\s*(\d)/);
      return { path: `channel.${ch ? ch[1] : '1'}.vertical_scale`, value: v };
    }
  }
  if (/coupling.*(ac|dc)/i.test(l)) {
    const coupling = /\bac\b/i.test(l) ? 'AC' : 'DC';
    const ch = l.match(/ch(?:annel)?\s*(\d)/);
    return { path: `channel.${ch ? ch[1] : '1'}.coupling`, value: coupling };
  }
  if (/trigger.?level/i.test(l)) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*v/i);
    if (m) return { path: 'trigger.level', value: parseFloat(m[1]) };
  }
  if (/trigger.?source/i.test(l)) {
    const m = l.match(/ch(?:annel)?\s*(\d)/i);
    if (m) return { path: 'trigger.source', value: `CH${m[1]}` };
  }
  return null;
}

// ── Send ──
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendBtn.disabled = true;

  addMsg('user', text);
  sessionLogger.logUserInput(text);

  try {
    const lower = text.toLowerCase();

    // Pending confirmation response
    if (pendingConfirmationId) {
      if (/yes|confirm|proceed|go ahead|allow|okay|ok|do it/.test(lower)) {
        const data = await sendInstrumentConfirm(pendingConfirmationPath!, pendingConfirmationValue, pendingConfirmationId);
        hideConfirm();
        addMsg('tool', `confirmed → ${JSON.stringify(data.result)}`, ['WRITE']);
        sessionLogger.logToolCall('set_parameter', { path: pendingConfirmationPath }, 'WRITE', data.result, true);
        pendingConfirmationId = null;
        await refreshAll();
        sendBtn.disabled = false;
        return;
      }
      if (/no|cancel|deny|stop|don't/.test(lower)) {
        hideConfirm();
        addMsg('system', 'action denied');
        pendingConfirmationId = null;
        sendBtn.disabled = false;
        return;
      }
    }

    // Workflow step
    if (/next step|continue|done|move on|proceed/.test(lower) && getActiveWorkflow()) {
      const step = advanceStep();
      if (step) {
        let msg = `[step ${step.id}/${getTotalSteps()}] ${step.instruction}\n${step.detail}`;
        if (step.safetyCheck) msg += `\n⚠️ ${step.safetyCheck}`;
        addMsg('assistant', msg, ['workflow']);
        sessionLogger.logAssistantResponse(msg);
        history.push({ role: 'user', content: text }, { role: 'model', content: msg });

        if (step.instrumentAction && backendOnline) {
          const action = mapWorkflowAction(step.instrumentAction);
          if (action) {
            try {
              const data = await sendInstrumentSet(action.path, action.value, false);
              if (data.needsConfirmation) {
                pendingConfirmationId = data.confirmationId;
                pendingConfirmationPath = action.path;
                pendingConfirmationValue = action.value;
                showConfirm(`${data.summary} — confirm?`);
                addMsg('tool', `preview: ${data.summary}`, ['WRITE']);
              }
            } catch (e) {
              addMsg('system', `instrument error: ${(e as Error).message}`);
            }
          }
        }
      } else {
        addMsg('system', 'workflow complete', ['workflow']);
      }
      await refreshAll();
      sendBtn.disabled = false;
      return;
    }

    // Workflow start
    if (/walk me through|guide me|help me measure|start workflow/.test(lower)) {
      let wfId: string | null = null;
      if (/sine|1.?khz|measure|frequency/.test(lower)) wfId = 'measure-1khz-sine';
      if (/safety|overvoltage|overload|danger/.test(lower)) wfId = 'safety-overvoltage';
      if (wfId) {
        const wf = startWorkflow(wfId);
        if (wf) {
          const step = getCurrentStep()!;
          let msg = `workflow: ${wf.title}\n\n[step 1/${getTotalSteps()}] ${step.instruction}\n${step.detail}`;
          if (step.safetyCheck) msg += `\n⚠️ ${step.safetyCheck}`;
          addMsg('assistant', msg, ['workflow']);
          sessionLogger.logAssistantResponse(msg);
          history.push({ role: 'user', content: text }, { role: 'model', content: msg });
          await refreshAll();
          sendBtn.disabled = false;
          return;
        }
      }
    }

    // Direct instrument command (user types "set timebase to 1ms")
    const directAction = detectAction(text);
    if (directAction && backendOnline) {
      try {
        const data = await sendInstrumentSet(directAction.path, directAction.value, false);
        if (data.needsConfirmation) {
          pendingConfirmationId = data.confirmationId;
          pendingConfirmationPath = directAction.path;
          pendingConfirmationValue = directAction.value;
          showConfirm(`${data.summary} — confirm?`);
          addMsg('tool', `preview: ${data.summary}`, ['WRITE']);
          sessionLogger.logToolCall('set_parameter', directAction, 'WRITE');
        } else if (data.ok) {
          addMsg('tool', `set ${directAction.path} = ${directAction.value}`, ['WRITE']);
        }
        await refreshAll();
        sendBtn.disabled = false;
        // Still send to Gemini for a natural language response
      } catch (e) {
        addMsg('system', `instrument error: ${(e as Error).message}`);
      }
    }

    // Anomaly detection
    if (/noise|noisy|clip|clipped|unstable|drift|alias|wrong|broken|fault|problem|issue|diagnos|overvoltage|overload/.test(lower)) {
      const diag = await diagnoseTrace({ description: text });
      anomalies.push(diag);
      let msg = diag.probable_cause;
      if (diag.unsafe_flag) msg = '⚠️ SAFETY: ' + msg;
      msg += '\n\nfix steps:';
      diag.fix_steps.forEach((s, i) => { msg += `\n  ${i + 1}. ${s}`; });
      msg += `\n\nconfidence: ${(diag.confidence * 100).toFixed(0)}%`;
      addMsg('assistant', msg, ['anomaly']);
      sessionLogger.logAssistantResponse(msg, 'troubleshooting');
      history.push({ role: 'user', content: text }, { role: 'model', content: msg });
      await refreshAll();
      sendBtn.disabled = false;
      return;
    }

    // RAG + Gemini
    const ragCtx = getContextForQuery(text);
    if (ragCtx) addMsg('system', `${ragCtx.split('---').length} context chunks retrieved`, ['rag']);

    const scopeStr = lastScopeState ? JSON.stringify(lastScopeState, null, 1) : 'instrument not connected';
    const wfCtx = getWorkflowContext() || undefined;
    const response = await askGemini(text, ragCtx, scopeStr, history, wfCtx);

    addMsg('assistant', response);
    sessionLogger.logAssistantResponse(response);
    history.push({ role: 'user', content: text }, { role: 'model', content: response });
    if (history.length > 40) history.splice(0, history.length - 40);

    // Check if Gemini's response implies an instrument change
    if (backendOnline) {
      const implied = detectAction(response);
      if (implied) {
        try {
          const data = await sendInstrumentSet(implied.path, implied.value, false);
          if (data.needsConfirmation) {
            pendingConfirmationId = data.confirmationId;
            pendingConfirmationPath = implied.path;
            pendingConfirmationValue = implied.value;
            showConfirm(`${data.summary} — confirm?`);
            addMsg('tool', `rhoda suggests: ${data.summary}`, ['WRITE']);
          }
        } catch {}
      }
    }

    await refreshAll();
  } catch (err) {
    addMsg('system', `error: ${(err as Error).message}`);
  }
  sendBtn.disabled = false;
  inputEl.focus();
}

function mapWorkflowAction(action: { name: string; params: Record<string, unknown> }): { path: string; value: any } | null {
  const p = action.params;
  switch (action.name) {
    case 'set_timebase': return { path: 'timebase.scale', value: p.timebase_s_div };
    case 'set_vertical_scale': return { path: `channel.${p.channel || 1}.vertical_scale`, value: p.scale_v_div };
    case 'set_channel_coupling': return { path: `channel.${p.channel || 1}.coupling`, value: p.coupling };
    case 'set_channel_enabled': return { path: `channel.${p.channel || 1}.enabled`, value: p.enabled };
    case 'set_probe_attenuation': return { path: `channel.${p.channel || 1}.probe_attenuation`, value: p.attenuation };
    case 'set_trigger': {
      if (p.level_v != null) return { path: 'trigger.level', value: p.level_v };
      if (p.source != null) return { path: 'trigger.source', value: `CH${p.source}` };
      if (p.mode != null) return { path: 'trigger.mode', value: p.mode };
      if (p.slope != null) return { path: 'trigger.edge', value: p.slope };
      return null;
    }
    case 'get_measurement': return null;
    default: return null;
  }
}

function showConfirm(t: string) { confirmText.textContent = t; confirmBanner.classList.add('active'); }
function hideConfirm() { confirmBanner.classList.remove('active'); }

// ── Events ──
sendBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });

btnY.addEventListener('click', async () => {
  if (!pendingConfirmationId) return;
  try {
    const data = await sendInstrumentConfirm(pendingConfirmationPath!, pendingConfirmationValue, pendingConfirmationId);
    hideConfirm();
    addMsg('tool', `confirmed → ${JSON.stringify(data.result)}`, ['WRITE']);
    sessionLogger.logToolCall('set_parameter', { path: pendingConfirmationPath }, 'WRITE', data.result, true);
    pendingConfirmationId = null;
    await refreshAll();
  } catch (e) {
    addMsg('system', `confirm failed: ${(e as Error).message}`);
  }
});

btnN.addEventListener('click', () => { hideConfirm(); pendingConfirmationId = null; addMsg('system', 'action denied'); });

btnExport.addEventListener('click', () => {
  const blob = new Blob([sessionLogger.exportJSON()], { type: 'application/json' });
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
  pendingConfirmationId = null;
  messagesEl.innerHTML = '';
  hideConfirm();
  refreshAll();
  addMsg('system', `session started: ${sessionLogger.getSessionId()}`);
});

document.querySelectorAll('.wf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.wf;
    if (!id) return;
    const wf = startWorkflow(id);
    if (!wf) return;
    const step = getCurrentStep()!;
    let msg = `workflow: ${wf.title}\n\n[step 1/${getTotalSteps()}] ${step.instruction}\n${step.detail}`;
    if (step.safetyCheck) msg += `\n⚠️ ${step.safetyCheck}`;
    addMsg('assistant', msg, ['workflow']);
    sessionLogger.logAssistantResponse(msg);
    refreshAll();
  });
});

document.querySelectorAll('.psec h3').forEach(h => {
  h.addEventListener('click', () => h.parentElement!.classList.toggle('collapsed'));
});

// ── Init ──
(async () => {
  // Restore previous session
  const prev = sessionLogger.getSessionLogs();
  for (const l of prev) {
    if (l.role === 'user') addMsg('user', l.content);
    else if (l.role === 'assistant') {
      const tags: string[] = [];
      if (l.topic === 'troubleshooting') tags.push('anomaly');
      addMsg('assistant', l.content, tags);
    } else if (l.role === 'tool' && l.tool_call) {
      addMsg('tool', `${l.tool_call.category} ${l.tool_call.name}`, [l.tool_call.category]);
    }
  }
  if (prev.length > 0) {
    addMsg('system', `restored ${prev.length} events from previous session`);
    for (const l of prev) {
      if (l.role === 'user') history.push({ role: 'user', content: l.content });
      if (l.role === 'assistant') history.push({ role: 'model', content: l.content });
    }
    if (history.length > 40) history.splice(0, history.length - 40);
  }

  await probeBackend();
  await refreshAll();

  if (!backendOnline) {
    addMsg('system', 'backend offline — start with: python server/app.py');
  } else {
    addMsg('system', `connected to backend (${instrumentMode})`);
  }
  inputEl.focus();
})();
