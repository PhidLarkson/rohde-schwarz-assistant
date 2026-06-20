/**
 * GhanaNLP API Integration (Direct HTTP)
 * - Speech-to-text (ASR v2) - transcribe audio to text
 * - Text-to-speech (TTS v1) - convert text to audio
 * - Translation (v1) - translate between supported languages
 */
import { GoogleGenAI } from '@google/genai';

// GhanaNLP API Integration
const GHANANLP_API_KEY = import.meta.env.VITE_GHANANLP_API_KEY || '';
const GHANANLP_BASE = 'https://translation-api.ghananlp.org';

// Minimal Gemini client for English text generation
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

if (!GHANANLP_API_KEY || !GEMINI_API_KEY) {
  console.warn('⚠️ API Keys missing! Check .env file.');
}
const SYSTEM_INSTRUCTION = 'You are Rhoda, a virtual lab assistant for Rohde & Schwarz oscilloscopes at KNUST. You guide students through measurements, explain instrument controls, and flag safety concerns. Keep responses clear, technical, and under 60 words.';

/**
 * Transcribe audio to text using GhanaNLP ASR v1
 * @param audioBlob - Audio blob from recording
 * @param language - Language code (default: 'tw' for Twi)
 * @returns Transcribed text
 */
export async function transcribeAudio(audioBlob: Blob, language: string = 'tw'): Promise<string> {
  try {
    console.log(`🎤 [GHANANLP-ASR] Transcribing audio: ${audioBlob.size} bytes, type: ${audioBlob.type}, language: ${language}`);

    // Validate blob
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Invalid audio blob - empty or missing');
    }

    // Call GhanaNLP ASR v1 API (not v2!) with binary audio
    const url = `${GHANANLP_BASE}/asr/v1/transcribe?language=${language}`;

    // Use audio/mpeg content type as specified in the API docs
    const contentType = 'audio/mpeg';

    console.log(`📤 [GHANANLP-ASR] Sending to: ${url}`);
    console.log(`📤 [GHANANLP-ASR] Content-Type: ${contentType}`);
    console.log(`📤 [GHANANLP-ASR] API Key: ${GHANANLP_API_KEY.substring(0, 8)}...${GHANANLP_API_KEY.substring(GHANANLP_API_KEY.length - 4)}`);

    const startTime = Date.now();

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': GHANANLP_API_KEY,
          'Content-Type': contentType
        },
        body: audioBlob
      });
      const elapsedMs = Date.now() - startTime;
      console.log(`📥 [GHANANLP-ASR] Fetch completed in ${elapsedMs}ms`);
    } catch (fetchError) {
      const elapsedMs = Date.now() - startTime;
      console.error(`❌ [GHANANLP-ASR] Network error after ${elapsedMs}ms:`, fetchError);
      throw new Error(`Network error: ${(fetchError as Error).message} - Check CORS/internet connection`);
    }

    console.log(`📥 [GHANANLP-ASR] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GHANANLP-ASR] HTTP error:', response.status, response.statusText);
      console.error('❌ [GHANANLP-ASR] Error body:', errorText);

      // Specific error messages for common issues
      if (response.status === 401) {
        throw new Error(`Authentication failed (401) - API key may be invalid or expired. Key: ${GHANANLP_API_KEY.substring(0, 8)}...`);
      } else if (response.status === 403) {
        throw new Error(`Access forbidden (403) - API key may not have permission for ASR v1 endpoint`);
      } else if (response.status === 415) {
        throw new Error(`Unsupported media type (415) - Audio format ${contentType} may not be supported. Try audio/mpeg or audio/wav`);
      } else {
        throw new Error(`ASR API returned ${response.status}: ${errorText.substring(0, 200)}`);
      }
    }

    const responseText = await response.text();
    console.log(`📥 [GHANANLP-ASR] Raw response:`, responseText.substring(0, 500));

    let transcribedText = '';
    try {
      const data = JSON.parse(responseText);
      console.log(`📥 [GHANANLP-ASR] Parsed JSON type:`, typeof data);

      // If the response is a plain JSON string, use it directly
      if (typeof data === 'string') {
        transcribedText = data;
        console.log(`📥 [GHANANLP-ASR] Response is a plain string:`, transcribedText);
      } else {
        // Otherwise look for transcription fields
        transcribedText = data.transcription || data.text || data.transcribedText || '';
        console.log(`📥 [GHANANLP-ASR] Response is an object, extracted field:`, transcribedText);
      }
    } catch (parseErr) {
      console.error('❌ [GHANANLP-ASR] Failed to parse JSON response');
      throw new Error(`Invalid JSON response from ASR API: ${responseText.substring(0, 100)}`);
    }

    if (!transcribedText) {
      console.warn('⚠️ [GHANANLP-ASR] Empty transcription in response');
      throw new Error('No transcription text in API response');
    }

    console.log('✅ [GHANANLP-ASR] Transcribed text:', transcribedText);
    return transcribedText;

  } catch (error) {
    console.error('❌ [GHANANLP-ASR] Transcription error:', error);
    console.error('❌ [GHANANLP-ASR] Error details:', {
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    throw new Error(`Failed to transcribe audio: ${(error as Error).message}`);
  }
}

/**
 * Generate speech audio from text using GhanaNLP TTS v1
 * @param text - Text to convert to speech
 * @param language - Language code (default: 'tw' for Twi)
 * @returns Audio blob
 */
export async function textToSpeech(text: string, language: string = 'tw'): Promise<Blob | null> {
  try {
    console.log(`🔊 [GHANANLP-TTS] Generating speech: "${text.substring(0, 50)}...", language: ${language}`);

    // Map language to speaker
    const speakerMap: Record<string, string> = {
      'tw': 'twi_speaker_7',
      'ki': 'kikuyu_speaker_1',
      'ee': 'ewe_speaker_3'
    };
    const speaker = speakerMap[language] || 'twi_speaker_7';

    // Call GhanaNLP TTS v1 API
    const url = `${GHANANLP_BASE}/tts/v1/synthesize`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': GHANANLP_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        language,
        speaker_id: speaker
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GHANANLP-TTS] HTTP error:', response.status, errorText);
      return null;
    }

    // Response is WAV audio
    const audioBlob = await response.blob();
    console.log(`✅ [GHANANLP-TTS] Generated ${audioBlob.size} bytes of audio`);

    return audioBlob;

  } catch (error) {
    console.error('❌ [GHANANLP-TTS] Generation error:', error);
    return null;
  }
}

/**
 * Translate text between languages using GhanaNLP v1
 * @param text - Text to translate
 * @param fromLanguage - Source language code (e.g., 'en')
 * @param toLanguage - Target language code (e.g., 'tw')
 * @returns Translated text
 */
export async function translateText(text: string, fromLanguage: string, toLanguage: string): Promise<string> {
  try {
    console.log(`🌍 [GHANANLP-TRANSLATE] Translating "${text.substring(0, 50)}..." from ${fromLanguage} to ${toLanguage}`);

    // Call GhanaNLP Translation v1 API with lang pair format "from-to"
    const url = `${GHANANLP_BASE}/v1/translate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': GHANANLP_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        in: text,
        lang: `${fromLanguage}-${toLanguage}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GHANANLP-TRANSLATE] HTTP error:', response.status, errorText);
      throw new Error(`Translation API error: ${response.status} - ${errorText}`);
    }

    // First, get the raw response text to check format
    const responseText = await response.text();
    console.log('📥 [GHANANLP-TRANSLATE] Raw response:', responseText);

    // Try to parse as JSON first
    let translatedText = '';
    try {
      const data = JSON.parse(responseText);
      console.log('📥 [GHANANLP-TRANSLATE] Parsed JSON:', JSON.stringify(data, null, 2));

      // Check if the parsed data is already a string (API returned "text")
      if (typeof data === 'string') {
        translatedText = data;
      } else {
        // Otherwise, try multiple possible field names
        translatedText = data.translation || data.translated || data.translatedText || data.out || '';
      }
    } catch (parseError) {
      // If JSON parsing fails, the response might be plain text
      console.log('📥 [GHANANLP-TRANSLATE] Not JSON, using response as plain text');
      translatedText = responseText.trim();
    }

    if (!translatedText) {
      console.error('❌ [GHANANLP-TRANSLATE] No translation found in response');
      throw new Error(`No translation in API response. Raw: ${responseText.substring(0, 100)}`);
    }

    console.log('✅ [GHANANLP-TRANSLATE] Translated text:', translatedText);
    return translatedText;

  } catch (error) {
    console.error('❌ [GHANANLP-TRANSLATE] Translation error:', error);
    throw new Error(`Failed to translate: ${(error as Error).message}`);
  }
}

/**
 * Ask Gemini with English text and get an English response
 */
export async function askGemini(text: string): Promise<string> {
  try {
    console.log(`🤖 [GEMINI] Asking: "${text.substring(0, 50)}..."`);
    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const responseText = result.text || '';
    console.log(`✅ [GEMINI] Response: "${responseText.substring(0, 50)}..."`);
    return responseText;
  } catch (err) {
    console.error('❌ [GEMINI] generation error:', err);
    return 'Sorry, I am having trouble thinking right now. Please try again.';
  }
}

/**
 * Combined function: Transcribe audio and optionally translate to English
 * This maintains compatibility with the old API interface
 */
export async function transcribeAndUnderstand(
  audioBlob: Blob,
  language: string = 'tw',
  translateToEnglish: boolean = false
): Promise<{ transcript: string; response: string }> {
  try {
    // Transcribe audio to text
    const transcript = await transcribeAudio(audioBlob, language);

    // If translation is needed and source is not English
    let response = transcript;
    if (translateToEnglish && language !== 'en') {
      try {
        response = await translateText(transcript, language, 'en');
      } catch (error) {
        console.warn('⚠️ [GHANANLP] Translation failed, using original transcript');
        response = transcript;
      }
    }

    return { transcript, response };

  } catch (error) {
    console.error('❌ [GHANANLP] transcribeAndUnderstand error:', error);
    return {
      transcript: '[Error: Could not process audio]',
      response: 'Sorry, I had trouble processing your audio. Please try speaking again.'
    };
  }
}