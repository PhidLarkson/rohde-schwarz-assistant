/**
 * Tutorial Generation + Progress Tracking (Core 4d)
 * Reads the session log, scores competency per topic, and adapts
 * what the assistant suggests doing next. Rule-based, not ML.
 *
 * Contract:
 *   PROGRESS_UPDATE { session_id }
 *   → { topic_scores: { [topic]: score }, recommended_next_topic: string }
 */

import { sessionLogger, type LogEvent } from './session';

export interface ProgressUpdate {
  session_id: string;
  topic_scores: Record<string, number>;
  recommended_next_topic: string;
  summary: string;
}

// Topics that map to oscilloscope lab competencies
const TOPICS = [
  'probe_compensation',
  'vertical_scale',
  'horizontal_timebase',
  'triggering',
  'measurements',
  'signal_identification',
  'component_identification',
  'troubleshooting',
  'safety',
] as const;

type Topic = typeof TOPICS[number];

const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  probe_compensation: ['probe', 'compensation', 'calibrat', 'trimmer', 'attenuation', '1x', '10x'],
  vertical_scale: ['vertical', 'v/div', 'volts', 'amplitude', 'scale', 'channel'],
  horizontal_timebase: ['timebase', 'time/div', 'horizontal', 'sweep', 'sample rate'],
  triggering: ['trigger', 'edge', 'level', 'slope', 'auto', 'normal', 'single'],
  measurements: ['measure', 'frequency', 'period', 'peak', 'rms', 'cursor', 'mean'],
  signal_identification: ['sine', 'square', 'pulse', 'sawtooth', 'waveform', 'signal'],
  component_identification: ['port', 'knob', 'bnc', 'connector', 'button', 'input', 'output'],
  troubleshooting: ['noise', 'clip', 'alias', 'drift', 'unstable', 'diagnos', 'fault', 'fix'],
  safety: ['safety', 'voltage limit', 'ground', 'overload', 'maximum', 'danger', 'warning'],
};

const TOPIC_DISPLAY_NAMES: Record<Topic, string> = {
  probe_compensation: 'Probe Compensation',
  vertical_scale: 'Vertical Scale',
  horizontal_timebase: 'Timebase',
  triggering: 'Triggering',
  measurements: 'Measurements',
  signal_identification: 'Signal Identification',
  component_identification: 'Component ID',
  troubleshooting: 'Troubleshooting',
  safety: 'Safety',
};

// Ordered curriculum — topics the student should learn in sequence
const CURRICULUM_ORDER: Topic[] = [
  'safety',
  'probe_compensation',
  'vertical_scale',
  'horizontal_timebase',
  'triggering',
  'measurements',
  'signal_identification',
  'troubleshooting',
  'component_identification',
];

function detectTopic(text: string): Topic | null {
  const lower = text.toLowerCase();
  let bestTopic: Topic | null = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    let score = 0;
    for (const keyword of TOPIC_KEYWORDS[topic]) {
      if (lower.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestScore > 0 ? bestTopic : null;
}

function scoreTopicCompetency(logs: LogEvent[], topic: Topic): number {
  const topicLogs = logs.filter(e => {
    if (e.topic === topic) return true;
    const detected = detectTopic(e.content);
    return detected === topic;
  });

  if (topicLogs.length === 0) return 0;

  let score = 0;
  const userTurns = topicLogs.filter(e => e.role === 'user');
  const assistantTurns = topicLogs.filter(e => e.role === 'assistant');
  const errors = topicLogs.filter(e => e.role === 'system' && e.content.toLowerCase().includes('error'));

  // Base: engagement with the topic (asked about it)
  score += Math.min(userTurns.length * 15, 40);

  // Got responses (assistant addressed it)
  score += Math.min(assistantTurns.length * 10, 30);

  // Tool calls related to this topic show hands-on work
  const toolCalls = topicLogs.filter(e => e.tool_call);
  score += Math.min(toolCalls.length * 10, 20);

  // Errors reduce score
  score -= errors.length * 5;

  // Confirmations on WRITE commands show proper safety awareness
  const confirmed = topicLogs.filter(e => e.confirmed === true);
  score += confirmed.length * 5;

  return Math.max(0, Math.min(100, score));
}

export function getProgress(sessionId?: string): ProgressUpdate {
  const logs = sessionId
    ? sessionLogger.getAllLogs().filter(e => e.session_id === sessionId)
    : sessionLogger.getSessionLogs();

  const topic_scores: Record<string, number> = {};
  for (const topic of TOPICS) {
    const score = scoreTopicCompetency(logs, topic);
    if (score > 0) {
      topic_scores[TOPIC_DISPLAY_NAMES[topic]] = score;
    }
  }

  // Find the next recommended topic: first topic in curriculum with score < 40
  let recommended_next_topic = TOPIC_DISPLAY_NAMES[CURRICULUM_ORDER[0]];
  for (const topic of CURRICULUM_ORDER) {
    const score = scoreTopicCompetency(logs, topic);
    if (score < 40) {
      recommended_next_topic = TOPIC_DISPLAY_NAMES[topic];
      break;
    }
  }

  // Build a human-readable summary
  const coveredTopics = Object.entries(topic_scores)
    .filter(([_, s]) => s >= 40)
    .map(([t]) => t);

  const summary = coveredTopics.length > 0
    ? `You've made progress on: ${coveredTopics.join(', ')}. Next up: ${recommended_next_topic}.`
    : `Let's get started! I recommend beginning with ${recommended_next_topic}.`;

  return {
    session_id: sessionLogger.getSessionId(),
    topic_scores,
    recommended_next_topic,
    summary,
  };
}

export function getNudge(): string | null {
  const progress = getProgress();
  const logs = sessionLogger.getSessionLogs();

  // Only nudge if enough turns have passed without covering a key topic
  if (logs.length < 5) return null;

  const recentLogs = logs.slice(-5);
  const recentTopics = new Set(
    recentLogs
      .map(e => detectTopic(e.content))
      .filter((t): t is Topic => t !== null)
  );

  // If the student has been on the same topic for a while, suggest moving on
  if (recentTopics.size === 1) {
    const currentTopic = [...recentTopics][0];
    const score = scoreTopicCompetency(logs, currentTopic);
    if (score >= 60) {
      return `You're doing well with ${TOPIC_DISPLAY_NAMES[currentTopic]}! Want to try ${progress.recommended_next_topic}?`;
    }
  }

  return null;
}

export function getInstructorView(): {
  session_summary: ReturnType<typeof sessionLogger.getSummary>;
  progress: ProgressUpdate;
  total_turns: number;
} {
  return {
    session_summary: sessionLogger.getSummary(),
    progress: getProgress(),
    total_turns: sessionLogger.getSessionLogs().length,
  };
}
