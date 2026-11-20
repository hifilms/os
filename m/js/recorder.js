class StageRecorder {
  constructor(renderCompositeFrameFn) {
    this.renderCompositeFrameFn = renderCompositeFrameFn;
    this.recordCanvas = document.createElement('canvas');
    this.recordCanvas.width = 1920;
    this.recordCanvas.height = 1080;
    this.recordCtx = this.recordCanvas.getContext('2d');

    this.audioCleaner = new AudioCleaner();
    this.mediaRecorder = null;
    this.chunks = [];
    this.state = 'idle'; // idle | recording | paused
    this.frameTimer = null;
    this.clockTimer = null;
    this.elapsedSeconds = 0;
    this.onTimerTick = null;
    this.mimeType = 'video/webm';
  }

  static isSupported() {
    return Boolean(
      window.MediaRecorder &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
    );
  }

  static pickBestMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  async start(onTimerTick) {
    if (!StageRecorder.isSupported()) {
      throw new Error('This browser does not support built-in Canvas MediaRecorder. Please use modern Chrome, Edge, or Brave.');
    }

    this.onTimerTick = onTimerTick;
    this.chunks = [];
    this.elapsedSeconds = 0;

    // Render initial 1920x1080 stage frame (without toolbar)
    await this.renderCompositeFrameFn(this.recordCtx);

    const micStream = await this.audioCleaner.createCleanMicStream();
    const canvasStream = this.recordCanvas.captureStream(30);

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...micStream.getAudioTracks()
    ]);

    this.mimeType = StageRecorder.pickBestMimeType();
    const options = { videoBitsPerSecond: 7000000 }; // 7 Mbps crisp 1080p
    if (this.mimeType) options.mimeType = this.mimeType;

    this.mediaRecorder = new MediaRecorder(combinedStream, options);
    this.mimeType = this.mediaRecorder.mimeType || this.mimeType || 'video/webm';

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    // Keep 30fps composite rendering running even in background/fullscreen
    this.frameTimer = setInterval(() => {
      if (this.state === 'recording') {
        this.renderCompositeFrameFn(this.recordCtx);
      }
    }, 1000 / 30);

    this.clockTimer = setInterval(() => {
      if (this.state === 'recording') {
        this.elapsedSeconds++;
        if (this.onTimerTick) this.onTimerTick(this.elapsedSeconds, this.state);
      }
    }, 1000);

    this.mediaRecorder.start(1000);
    this.state = 'recording';
    if (this.onTimerTick) this.onTimerTick(0, this.state);
  }

  togglePause() {
    if (!this.mediaRecorder) return this.state;
    if (this.state === 'recording' && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.state = 'paused';
    } else if (this.state === 'paused' && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.state = 'recording';
    }
    if (this.onTimerTick) this.onTimerTick(this.elapsedSeconds, this.state);
    return this.state;
  }

  async stopAndFinalize() {
    if (!this.mediaRecorder || this.state === 'idle') return null;

    clearInterval(this.frameTimer);
    clearInterval(this.clockTimer);
    this.frameTimer = null;
    this.clockTimer = null;

    await this.renderCompositeFrameFn(this.recordCtx);

    const blob = await new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const finalBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve(finalBlob);
      };
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        resolve(new Blob(this.chunks, { type: this.mimeType }));
      }
    });

    await this.audioCleaner.cleanup();
    this.mediaRecorder = null;
    this.chunks = [];
    this.state = 'idle';

    return { blob, mimeType: this.mimeType };
  }
}