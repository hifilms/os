class WhiteboardPenEngine {
  constructor(canvas, onStrokeCommit) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStrokeCommit = onStrokeCommit;

    this.strokes = [];
    this.redoStack = [];
    this.currentStroke = null;
    this.isDrawing = false;
    this.rafPending = false;

    this.color = '#dc2626';
    this.size = 5;
    this.isEraser = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', (e) => this._onUp(e));
  }

  _toLogicalPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  _onDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const pt = this._toLogicalPoint(e);
    this.isDrawing = true;
    this.currentStroke = {
      color: this.color,
      size: this.isEraser ? Math.max(this.size * 3.5, 24) : this.size,
      eraser: this.isEraser,
      points: [pt]
    };
    this._scheduleRender();
  }

  _onMove(e) {
    if (!this.isDrawing || !this.currentStroke) return;
    e.preventDefault();
    const pt = this._toLogicalPoint(e);
    const pts = this.currentStroke.points;
    const last = pts[pts.length - 1];
    // Skip redundant sub-pixel points for ultra-smooth curves
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.2) {
      pts.push(pt);
      this._scheduleRender();
    }
  }

  _onUp() {
    if (!this.isDrawing || !this.currentStroke) return;
    this.isDrawing = false;
    if (this.currentStroke.points.length > 0) {
      this.strokes.push(this.currentStroke);
      this.redoStack = [];
      if (this.onStrokeCommit) this.onStrokeCommit(this.getStrokes());
    }
    this.currentStroke = null;
    this._scheduleRender();
  }

  _scheduleRender() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }

  setStrokes(strokes) {
    this.strokes = Array.isArray(strokes) ? JSON.parse(JSON.stringify(strokes)) : [];
    this.redoStack = [];
    this.currentStroke = null;
    this.render();
  }

  getStrokes() {
    return JSON.parse(JSON.stringify(this.strokes));
  }

  undo() {
    if (!this.strokes.length) return;
    this.redoStack.push(this.strokes.pop());
    this.render();
    if (this.onStrokeCommit) this.onStrokeCommit(this.getStrokes());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.strokes.push(this.redoStack.pop());
    this.render();
    if (this.onStrokeCommit) this.onStrokeCommit(this.getStrokes());
  }

  clear() {
    this.strokes = [];
    this.redoStack = [];
    this.currentStroke = null;
    this.render();
    if (this.onStrokeCommit) this.onStrokeCommit(this.getStrokes());
  }

  render(targetCtx = this.ctx) {
    targetCtx.clearRect(0, 0, 1920, 1080);
    for (const stroke of this.strokes) {
      WhiteboardPenEngine.drawSmoothStroke(targetCtx, stroke);
    }
    if (this.currentStroke) {
      WhiteboardPenEngine.drawSmoothStroke(targetCtx, this.currentStroke);
    }
  }

  static drawSmoothStroke(ctx, stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.size;

    if (stroke.eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }
}