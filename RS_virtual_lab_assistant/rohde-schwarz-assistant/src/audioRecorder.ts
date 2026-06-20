/**
 * AudioRecorder: Simple, robust microphone recording for all platforms.
 * No fallbacks, no complexity - just MediaRecorder with proper error handling.
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recordingStartTime: number = 0;

  // Audio level detection for visualizer
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private currentAudioLevel: number = 0;

  async start(): Promise<void> {
    console.log('🎤 [RECORDER] Starting audio recording...');

    try {
      // Reset per-recording state
      this.audioChunks = [];
      this.recordingStartTime = Date.now();

      // Reuse existing MediaStream if we already have one to avoid repeated permission prompts
      if (!this.stream) {
        console.log('🎤 [RECORDER] Requesting microphone permission...');
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        console.log('✅ [RECORDER] Microphone access granted (new stream)');
      } else {
        console.log('ℹ️ [RECORDER] Reusing existing MediaStream');
      }

      // Determine best supported audio format
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      }

      console.log('🎵 [RECORDER] Using mime type:', mimeType);

      // Create a fresh MediaRecorder for each start so we get new dataavailable events
      this.mediaRecorder = new MediaRecorder(this.stream as MediaStream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000 // 128kbps for good quality
      });

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log(`📦 [RECORDER] Chunk ${this.audioChunks.length}: ${event.data.size} bytes`);
        }
      };

      this.mediaRecorder.onerror = (event: any) => {
        console.error('❌ [RECORDER] MediaRecorder error:', event.error);
      };

      this.mediaRecorder.onstart = () => {
        console.log('▶️ [RECORDER] Recording started');
      };

      this.mediaRecorder.onstop = () => {
        console.log('⏹️ [RECORDER] Recording stopped');
      };

      // Start recording immediately; final chunk will be delivered on stop
      this.mediaRecorder.start();
      console.log('✅ [RECORDER] MediaRecorder started (single chunk until stop)');

      // Set up audio level detection for visualizer if not already active
      this.setupAudioLevelDetection();

    } catch (error) {
      console.error('❌ [RECORDER] Failed to start recording:', error);
      // Do not fully cleanup the persistent stream here; only clear recorder state
      this.mediaRecorder = null;

      if ((error as Error).name === 'NotAllowedError') {
        throw new Error('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else if ((error as Error).name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else {
        throw new Error(`Recording failed: ${(error as Error).message}`);
      }
    }
  }

  async stop(): Promise<Blob> {
    console.log('🛑 [RECORDER] Stopping recording...');

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
        console.error('❌ [RECORDER] No active recording to stop');
        // keep persistent stream/audioContext alive; clear recorder only
        this.mediaRecorder = null;
        reject(new Error('No active recording'));
        return;
      }

      const recorder = this.mediaRecorder;

      const finalizeBlob = () => {
        if (this.audioChunks.length === 0) {
          console.error('❌ [RECORDER] No audio data captured');
          this.cleanup();
          reject(new Error('No audio recorded. Please try speaking again.'));
          return;
        }

          // Create final blob
          const mimeType = (recorder as any).mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          console.log(`✅ [RECORDER] Final blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

          // Clear mediaRecorder but keep the underlying MediaStream and audioContext alive for faster subsequent starts
          this.mediaRecorder = null;
          resolve(audioBlob);
      };

      // Set up stop handler
      recorder.onstop = () => {
        const duration = Date.now() - this.recordingStartTime;
        console.log(`⏹️ [RECORDER] Recording stopped after ${duration}ms`);
        console.log(`📦 [RECORDER] Collected ${this.audioChunks.length} chunks`);

        // Allow any final dataavailable event to flush before finalizing
        setTimeout(() => {
          if (this.audioChunks.length === 0) {
            console.warn('⚠️ [RECORDER] No chunks yet after stop; requesting final data...');
            try {
              recorder.requestData();
            } catch (reqErr) {
              console.error('❌ [RECORDER] requestData failed:', reqErr);
            }

            // Give the request a brief window to resolve
            setTimeout(() => finalizeBlob(), 50);
            return;
          }
          finalizeBlob();
        }, 0);
      };

      // Ask for any pending data before stopping so we capture very short clips
      try {
        if (typeof (recorder as any).requestData === 'function') {
          (recorder as any).requestData();
        }
      } catch (reqErr) {
        console.warn('⚠️ [RECORDER] requestData pre-stop failed (continuing):', reqErr);
      }

      // Stop the recorder
      try {
        recorder.stop();
      } catch (error) {
        console.error('❌ [RECORDER] Error stopping recorder:', error);
        this.mediaRecorder = null;
        reject(error);
      }
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /**
   * Get current audio level (0-1) for visualizer
   */
  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) return 0;

    // Use time-domain data (waveform) for more reliable speech amplitude detection
    try {
      this.analyser.getByteTimeDomainData(this.dataArray);
    } catch (e) {
      // some browsers might still prefer frequency data; fall back
      try {
        this.analyser.getByteFrequencyData(this.dataArray);
      } catch (ee) {
        return 0;
      }
    }

    // Compute normalized amplitude ~0..1 from time-domain data (0 centered at 128)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += Math.abs(this.dataArray[i] - 128);
    }
    const avg = sum / this.dataArray.length / 128;
    this.currentAudioLevel = Math.min(1, Math.max(0, avg));
    return this.currentAudioLevel;
  }

  /**
   * Set up real-time audio level detection using Web Audio API
   */
  private setupAudioLevelDetection(): void {
    if (!this.stream) return;

    try {
      // Create or reuse audio context for analysis only (not recording)
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Resume if suspended (mobile requirement)
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      }

      // Create analyser node if missing
      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        // Use smaller FFT for lower latency/CPU in XR
        this.analyser.fftSize = 256;
      }

      const bufferLength = this.analyser.frequencyBinCount;
      if (!this.dataArray || this.dataArray.length !== bufferLength) {
        this.dataArray = new Uint8Array(bufferLength);
      }

      // Connect stream to analyser (but NOT to destination - we don't want to hear it)
      try {
        const source = this.audioContext.createMediaStreamSource(this.stream as MediaStream);
        source.connect(this.analyser);
      } catch (e) {
        // Some browsers can only create one MediaStreamSource; ignore if fails
      }

      console.log('🎵 [RECORDER] Audio level detection active (reused resources)');
    } catch (error) {
      console.warn('⚠️ [RECORDER] Could not set up audio level detection:', error);
      // Not critical - recording will still work
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Stop all media tracks
    // NOTE: cleanup here only clears ephemeral recorder resources. The underlying
    // MediaStream and AudioContext are intentionally kept alive to avoid repeated
    // permission prompts and to reduce start-up latency in immersive mode.

    // Clear analyser and per-recording buffers
    this.analyser = null;
    this.dataArray = null;
    this.currentAudioLevel = 0;

    // Clear recorder state (do not stop underlying stream)
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * Release all persistent resources (stop tracks and close audio context).
   * Call this when you want to fully free microphone and audio resources.
   */
  public release(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) { /* ignore */ }
        console.log('🔇 [RECORDER] Stopped track:', track.kind);
      });
      this.stream = null;
    }

    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) { /* ignore */ }
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.currentAudioLevel = 0;
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}
