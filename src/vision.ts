/**
 * AR / Vision — Component Identification + Live Camera Stream (Core 4a)
 *
 * Two modes:
 * 1. One-shot identify: capture a frame, send to Gemini vision, get a detailed description
 * 2. Live stream: open a persistent Gemini Live API session, stream camera frames at ~1fps,
 *    get real-time narration of what the camera sees
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { sessionLogger } from './session';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface IdentifyResult {
  label: string;
  confidence: number;
  safety_note?: string;
  description?: string;
}

const VISION_PROMPT = `You are Rhoda, an expert Rohde & Schwarz oscilloscope lab assistant at KNUST.

Examine this image carefully and describe what you see in detail.

If it shows oscilloscope components, ports, knobs, or connectors:
- Name the specific component (e.g. "CH1 BNC Input", "Horizontal Scale Knob", "USB 3.0 Port")
- Explain what it does and how a student would use it
- Include any safety warnings relevant to that component

If it shows a waveform or trace on screen:
- Describe the waveform shape, amplitude, frequency if visible
- Note any anomalies (clipping, noise, triggering issues)

If it shows something else:
- Describe what you see and how it relates to the lab setup

Respond ONLY in this JSON format:
{
  "label": "short component name",
  "description": "2-3 sentence detailed explanation of what this is and how to use it",
  "confidence": 0.0 to 1.0,
  "safety_note": "safety tip if relevant, or null"
}`;

export async function identifyComponent(image_base64: string): Promise<IdentifyResult> {
  console.log('🔍 [VISION] Identifying component from image...');
  sessionLogger.logToolCall('identify_component', {}, 'READ');

  try {
    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { text: VISION_PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: image_base64 } },
        ],
      }],
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const responseText = result.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in vision response');

    const parsed = JSON.parse(jsonMatch[0]);
    const out: IdentifyResult = {
      label: parsed.label || 'Unknown',
      description: parsed.description || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      safety_note: parsed.safety_note || undefined,
    };

    sessionLogger.logAssistantResponse(
      `Identified: ${out.label} — ${out.description}`,
      'component_identification'
    );
    console.log('✅ [VISION] Identified:', out.label);
    return out;
  } catch (err) {
    console.error('❌ [VISION] Identification failed:', err);
    sessionLogger.logSystemEvent(`Vision error: ${(err as Error).message}`);
    return {
      label: 'Could not identify',
      description: 'Please try again with a clearer image.',
      confidence: 0,
    };
  }
}

// ── Live Camera Stream via Gemini Live API ──

type LiveStreamCallback = (text: string) => void;

let liveSession: any = null;
let cameraStream: MediaStream | null = null;
let frameIntervalId: number | null = null;
let videoEl: HTMLVideoElement | null = null;

export function isLiveStreamActive(): boolean {
  return liveSession !== null;
}

export async function startLiveStream(onText: LiveStreamCallback): Promise<void> {
  if (liveSession) {
    console.warn('⚠️ [VISION-LIVE] Stream already active');
    return;
  }

  console.log('📹 [VISION-LIVE] Starting live camera stream...');

  // 1. Open camera
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 640, height: 480 },
    });
  } catch (err) {
    console.error('❌ [VISION-LIVE] Camera access denied:', err);
    onText('Camera access denied. Please allow camera permissions.');
    return;
  }

  videoEl = document.createElement('video');
  videoEl.srcObject = cameraStream;
  videoEl.setAttribute('playsinline', 'true');
  videoEl.muted = true;
  await videoEl.play();

  // 2. Connect to Gemini Live API
  try {
    liveSession = await gemini.live.connect({
      model: 'gemini-2.5-flash-preview-native-audio-dialog',
      callbacks: {
        onopen: () => console.log('✅ [VISION-LIVE] Session opened'),
        onmessage: (message: any) => {
          const content = message?.serverContent;
          if (content?.outputTranscription?.text) {
            onText(content.outputTranscription.text);
          }
          if (content?.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.text) {
                onText(part.text);
              }
            }
          }
        },
        onerror: (e: any) => {
          console.error('❌ [VISION-LIVE] Error:', e.message || e);
          onText('Live stream error. Reconnecting...');
        },
        onclose: (e: any) => {
          console.log('🔒 [VISION-LIVE] Session closed:', e?.reason || 'done');
          cleanupLiveStream();
        },
      },
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction: {
          parts: [{
            text: 'You are Rhoda, a lab assistant for Rohde & Schwarz oscilloscopes at KNUST. '
              + 'The student is showing you their lab setup through a camera. '
              + 'Describe what you see clearly and concisely. '
              + 'Identify oscilloscope components, waveforms, or lab equipment. '
              + 'Flag any safety concerns immediately. '
              + 'Keep responses to 1-2 sentences per observation.'
          }],
        },
      },
    });
  } catch (err) {
    console.error('❌ [VISION-LIVE] Failed to connect:', err);
    onText('Failed to connect to live vision. Check your API key.');
    cleanupLiveStream();
    return;
  }

  // 3. Send frames at ~1fps
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  frameIntervalId = window.setInterval(() => {
    if (!videoEl || !liveSession) return;
    try {
      ctx.drawImage(videoEl, 0, 0, 640, 480);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const base64 = dataUrl.split(',')[1];
      liveSession.sendRealtimeInput({
        video: { data: base64, mimeType: 'image/jpeg' },
      });
    } catch (err) {
      console.warn('⚠️ [VISION-LIVE] Frame send failed:', err);
    }
  }, 1000);

  sessionLogger.logSystemEvent('Live camera stream started');
  console.log('📹 [VISION-LIVE] Streaming at ~1fps');
}

export function stopLiveStream(): void {
  console.log('🛑 [VISION-LIVE] Stopping live stream');
  if (liveSession) {
    try { liveSession.close(); } catch (_) {}
  }
  cleanupLiveStream();
  sessionLogger.logSystemEvent('Live camera stream stopped');
}

function cleanupLiveStream(): void {
  if (frameIntervalId !== null) {
    clearInterval(frameIntervalId);
    frameIntervalId = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
    videoEl = null;
  }
  liveSession = null;
}

export async function captureFrame(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    stream.getTracks().forEach(t => t.stop());
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } catch (err) {
    console.error('❌ [VISION] Camera capture failed:', err);
    return null;
  }
}
