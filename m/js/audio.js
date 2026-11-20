class AudioCleaner {
  constructor() {
    this.rawStream = null;
    this.audioCtx = null;
    this.destination = null;
  }

  async createCleanMicStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone API is not supported in this browser.');
    }

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioCtx();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const source = this.audioCtx.createMediaStreamSource(this.rawStream);

    // High-pass filter (~85Hz) to remove low-frequency rumble/fan hum
    const highPass = this.audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 85;

    // Gentle compressor to balance voice levels and prevent clipping
    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;

    this.destination = this.audioCtx.createMediaStreamDestination();

    source.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(this.destination);

    return this.destination.stream;
  }

  async cleanup() {
    if (this.rawStream) {
      this.rawStream.getTracks().forEach((t) => t.stop());
      this.rawStream = null;
    }
    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }
    this.destination = null;
  }
}