const SlideManager = {
  createDefaultProject(name, tag = '') {
    const cleanName = (name || 'Untitled Class').trim();
    return {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: cleanName,
      tag: (tag || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      defaults: {
        headerTitle: cleanName,
        logoDataUrl: '',
        footerLeft: '',
        watermarkText: '',
        bgColor: '#ffffff',
        headerColor: '#1e293b',
        footerColor: '#1e293b'
      },
      slides: [
        this.createSlide('intro', { title: cleanName, subtitle: 'Presentation & Class Notes' })
      ],
      recordingBlob: null,
      recordingMimeType: ''
    };
  },

  createSlide(type = 'theory', overrides = {}) {
    return {
      id: 'sl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type, // intro | theory | mcq | outro | blank
      layout: 'full-text', // full-text | text-image | full-image
      title: '',
      subtitle: '',
      text: '',
      imageDataUrl: '',
      question: '',
      options: ['', '', '', ''],
      strokes: [],
      ...overrides
    };
  },

  getMcqNumber(project, slideIndex) {
    let count = 0;
    for (let i = 0; i <= slideIndex; i++) {
      if (project.slides[i] && project.slides[i].type === 'mcq') {
        count++;
      }
    }
    return count;
  },

  mountScaledStage(hostEl, project, slideIndex, options = {}) {
    const { interactiveCanvas = false, onPenInit = null } = options;
    const slide = project.slides[slideIndex];
    const total = project.slides.length;
    const def = project.defaults;

    hostEl.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'logical-stage';
    stage.style.backgroundColor = def.bgColor || '#ffffff';

    // Layer 1: Optional Text-Only Watermark
    if (def.watermarkText && def.watermarkText.trim()) {
      const wm = document.createElement('div');
      wm.className = 'stage-watermark';
      wm.textContent = def.watermarkText.trim();
      stage.appendChild(wm);
    }

    // Layer 2: Header
    const header = document.createElement('div');
    header.className = 'stage-header';
    header.style.backgroundColor = def.headerColor || '#1e293b';

    const hLeft = document.createElement('div');
    hLeft.className = 'stage-header-left';
    if (def.logoDataUrl) {
      const img = document.createElement('img');
      img.className = 'stage-header-logo';
      img.src = def.logoDataUrl;
      hLeft.appendChild(img);
    }
    const hTitle = document.createElement('div');
    hTitle.className = 'stage-header-title';
    hTitle.textContent = def.headerTitle || project.name;
    hLeft.appendChild(hTitle);
    header.appendChild(hLeft);
    stage.appendChild(header);

    // Layer 2: Main Content
    const body = document.createElement('div');
    body.className = 'stage-body';
    this._renderSlideBodyDOM(body, project, slideIndex);
    stage.appendChild(body);

    // Layer 2: Footer
    const footer = document.createElement('div');
    footer.className = 'stage-footer';
    footer.style.backgroundColor = def.footerColor || '#1e293b';

    const fLeft = document.createElement('span');
    fLeft.textContent = (def.footerLeft || '').trim();
    const fRight = document.createElement('span');
    fRight.textContent = `${slideIndex + 1} / ${total}`;
    footer.appendChild(fLeft);
    footer.appendChild(fRight);
    stage.appendChild(footer);

    // Layer 3: Dedicated Per-Slide Canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.width = 1920;
    canvas.height = 1080;
    if (!interactiveCanvas) {
      canvas.style.pointerEvents = 'none';
    }
    stage.appendChild(canvas);

    hostEl.appendChild(stage);

    // Proportional 1920x1080 scaling via ResizeObserver
    const updateScale = () => {
      const rect = hostEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.min(rect.width / 1920, rect.height / 1080);
      stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    updateScale();

    if (hostEl._ro) hostEl._ro.disconnect();
    const ro = new ResizeObserver(updateScale);
    ro.observe(hostEl);
    hostEl._ro = ro;

    if (interactiveCanvas && onPenInit) {
      onPenInit(canvas);
    } else {
      const ctx = canvas.getContext('2d');
      (slide.strokes || []).forEach((s) => WhiteboardPenEngine.drawSmoothStroke(ctx, s));
    }
  },

  _renderSlideBodyDOM(body, project, slideIndex) {
    const slide = project.slides[slideIndex];
    if (!slide || slide.type === 'blank') return;

    if (slide.type === 'intro' || slide.type === 'outro') {
      const wrap = document.createElement('div');
      wrap.className = 's-intro';
      const h1 = document.createElement('h1');
      h1.textContent = slide.title || (slide.type === 'outro' ? 'Thank You!' : '');
      const p = document.createElement('p');
      p.textContent = slide.subtitle || '';
      wrap.appendChild(h1);
      if (slide.subtitle) wrap.appendChild(p);
      body.appendChild(wrap);
      return;
    }

    if (slide.type === 'theory') {
      if (slide.layout === 'full-image') {
        const box = document.createElement('div');
        box.className = 's-img-box';
        if (slide.imageDataUrl) {
          const img = document.createElement('img');
          img.src = slide.imageDataUrl;
          box.appendChild(img);
        }
        body.appendChild(box);
      } else if (slide.layout === 'text-image') {
        const split = document.createElement('div');
        split.className = 's-theory-split';
        const txt = document.createElement('div');
        txt.className = 's-text';
        txt.textContent = slide.text || '';
        const box = document.createElement('div');
        box.className = 's-img-box';
        if (slide.imageDataUrl) {
          const img = document.createElement('img');
          img.src = slide.imageDataUrl;
          box.appendChild(img);
        }
        split.appendChild(txt);
        split.appendChild(box);
        body.appendChild(split);
      } else {
        const txt = document.createElement('div');
        txt.className = 's-theory-full';
        txt.textContent = slide.text || '';
        body.appendChild(txt);
      }
      return;
    }

    if (slide.type === 'mcq') {
      const qNum = this.getMcqNumber(project, slideIndex);
      const wrap = document.createElement('div');
      wrap.className = 's-mcq';

      const top = document.createElement('div');
      top.className = 's-mcq-top';
      const qEl = document.createElement('div');
      qEl.className = 's-mcq-q';
      qEl.textContent = `Q${qNum}. ${slide.question || ''}`;
      top.appendChild(qEl);

      if (slide.imageDataUrl) {
        const img = document.createElement('img');
        img.className = 's-mcq-img';
        img.src = slide.imageDataUrl;
        top.appendChild(img);
      }
      wrap.appendChild(top);

      const optsGrid = document.createElement('div');
      optsGrid.className = 's-mcq-options';
      const labels = ['A', 'B', 'C', 'D'];
      (slide.options || ['', '', '', '']).forEach((optText, idx) => {
        const card = document.createElement('div');
        card.className = 's-mcq-opt';
        card.textContent = `${labels[idx]}. ${optText}`;
        optsGrid.appendChild(card);
      });
      wrap.appendChild(optsGrid);
      body.appendChild(wrap);
    }
  },

  // Render exact 1920x1080 composite frame (for Recording & PDF Export)
  async renderSlideToCanvas(ctx, project, slideIndex, liveStrokesOverride = null) {
    const slide = project.slides[slideIndex];
    const total = project.slides.length;
    const def = project.defaults;

    ctx.save();
    // Layer 1: Background
    ctx.fillStyle = def.bgColor || '#ffffff';
    ctx.fillRect(0, 0, 1920, 1080);

    // Layer 1: Watermark Text
    if (def.watermarkText && def.watermarkText.trim()) {
      ctx.save();
      ctx.translate(960, 540);
      ctx.rotate((-22 * Math.PI) / 180);
      ctx.font = '800 105px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.07)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.watermarkText.trim(), 0, 0);
      ctx.restore();
    }

    // Layer 2: Header
    ctx.fillStyle = def.headerColor || '#1e293b';
    ctx.fillRect(0, 0, 1920, 110);

    let titleX = 56;
    if (def.logoDataUrl) {
      const logoImg = await this._loadImage(def.logoDataUrl);
      if (logoImg) {
        const ratio = logoImg.width / logoImg.height;
        const drawH = 68;
        const drawW = drawH * ratio;
        ctx.drawImage(logoImg, titleX, 21, drawW, drawH);
        titleX += drawW + 24;
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.headerTitle || project.name, titleX, 55);

    // Layer 2: Slide Main Content
    ctx.fillStyle = '#0f172a';
    if (slide && slide.type !== 'blank') {
      if (slide.type === 'intro' || slide.type === 'outro') {
        ctx.textAlign = 'center';
        ctx.font = '800 84px system-ui, sans-serif';
        const mainTitle = slide.title || (slide.type === 'outro' ? 'Thank You!' : '');
        this._drawWrappedText(ctx, mainTitle, 960, slide.subtitle ? 470 : 540, 1650, 98, true);
        if (slide.subtitle) {
          ctx.font = '500 44px system-ui, sans-serif';
          ctx.fillStyle = '#334155';
          this._drawWrappedText(ctx, slide.subtitle, 960, 620, 1500, 56, true);
        }
      } else if (slide.type === 'theory') {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (slide.layout === 'full-image' && slide.imageDataUrl) {
          const img = await this._loadImage(slide.imageDataUrl);
          if (img) this._drawContainImage(ctx, img, 80, 145, 1760, 820);
        } else if (slide.layout === 'text-image') {
          ctx.font = '400 38px system-ui, sans-serif';
          this._drawWrappedText(ctx, slide.text || '', 64, 170, 960, 54, false);
          if (slide.imageDataUrl) {
            const img = await this._loadImage(slide.imageDataUrl);
            if (img) this._drawContainImage(ctx, img, 1060, 160, 790, 790);
          }
        } else {
          ctx.font = '400 42px system-ui, sans-serif';
          this._drawWrappedText(ctx, slide.text || '', 64, 170, 1790, 60, false);
        }
      } else if (slide.type === 'mcq') {
        const qNum = this.getMcqNumber(project, slideIndex);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '700 42px system-ui, sans-serif';
        const qMaxW = slide.imageDataUrl ? 1260 : 1780;
        this._drawWrappedText(ctx, `Q${qNum}. ${slide.question || ''}`, 64, 165, qMaxW, 56, false);

        if (slide.imageDataUrl) {
          const img = await this._loadImage(slide.imageDataUrl);
          if (img) this._drawContainImage(ctx, img, 1360, 150, 490, 290);
        }

        const labels = ['A', 'B', 'C', 'D'];
        const opts = slide.options || ['', '', '', ''];
        const startY = 500;
        const boxW = 870;
        const boxH = 195;
        for (let i = 0; i < 4; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const bx = 64 + col * (boxW + 52);
          const by = startY + row * (boxH + 34);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, boxW, boxH, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = '600 35px system-ui, sans-serif';
          this._drawWrappedText(ctx, `${labels[i]}. ${opts[i] || ''}`, bx + 26, by + 28, boxW - 52, 46, false);
        }
      }
    }

    // Layer 2: Footer
    ctx.fillStyle = def.footerColor || '#1e293b';
    ctx.fillRect(0, 1004, 1920, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    if (def.footerLeft && def.footerLeft.trim()) {
      ctx.textAlign = 'left';
      ctx.fillText(def.footerLeft.trim(), 56, 1042);
    }
    ctx.textAlign = 'right';
    ctx.fillText(`${slideIndex + 1} / ${total}`, 1864, 1042);

    // Layer 3: Whiteboard Strokes
    const strokes = liveStrokesOverride || (slide && slide.strokes) || [];
    for (const s of strokes) {
      WhiteboardPenEngine.drawSmoothStroke(ctx, s);
    }

    ctx.restore();
  },

  _drawContainImage(ctx, img, x, y, maxW, maxH) {
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = x + (maxW - w) / 2;
    const dy = y + (maxH - h) / 2;
    ctx.drawImage(img, dx, dy, w, h);
  },

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, centered) {
    const paragraphs = String(text).split('\n');
    let curY = y;
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          ctx.fillText(line, x, curY);
          line = word;
          curY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
  },

  _imageCache: new Map(),
  _loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (this._imageCache.has(src)) return Promise.resolve(this._imageCache.get(src));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
};