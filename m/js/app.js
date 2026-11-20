const App = {
  projects: [],
  activeProject: null,
  activeSlideIndex: 0,
  activeTagFilter: 'ALL',
  penEngine: null,
  recorder: null,

  async init() {
    hydrateIcons();
    await AppDB.init();

    const globalLogo = await AppDB.getSetting('globalBrandLogo');
    if (globalLogo) this._applyHomeLogo(globalLogo);

    this._bindHomeEvents();
    this._bindWorkspaceEvents();
    this._bindWhiteboardEvents();
    this._bindModalEvents();

    await this.refreshProjectsList();
    await this._checkStorageAndWarnIfNeeded();
  },

  /* ================= CRITICAL BLOCKING MESSAGE BOX ================= */
  showCriticalModal({ title, message, buttons = [] }) {
    const modal = document.getElementById('critical-modal');
    document.getElementById('crit-title').textContent = title || 'Important Notice';
    document.getElementById('crit-message').textContent = message || '';

    const actionsEl = document.getElementById('crit-actions');
    actionsEl.innerHTML = '';

    return new Promise((resolve) => {
      const btns = buttons.length ? buttons : [{ label: 'OK', className: 'btn btn-primary', value: true }];
      btns.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = b.className || 'btn btn-secondary';
        btn.textContent = b.label;
        btn.onclick = () => {
          modal.classList.add('hidden');
          resolve(b.value);
        };
        actionsEl.appendChild(btn);
      });
      modal.classList.remove('hidden');
    });
  },

  async _checkStorageAndWarnIfNeeded() {
    const status = await AppDB.checkStorageStatus();
    if (status.isNearLimit) {
      const usedMB = (status.videoBytes / (1024 * 1024)).toFixed(1);
      await this.showCriticalModal({
        title: 'Storage Limit Warning',
        message: `Browser storage is running low (${usedMB} MB used by recordings). Please download important videos and delete old recordings from the Recordings Manager to prevent data loss.`,
        buttons: [
          { label: 'Open Recordings', className: 'btn btn-primary', value: 'open' },
          { label: 'Close', className: 'btn btn-secondary', value: 'close' }
        ]
      }).then((res) => {
        if (res === 'open') this.openRecordingsManager();
      });
    }
  },

  /* ================= HOME VIEW & TAG FILTERING ================= */
  _applyHomeLogo(dataUrl) {
    const wrap = document.getElementById('home-brand-logo-wrap');
    const img = document.getElementById('home-brand-logo');
    if (dataUrl) {
      img.src = dataUrl;
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  },

  _getUniqueTags() {
    const seen = new Map();
    this.projects.forEach((p) => {
      const t = (p.tag || '').trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.set(t.toLowerCase(), t);
      }
    });
    return Array.from(seen.values());
  },

  _syncTagDatalist() {
    const dl = document.getElementById('tag-suggestions-list');
    dl.innerHTML = '';
    this._getUniqueTags().forEach((tag) => {
      const opt = document.createElement('option');
      opt.value = tag;
      dl.appendChild(opt);
    });
  },

  async refreshProjectsList() {
    this.projects = await AppDB.getAllProjects();
    this._syncTagDatalist();

    const tags = this._getUniqueTags();
    if (
      this.activeTagFilter !== 'ALL' &&
      !tags.some((t) => t.toLowerCase() === this.activeTagFilter.toLowerCase())
    ) {
      this.activeTagFilter = 'ALL';
    }

    // Render Filter Tabs: All + existing tags
    const tabsEl = document.getElementById('tag-filter-tabs');
    tabsEl.innerHTML = '';

    const allTab = document.createElement('button');
    allTab.className = 'filter-tab' + (this.activeTagFilter === 'ALL' ? ' active' : '');
    allTab.textContent = `All (${this.projects.length})`;
    allTab.onclick = () => {
      this.activeTagFilter = 'ALL';
      this.refreshProjectsList();
    };
    tabsEl.appendChild(allTab);

    tags.forEach((tag) => {
      const btn = document.createElement('button');
      const isAct = this.activeTagFilter.toLowerCase() === tag.toLowerCase();
      btn.className = 'filter-tab' + (isAct ? ' active' : '');
      btn.textContent = tag;
      btn.onclick = () => {
        this.activeTagFilter = tag;
        this.refreshProjectsList();
      };
      tabsEl.appendChild(btn);
    });

    // Render Filtered Project Folders
    const grid = document.getElementById('projects-grid');
    const emptyEl = document.getElementById('projects-empty');
    grid.innerHTML = '';

    const filtered = this.projects.filter((p) => {
      if (this.activeTagFilter === 'ALL') return true;
      return (p.tag || '').trim().toLowerCase() === this.activeTagFilter.toLowerCase();
    });

    if (!filtered.length) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    filtered.forEach((proj) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.onclick = () => this.openWorkspace(proj.id);

      const top = document.createElement('div');
      top.className = 'project-card-top';
      const title = document.createElement('div');
      title.className = 'project-card-title';
      title.textContent = proj.name;
      top.appendChild(title);

      if (proj.tag) {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.textContent = proj.tag;
        top.appendChild(badge);
      }

      const meta = document.createElement('div');
      meta.className = 'project-card-meta';
      const slideCount = `${proj.slides.length} slide${proj.slides.length > 1 ? 's' : ''}`;
      const hasRec = proj.recordingBlob ? ' • Video Saved' : '';
      const info = document.createElement('span');
      info.textContent = slideCount + hasRec;

      const delBtn = document.createElement('button');
      delBtn.className = 'mini-btn';
      delBtn.title = 'Delete Project';
      delBtn.innerHTML = ICONS.trash;
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await this.showCriticalModal({
          title: 'Delete Project?',
          message: `Are you sure you want to permanently delete "${proj.name}" and its slides/recordings?`,
          buttons: [
            { label: 'Cancel', className: 'btn btn-secondary', value: false },
            { label: 'Delete Project', className: 'btn btn-danger', value: true }
          ]
        });
        if (ok) {
          await AppDB.deleteProject(proj.id);
          await this.refreshProjectsList();
        }
      };

      meta.appendChild(info);
      meta.appendChild(delBtn);
      card.appendChild(top);
      card.appendChild(meta);
      grid.appendChild(card);
    });
  },

  _bindHomeEvents() {
    document.getElementById('input-global-logo').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await this._readAndResizeImage(file, 600);
      await AppDB.setSetting('globalBrandLogo', dataUrl);
      this._applyHomeLogo(dataUrl);
    });

    document.getElementById('btn-create-project').addEventListener('click', () => {
      const modal = document.getElementById('create-project-modal');
      const nameIn = document.getElementById('cp-name');
      const tagIn = document.getElementById('cp-tag');
      const chips = document.getElementById('cp-tag-chips');

      nameIn.value = '';
      tagIn.value = '';
      chips.innerHTML = '';

      const tags = this._getUniqueTags();
      tags.forEach((t) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip';
        chip.textContent = t;
        chip.onclick = () => {
          tagIn.value = t;
        };
        chips.appendChild(chip);
      });

      modal.classList.remove('hidden');
      nameIn.focus();
    });

    document.getElementById('cp-cancel').addEventListener('click', () => {
      document.getElementById('create-project-modal').classList.add('hidden');
    });

    document.getElementById('cp-confirm').addEventListener('click', async () => {
      const name = document.getElementById('cp-name').value.trim() || 'Untitled Presentation';
      const tag = document.getElementById('cp-tag').value.trim(); // Blank if not entered
      const globalLogo = await AppDB.getSetting('globalBrandLogo');

      const proj = SlideManager.createDefaultProject(name, tag);
      if (globalLogo) proj.defaults.logoDataUrl = globalLogo;

      await AppDB.saveProject(proj);
      document.getElementById('create-project-modal').classList.add('hidden');
      await this.refreshProjectsList();
      await this.openWorkspace(proj.id);
    });

    document.getElementById('btn-import-project').addEventListener('click', () => {
      document.getElementById('input-import-project').click();
    });

    document.getElementById('input-import-project').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.slides) || !data.slides.length) {
          throw new Error('Invalid project file.');
        }
        data.id = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        data.recordingBlob = null;
        data.recordingMimeType = '';
        await AppDB.saveProject(data);
        await this.refreshProjectsList();
      } catch (err) {
        await this.showCriticalModal({
          title: 'Import Failed',
          message: 'Could not import project file. Please ensure it is a valid exported project JSON file.'
        });
      }
      e.target.value = '';
    });

    document.getElementById('btn-open-recordings').addEventListener('click', () => {
      this.openRecordingsManager();
    });
  },

  /* ================= WORKSPACE VIEW ================= */
  async openWorkspace(projectId) {
    const proj = await AppDB.getProject(projectId);
    if (!proj) return;
    this.activeProject = proj;
    this.activeSlideIndex = 0;

    this._switchView('workspace-view');
    document.getElementById('ws-project-name').value = proj.name;
    this._syncVideoHeaderButtons();
    this._loadDefaultsForm();
    this._renderSlidesAside();
    this._renderActiveSlideEditor();
  },

  _syncVideoHeaderButtons() {
    const hasVideo = Boolean(this.activeProject && this.activeProject.recordingBlob);
    document.getElementById('btn-download-video').classList.toggle('hidden', !hasVideo);
    document.getElementById('btn-delete-video').classList.toggle('hidden', !hasVideo);
  },

  _loadDefaultsForm() {
    const p = this.activeProject;
    const d = p.defaults;
    document.getElementById('def-tag').value = p.tag || '';
    document.getElementById('def-header-title').value = d.headerTitle || p.name;
    document.getElementById('def-footer-left').value = d.footerLeft || '';
    document.getElementById('def-watermark').value = d.watermarkText || '';
    document.getElementById('def-bg-color').value = d.bgColor || '#ffffff';
    document.getElementById('def-header-color').value = d.headerColor || '#1e293b';
    document.getElementById('def-footer-color').value = d.footerColor || '#1e293b';
    document.getElementById('def-logo-remove').classList.toggle('hidden', !d.logoDataUrl);
  },

  _renderSlidesAside() {
    const listEl = document.getElementById('slides-list');
    listEl.innerHTML = '';
    const slides = this.activeProject.slides;

    // Reverse visual order: newest at top directly under '+ Add Slide', counting from bottom (1, 2, 3...)
    for (let i = slides.length - 1; i >= 0; i--) {
      const slide = slides[i];
      const slideNum = i + 1;
      const item = document.createElement('div');
      item.className = 'slide-item' + (i === this.activeSlideIndex ? ' active' : '');
      item.onclick = () => {
        this.activeSlideIndex = i;
        this._renderSlidesAside();
        this._renderActiveSlideEditor();
      };

      const head = document.createElement('div');
      head.className = 'slide-item-head';
      const badge = document.createElement('span');
      badge.className = 'slide-num-badge';
      badge.textContent = String(slideNum);

      const label = document.createElement('span');
      label.className = 'slide-item-title';
      label.textContent = this._getSlideSummary(slide);

      head.appendChild(badge);
      head.appendChild(label);

      const actions = document.createElement('div');
      actions.className = 'slide-item-actions';

      const dupBtn = this._makeMiniIconBtn(ICONS.copy, 'Duplicate', async (e) => {
        e.stopPropagation();
        const copy = JSON.parse(JSON.stringify(slide));
        copy.id = 'sl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        slides.splice(i + 1, 0, copy);
        this.activeSlideIndex = i + 1;
        await this._persistAndRefreshEditor();
      });

      const upBtn = this._makeMiniIconBtn(ICONS.up, 'Move Forward', async (e) => {
        e.stopPropagation();
        if (i >= slides.length - 1) return;
        [slides[i], slides[i + 1]] = [slides[i + 1], slides[i]];
        this.activeSlideIndex = i + 1;
        await this._persistAndRefreshEditor();
      });

      const downBtn = this._makeMiniIconBtn(ICONS.down, 'Move Backward', async (e) => {
        e.stopPropagation();
        if (i <= 0) return;
        [slides[i], slides[i - 1]] = [slides[i - 1], slides[i]];
        this.activeSlideIndex = i - 1;
        await this._persistAndRefreshEditor();
      });

      const delBtn = this._makeMiniIconBtn(ICONS.trash, 'Delete Slide', async (e) => {
        e.stopPropagation();
        if (slides.length <= 1) return;
        slides.splice(i, 1);
        this.activeSlideIndex = Math.min(this.activeSlideIndex, slides.length - 1);
        await this._persistAndRefreshEditor();
      });

      actions.append(dupBtn, upBtn, downBtn, delBtn);
      item.append(head, actions);
      listEl.appendChild(item);
    }
  },

  _makeMiniIconBtn(svg, title, handler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-btn';
    b.title = title;
    b.innerHTML = `<span class="icon-slot" style="width:14px;height:14px">${svg}</span>`;
    b.onclick = handler;
    return b;
  },

  _getSlideSummary(slide) {
    if (slide.type === 'blank') return 'Blank Whiteboard Slide';
    if (slide.type === 'intro') return `Intro: ${slide.title || 'Untitled'}`;
    if (slide.type === 'outro') return `Outro: ${slide.title || 'Closing'}`;
    if (slide.type === 'mcq') return `MCQ: ${slide.question || 'Question'}`;
    return `Theory: ${slide.text ? slide.text.slice(0, 26) : slide.layout}`;
  },

  async _persistAndRefreshEditor() {
    await AppDB.saveProject(this.activeProject);
    this._renderSlidesAside();
    this._renderActiveSlideEditor();
  },

  _renderActiveSlideEditor() {
    const slide = this.activeProject.slides[this.activeSlideIndex];
    const form = document.getElementById('slide-form-container');
    const subSel = document.getElementById('theory-layout-selector');

    document.querySelectorAll('.type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === slide.type);
    });

    subSel.classList.toggle('hidden', slide.type !== 'theory');
    if (slide.type === 'theory') {
      document.querySelectorAll('.sub-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.layout === (slide.layout || 'full-text'));
      });
    }

    form.innerHTML = '';

    if (slide.type === 'blank') {
      const info = document.createElement('p');
      info.style.fontSize = '14px';
      info.style.color = '#475569';
      info.textContent = 'Blank Whiteboard Slide: Header and Footer remain active while Main Content stays blank for live drawing.';
      form.appendChild(info);
    } else if (slide.type === 'intro' || slide.type === 'outro') {
      form.appendChild(this._makeTextField('Title', slide.title, (val) => {
        slide.title = val;
        this._saveAndUpdatePreview();
      }));
      form.appendChild(this._makeTextField('Subtitle', slide.subtitle, (val) => {
        slide.subtitle = val;
        this._saveAndUpdatePreview();
      }));
    } else if (slide.type === 'theory') {
      const layout = slide.layout || 'full-text';
      if (layout === 'full-text' || layout === 'text-image') {
        form.appendChild(this._makeTextAreaField('Slide Content Text', slide.text, (val) => {
          slide.text = val;
          this._saveAndUpdatePreview();
        }));
      }
      if (layout === 'text-image' || layout === 'full-image') {
        form.appendChild(this._makeImageUploadPasteBox(slide));
      }
    } else if (slide.type === 'mcq') {
      const qNum = SlideManager.getMcqNumber(this.activeProject, this.activeSlideIndex);
      form.appendChild(this._makeTextAreaField(`Question (Auto-numbered Q${qNum})`, slide.question, (val) => {
        slide.question = val;
        this._saveAndUpdatePreview();
      }, 3));
      form.appendChild(this._makeImageUploadPasteBox(slide, 'Optional Question Image (Upload or Ctrl+V)'));

      const labels = ['A', 'B', 'C', 'D'];
      if (!Array.isArray(slide.options)) slide.options = ['', '', '', ''];
      labels.forEach((lbl, idx) => {
        form.appendChild(this._makeTextField(`Option ${lbl}`, slide.options[idx] || '', (val) => {
          slide.options[idx] = val;
          this._saveAndUpdatePreview();
        }));
      });
    }

    SlideManager.mountScaledStage(
      document.getElementById('editor-stage-host'),
      this.activeProject,
      this.activeSlideIndex
    );
  },

  _makeTextField(labelText, value, onInput) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.addEventListener('input', () => onInput(input.value));
    label.append(span, input);
    return label;
  },

  _makeTextAreaField(labelText, value, onInput, rows = 5) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const ta = document.createElement('textarea');
    ta.rows = rows;
    ta.value = value || '';
    ta.addEventListener('input', () => onInput(ta.value));
    label.append(span, ta);
    return label;
  },

  _makeImageUploadPasteBox(slide, heading = 'Slide Image (Click to Upload or Paste Ctrl+V)') {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = heading;

    const zone = document.createElement('div');
    zone.className = 'paste-zone';
    zone.tabIndex = 0;
    zone.textContent = 'Click to choose image or press Ctrl+V / Cmd+V here';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    const handleFile = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      slide.imageDataUrl = await this._readAndResizeImage(file, 1600);
      await this._persistAndRefreshEditor();
    };

    zone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFile(e.target.files[0]);
    zone.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          handleFile(item.getAsFile());
          break;
        }
      }
    });

    wrap.append(span, zone, fileInput);

    if (slide.imageDataUrl) {
      const img = document.createElement('img');
      img.className = 'paste-preview';
      img.src = slide.imageDataUrl;
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'btn btn-danger btn-sm';
      rmBtn.textContent = 'Remove Image';
      rmBtn.onclick = async () => {
        slide.imageDataUrl = '';
        await this._persistAndRefreshEditor();
      };
      wrap.append(img, rmBtn);
    }

    return wrap;
  },

  async _saveAndUpdatePreview() {
    await AppDB.saveProject(this.activeProject);
    this._renderSlidesAside();
    SlideManager.mountScaledStage(
      document.getElementById('editor-stage-host'),
      this.activeProject,
      this.activeSlideIndex
    );
  },

  _bindWorkspaceEvents() {
    document.getElementById('btn-back-home').addEventListener('click', async () => {
      this._switchView('home-view');
      await this.refreshProjectsList();
      await this._checkStorageAndWarnIfNeeded();
    });

    document.getElementById('ws-project-name').addEventListener('input', async (e) => {
      if (!this.activeProject) return;
      this.activeProject.name = e.target.value.trim() || 'Untitled Class';
      await AppDB.saveProject(this.activeProject);
    });

    // Aside Tabs
    document.querySelectorAll('.aside-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.aside-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.aside-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
      });
    });

    // + Add Slide (inserts at end of canonical deck, displayed at top of list, numbered from bottom)
    document.getElementById('btn-add-slide').addEventListener('click', async () => {
      const newSlide = SlideManager.createSlide('theory');
      this.activeProject.slides.push(newSlide);
      this.activeSlideIndex = this.activeProject.slides.length - 1;
      await this._persistAndRefreshEditor();
    });

    // Defaults Tab Inputs (including Tag edit)
    const bindDefaultInput = (id, handler) => {
      document.getElementById(id).addEventListener('input', async (e) => {
        if (!this.activeProject) return;
        handler(e.target.value);
        await this._saveAndUpdatePreview();
      });
    };

    bindDefaultInput('def-tag', (val) => {
      this.activeProject.tag = val.trim();
    });
    bindDefaultInput('def-header-title', (val) => {
      this.activeProject.defaults.headerTitle = val;
    });
    bindDefaultInput('def-footer-left', (val) => {
      this.activeProject.defaults.footerLeft = val;
    });
    bindDefaultInput('def-watermark', (val) => {
      this.activeProject.defaults.watermarkText = val;
    });
    bindDefaultInput('def-bg-color', (val) => {
      this.activeProject.defaults.bgColor = val;
    });
    bindDefaultInput('def-header-color', (val) => {
      this.activeProject.defaults.headerColor = val;
    });
    bindDefaultInput('def-footer-color', (val) => {
      this.activeProject.defaults.footerColor = val;
    });

    document.getElementById('def-logo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.activeProject.defaults.logoDataUrl = await this._readAndResizeImage(file, 600);
      document.getElementById('def-logo-remove').classList.remove('hidden');
      await this._saveAndUpdatePreview();
    });

    document.getElementById('def-logo-remove').addEventListener('click', async () => {
      this.activeProject.defaults.logoDataUrl = '';
      document.getElementById('def-logo-remove').classList.add('hidden');
      await this._saveAndUpdatePreview();
    });

    // Slide Type & Theory Layout Buttons
    document.querySelectorAll('.type-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slide = this.activeProject.slides[this.activeSlideIndex];
        slide.type = btn.dataset.type;
        await this._persistAndRefreshEditor();
      });
    });

    document.querySelectorAll('.sub-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slide = this.activeProject.slides[this.activeSlideIndex];
        slide.layout = btn.dataset.layout;
        await this._persistAndRefreshEditor();
      });
    });

    // Header Actions
    document.getElementById('btn-ws-recordings').addEventListener('click', () => {
      this.openRecordingsManager();
    });

    document.getElementById('btn-download-project').addEventListener('click', () => {
      const exportObj = { ...this.activeProject, recordingBlob: null, recordingMimeType: '' };
      const blob = new Blob([JSON.stringify(exportObj)], { type: 'application/json' });
      this._triggerDownload(blob, `${this.activeProject.name || 'project'}.json`);
    });

    document.getElementById('btn-download-pdf').addEventListener('click', async () => {
      await PDFExporter.exportProjectPDF(this.activeProject);
    });

    document.getElementById('btn-download-video').addEventListener('click', () => {
      if (!this.activeProject.recordingBlob) return;
      const ext = (this.activeProject.recordingMimeType || '').includes('mp4') ? 'mp4' : 'webm';
      this._triggerDownload(this.activeProject.recordingBlob, `${this.activeProject.name || 'class'}.${ext}`);
    });

    document.getElementById('btn-delete-video').addEventListener('click', async () => {
      const ok = await this.showCriticalModal({
        title: 'Delete Recorded Video?',
        message: 'This will remove the saved recording from browser storage so you can record a new class.',
        buttons: [
          { label: 'Cancel', className: 'btn btn-secondary', value: false },
          { label: 'Delete Video', className: 'btn btn-danger', value: true }
        ]
      });
      if (!ok) return;
      this.activeProject.recordingBlob = null;
      this.activeProject.recordingMimeType = '';
      await AppDB.saveProject(this.activeProject);
      this._syncVideoHeaderButtons();
    });

    document.getElementById('btn-start-class').addEventListener('click', () => {
      this.openWhiteboard();
    });
  },

  /* ================= 16:9 WHITEBOARD & RECORDING ================= */
  openWhiteboard() {
    this._switchView('whiteboard-view');
    this._mountWhiteboardSlide();
  },

  _mountWhiteboardSlide() {
    const total = this.activeProject.slides.length;
    document.getElementById('wb-counter').textContent = `${this.activeSlideIndex + 1} / ${total}`;

    SlideManager.mountScaledStage(
      document.getElementById('wb-stage-host'),
      this.activeProject,
      this.activeSlideIndex,
      {
        interactiveCanvas: true,
        onPenInit: (canvas) => {
          this.penEngine = new WhiteboardPenEngine(canvas, async (updatedStrokes) => {
            this.activeProject.slides[this.activeSlideIndex].strokes = updatedStrokes;
            await AppDB.saveProject(this.activeProject);
          });
          this.penEngine.color = document.getElementById('wb-pen-color').value;
          this.penEngine.size = Number(document.getElementById('wb-pen-size').value);
          this.penEngine.isEraser = document.getElementById('wb-eraser').classList.contains('active');
          this.penEngine.setStrokes(this.activeProject.slides[this.activeSlideIndex].strokes || []);
        }
      }
    );
  },

  _bindWhiteboardEvents() {
    document.getElementById('wb-prev').addEventListener('click', () => {
      if (this.activeSlideIndex > 0) {
        this.activeSlideIndex--;
        this._mountWhiteboardSlide();
      }
    });

    document.getElementById('wb-next').addEventListener('click', () => {
      if (this.activeSlideIndex < this.activeProject.slides.length - 1) {
        this.activeSlideIndex++;
        this._mountWhiteboardSlide();
      }
    });

    // + Blank Slide inside Whiteboard (preserves Header/Footer/Defaults, blank Main Content)
    document.getElementById('wb-blank-slide').addEventListener('click', async () => {
      const blankSlide = SlideManager.createSlide('blank');
      this.activeProject.slides.splice(this.activeSlideIndex + 1, 0, blankSlide);
      this.activeSlideIndex += 1;
      await AppDB.saveProject(this.activeProject);
      this._mountWhiteboardSlide();
    });

    document.getElementById('wb-pen-color').addEventListener('input', (e) => {
      if (!this.penEngine) return;
      this.penEngine.isEraser = false;
      document.getElementById('wb-eraser').classList.remove('active');
      this.penEngine.color = e.target.value;
    });

    document.getElementById('wb-pen-size').addEventListener('change', (e) => {
      if (this.penEngine) this.penEngine.size = Number(e.target.value);
    });

    document.getElementById('wb-eraser').addEventListener('click', (e) => {
      if (!this.penEngine) return;
      this.penEngine.isEraser = !this.penEngine.isEraser;
      e.currentTarget.classList.toggle('active', this.penEngine.isEraser);
    });

    document.getElementById('wb-undo').addEventListener('click', () => {
      if (this.penEngine) this.penEngine.undo();
    });

    document.getElementById('wb-redo').addEventListener('click', () => {
      if (this.penEngine) this.penEngine.redo();
    });

    // Clear ONLY current slide strokes
    document.getElementById('wb-clear').addEventListener('click', () => {
      if (this.penEngine) this.penEngine.clear();
    });

    // Fullscreen toggle
    const fsBtn = document.getElementById('wb-fullscreen');
    const fsIcon = document.getElementById('wb-fs-icon');
    fsBtn.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.getElementById('whiteboard-view').requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (_) {}
    });

    document.addEventListener('fullscreenchange', () => {
      fsIcon.innerHTML = document.fullscreenElement ? ICONS.exitFullscreen : ICONS.fullscreen;
    });

    // Built-in 1080p Recording (Start / Pause / Resume)
    const recBtn = document.getElementById('wb-record');
    const recTimer = document.getElementById('wb-rec-timer');

    recBtn.addEventListener('click', async () => {
      if (!this.recorder || this.recorder.state === 'idle') {
        this.recorder = new StageRecorder(async (ctx) => {
          const liveStrokes = this.penEngine ? this.penEngine.getStrokes() : null;
          await SlideManager.renderSlideToCanvas(ctx, this.activeProject, this.activeSlideIndex, liveStrokes);
        });

        try {
          await this.recorder.start((secs, state) => {
            const mm = String(Math.floor(secs / 60)).padStart(2, '0');
            const ss = String(secs % 60).padStart(2, '0');
            recTimer.textContent = state === 'paused' ? `Paused ${mm}:${ss}` : `${mm}:${ss}`;
            recBtn.classList.toggle('recording', state === 'recording');
            recBtn.classList.toggle('paused', state === 'paused');
          });
        } catch (err) {
          this.recorder = null;
          await this.showCriticalModal({
            title: 'Recording Cannot Start',
            message: err.message || 'Microphone permission or browser recording support is required.'
          });
        }
      } else {
        this.recorder.togglePause();
      }
    });

    // Exit Whiteboard — Critical confirmation if recording is active
    document.getElementById('wb-exit').addEventListener('click', async () => {
      if (this.recorder && this.recorder.state !== 'idle') {
        const confirmExit = await this.showCriticalModal({
          title: 'Recording in Progress',
          message: 'A class video is currently recording. Exiting now will stop and save the recording. Do you want to finish and exit?',
          buttons: [
            { label: 'Continue Recording', className: 'btn btn-secondary', value: false },
            { label: 'Stop & Exit', className: 'btn btn-danger', value: true }
          ]
        });
        if (!confirmExit) return;

        const result = await this.recorder.stopAndFinalize();
        recBtn.classList.remove('recording', 'paused');
        recTimer.textContent = 'Record';

        if (result && result.blob) {
          this.activeProject.recordingBlob = result.blob;
          this.activeProject.recordingMimeType = result.mimeType;
          await AppDB.saveProject(this.activeProject);
        }
      }

      if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (_) {}
      }

      this._switchView('workspace-view');
      this._syncVideoHeaderButtons();
      this._renderSlidesAside();
      this._renderActiveSlideEditor();
      await this._checkStorageAndWarnIfNeeded();
    });
  },

  /* ================= ALL-PROJECTS RECORDINGS MANAGER ================= */
  async openRecordingsManager() {
    const modal = document.getElementById('recordings-modal');
    const listEl = document.getElementById('recordings-list');
    const barEl = document.getElementById('storage-usage-bar');

    const projects = await AppDB.getAllProjects();
    const status = await AppDB.checkStorageStatus();
    const totalVideoMB = (status.videoBytes / (1024 * 1024)).toFixed(2);
    barEl.textContent = `Total Saved Recordings Size: ${totalVideoMB} MB`;

    listEl.innerHTML = '';
    const withVideos = projects.filter((p) => p.recordingBlob);

    if (!withVideos.length) {
      listEl.innerHTML = `<div class="empty-state">No recorded videos stored yet.</div>`;
    } else {
      withVideos.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'rec-row';

        const sizeMB = (p.recordingBlob.size / (1024 * 1024)).toFixed(2);
        const info = document.createElement('div');
        info.innerHTML = `<strong>${this._escapeHtml(p.name)}</strong><div style="font-size:12px;color:#475569">${sizeMB} MB • ${p.tag ? 'Tag: ' + this._escapeHtml(p.tag) : 'No Tag'}</div>`;

        const btns = document.createElement('div');
        btns.className = 'row-actions';
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const dlBtn = document.createElement('button');
        dlBtn.className = 'btn btn-success btn-sm';
        dlBtn.textContent = 'Download';
        dlBtn.onclick = () => {
          const ext = (p.recordingMimeType || '').includes('mp4') ? 'mp4' : 'webm';
          this._triggerDownload(p.recordingBlob, `${p.name || 'recording'}.${ext}`);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-sm';
        delBtn.textContent = 'Delete';
        delBtn.onclick = async () => {
          const ok = await this.showCriticalModal({
            title: 'Delete Recording?',
            message: `Delete saved video for "${p.name}" (${sizeMB} MB)?`,
            buttons: [
              { label: 'Cancel', className: 'btn btn-secondary', value: false },
              { label: 'Delete', className: 'btn btn-danger', value: true }
            ]
          });
          if (!ok) return;
          p.recordingBlob = null;
          p.recordingMimeType = '';
          await AppDB.saveProject(p);
          if (this.activeProject && this.activeProject.id === p.id) {
            this.activeProject.recordingBlob = null;
            this._syncVideoHeaderButtons();
          }
          await this.refreshProjectsList();
          await this.openRecordingsManager();
        };

        btns.append(dlBtn, delBtn);
        row.append(info, btns);
        listEl.appendChild(row);
      });
    }

    modal.classList.remove('hidden');
  },

  _bindModalEvents() {
    document.getElementById('rec-mgr-close').addEventListener('click', () => {
      document.getElementById('recordings-modal').classList.add('hidden');
    });
  },

  /* ================= HELPERS ================= */
  _switchView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
  },

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  _readAndResizeImage(file, maxDim = 1600) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());