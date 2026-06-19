// ============================================
// Rhoda — Lab Assistant Interactions Registry
// ============================================

export interface Interaction {
  id: string;
  trigger: string;
  description: string;
  effect: string;
  priority?: number;
  cooldown?: number;
}

export const interactions: Interaction[] = [
  // ===== SESSION START =====
  {
    id: 'welcome',
    trigger: 'app_start',
    description: 'Rhoda greets the student and confirms instrument status',
    effect: 'Makes eye contact, smiles, and says "Hi, I\'m Rhoda — your lab assistant. Let me know what you\'d like to measure."',
    priority: 100,
    cooldown: 0,
  },

  // ===== VOICE & SPEECH =====
  {
    id: 'listen_start',
    trigger: 'user_speak_start',
    description: 'Student starts speaking or asking a question',
    effect: 'Rhoda leans in slightly, shows listening indicator, attends to user.',
    priority: 75,
    cooldown: 100,
  },

  {
    id: 'listen_end',
    trigger: 'user_speak_end',
    description: 'Student finishes speaking',
    effect: 'Rhoda processes the question, retrieves relevant procedure/safety context, and responds.',
    priority: 75,
    cooldown: 100,
  },

  {
    id: 'thinking',
    trigger: 'ai_thinking',
    description: 'Rhoda is processing a question or retrieving lab context',
    effect: 'Brief idle animation with concentration micro-expression.',
    priority: 50,
    cooldown: 200,
  },

  // ===== INSTRUMENT INTERACTION =====
  {
    id: 'confirm_action',
    trigger: 'write_command_pending',
    description: 'A state-changing instrument command needs user confirmation',
    effect: 'Rhoda pauses, makes eye contact, and asks "Shall I go ahead and change that setting?"',
    priority: 95,
    cooldown: 0,
  },

  {
    id: 'safety_warning',
    trigger: 'unsafe_condition',
    description: 'A parameter exceeds safe limits or a probe configuration looks wrong',
    effect: 'Rhoda shows concern, flags the safety issue clearly, and suggests the correct approach.',
    priority: 100,
    cooldown: 0,
  },

  {
    id: 'measurement_complete',
    trigger: 'measurement_done',
    description: 'A measurement or reading completes successfully',
    effect: 'Rhoda nods, presents the result, and asks if the student wants to proceed.',
    priority: 60,
    cooldown: 500,
  },

  // ===== TOUCH INTERACTION =====
  {
    id: 'touch_response',
    trigger: 'user_touch',
    description: 'Student touches or selects Rhoda',
    effect: 'Rhoda acknowledges with eye contact and enters listening mode.',
    priority: 80,
    cooldown: 1000,
  },

  // ===== IDLE & AMBIENT =====
  {
    id: 'natural_blink',
    trigger: 'idle',
    description: 'No interaction for 4-6 seconds',
    effect: 'Rhoda blinks naturally, maintains eye contact.',
    priority: 10,
    cooldown: 0,
  },

  {
    id: 'idle_attentive',
    trigger: 'idle_extended',
    description: 'No interaction for 10+ seconds',
    effect: 'Rhoda shifts gaze briefly toward the instrument area, then back to user — stays present.',
    priority: 5,
    cooldown: 5000,
  },

  // ===== PROXIMITY =====
  {
    id: 'follow_user',
    trigger: 'user_distance_gt_2m',
    description: 'Student moves away from Rhoda',
    effect: 'Rhoda follows to stay within conversational distance.',
    priority: 70,
    cooldown: 1000,
  },

  {
    id: 'maintain_eye_contact',
    trigger: 'user_present',
    description: 'Student is nearby and visible',
    effect: 'Rhoda faces the student and maintains natural eye contact.',
    priority: 95,
    cooldown: 0,
  },

  // ===== ERROR HANDLING =====
  {
    id: 'error_recovery',
    trigger: 'ai_error',
    description: 'API call fails or no response is generated',
    effect: 'Rhoda tilts head apologetically and says "Sorry, let me try that again."',
    priority: 40,
    cooldown: 1000,
  },

  {
    id: 'session_end',
    trigger: 'app_exit',
    description: 'Student is leaving or session closes',
    effect: 'Rhoda summarizes what was covered and says goodbye.',
    priority: 100,
    cooldown: 0,
  },
];

export function getInteractionByTrigger(trigger: string): Interaction | undefined {
  return interactions.find((i) => i.trigger === trigger);
}

export function getInteractionsByPriority(): Interaction[] {
  return [...interactions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

const interactionCooldowns: { [id: string]: number } = {};

export function canTriggerInteraction(id: string): boolean {
  const now = Date.now();
  const lastTrigger = interactionCooldowns[id] ?? 0;
  const interaction = interactions.find((i) => i.id === id);
  if (!interaction) return false;
  const cooldown = interaction.cooldown ?? 0;
  return now - lastTrigger > cooldown;
}

export function markInteractionTriggered(id: string): void {
  interactionCooldowns[id] = Date.now();
}
