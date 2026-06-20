/**
 * Conversation Logging (Core 4c)
 * Append-only session log. Every turn, tool call, and confirmation event is recorded.
 * Storage: in-memory + localStorage persistence. No PII beyond session/learner ID.
 *
 * Contract:
 *   LOG_EVENT { session_id, turn_id, role, content, tool_call?, confirmed?, timestamp }
 *   → { ack: true }
 */

export interface LogEvent {
  session_id: string;
  turn_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call?: {
    name: string;
    params: Record<string, unknown>;
    category: 'READ' | 'WRITE';
    result?: unknown;
  };
  confirmed?: boolean;
  topic?: string;
  timestamp: string;
}

export interface SessionSummary {
  session_id: string;
  start_time: string;
  turn_count: number;
  topics_covered: string[];
  tool_calls_made: number;
  confirmations_requested: number;
}

const STORAGE_KEY = 'rhoda_session_logs';

class SessionLogger {
  private logs: LogEvent[] = [];
  private sessionId: string;
  private turnCounter: number = 0;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.restore();
  }

  private generateSessionId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `session_${ts}_${rand}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  log(event: Omit<LogEvent, 'session_id' | 'turn_id' | 'timestamp'>): LogEvent {
    this.turnCounter++;
    const entry: LogEvent = {
      session_id: this.sessionId,
      turn_id: this.turnCounter,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.logs.push(entry);
    this.persist();
    console.log(`📝 [SESSION] Turn ${entry.turn_id}: [${entry.role}] ${entry.content.substring(0, 80)}`);
    return entry;
  }

  logUserInput(content: string, topic?: string): LogEvent {
    return this.log({ role: 'user', content, topic });
  }

  logAssistantResponse(content: string, topic?: string): LogEvent {
    return this.log({ role: 'assistant', content, topic });
  }

  logToolCall(
    name: string,
    params: Record<string, unknown>,
    category: 'READ' | 'WRITE',
    result?: unknown,
    confirmed?: boolean
  ): LogEvent {
    return this.log({
      role: 'tool',
      content: `${category} ${name}`,
      tool_call: { name, params, category, result },
      confirmed,
    });
  }

  logSystemEvent(content: string): LogEvent {
    return this.log({ role: 'system', content });
  }

  getSessionLogs(): LogEvent[] {
    return this.logs.filter(e => e.session_id === this.sessionId);
  }

  getAllLogs(): LogEvent[] {
    return [...this.logs];
  }

  getSummary(): SessionSummary {
    const sessionLogs = this.getSessionLogs();
    const topics = new Set<string>();
    let toolCalls = 0;
    let confirmations = 0;

    for (const entry of sessionLogs) {
      if (entry.topic) topics.add(entry.topic);
      if (entry.tool_call) toolCalls++;
      if (entry.confirmed !== undefined) confirmations++;
    }

    return {
      session_id: this.sessionId,
      start_time: sessionLogs[0]?.timestamp || new Date().toISOString(),
      turn_count: sessionLogs.length,
      topics_covered: [...topics],
      tool_calls_made: toolCalls,
      confirmations_requested: confirmations,
    };
  }

  resetSession(): void {
    this.sessionId = this.generateSessionId();
    this.turnCounter = 0;
    this.logSystemEvent('Session reset');
  }

  clearAll(): void {
    this.logs = [];
    this.turnCounter = 0;
    this.sessionId = this.generateSessionId();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  exportJSON(): string {
    return JSON.stringify(this.getSessionLogs(), null, 2);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (_) {}
  }

  private restore(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
        const sessionLogs = this.getSessionLogs();
        this.turnCounter = sessionLogs.length;
      }
    } catch (_) {
      this.logs = [];
    }
  }
}

export const sessionLogger = new SessionLogger();
