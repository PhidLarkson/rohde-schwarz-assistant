/**
 * AR / Vision — Component Identification (Core 4a)
 * Grabs a camera frame on request, sends to Gemini vision,
 * returns a labeled answer + safety note.
 *
 * Contract:
 *   IDENTIFY_REQUEST { image_base64: string }
 *   → { label: string, confidence: number, safety_note?: string }
 */

import { GoogleGenAI } from '@google/genai';
import { sessionLogger } from './session';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface IdentifyRequest {
  image_base64: string;
}

export interface IdentifyResult {
  label: string;
  confidence: number;
  safety_note?: string;
}

const VISION_PROMPT = `You are an expert lab technician identifying components on a Rohde & Schwarz oscilloscope.

Given this image, identify the specific component, port, knob, or connector visible.

Respond ONLY in this JSON format:
{
  "label": "short name of the component",
  "confidence": 0.0 to 1.0,
  "safety_note": "one-line safety tip if relevant, or null"
}

Examples of components: BNC input (CH1-CH4), probe compensation output, USB port,
trigger level knob, horizontal scale knob, vertical scale knob, power button,
ground terminal, external trigger input, LAN port, menu/navigation buttons.

Always include a safety_note when the component involves electrical connections.`;

export async function identifyComponent(request: IdentifyRequest): Promise<IdentifyResult> {
  console.log('🔍 [VISION] Identifying component from image...');

  sessionLogger.logToolCall('identify_component', {}, 'READ');

  try {
    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: VISION_PROMPT },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: request.image_base64,
              },
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const responseText = result.text || '';
    console.log('🔍 [VISION] Raw response:', responseText);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in vision response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const identifyResult: IdentifyResult = {
      label: parsed.label || 'Unknown component',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      safety_note: parsed.safety_note || undefined,
    };

    sessionLogger.logAssistantResponse(
      `Identified: ${identifyResult.label} (${(identifyResult.confidence * 100).toFixed(0)}%)` +
      (identifyResult.safety_note ? ` — ${identifyResult.safety_note}` : ''),
      'component_identification'
    );

    console.log('✅ [VISION] Identified:', identifyResult.label);
    return identifyResult;
  } catch (err) {
    console.error('❌ [VISION] Identification failed:', err);
    sessionLogger.logSystemEvent(`Vision error: ${(err as Error).message}`);
    return {
      label: 'Could not identify component',
      confidence: 0,
      safety_note: 'Please try again with a clearer image.',
    };
  }
}

/**
 * Capture a frame from the device camera and return as base64.
 * Afari's stream layer should replace this with the real capture.
 */
export async function captureFrame(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    // Wait one frame for the video to render
    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    stream.getTracks().forEach(t => t.stop());

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  } catch (err) {
    console.error('❌ [VISION] Camera capture failed:', err);
    return null;
  }
}
