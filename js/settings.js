// Chalax —— 设置栏逻辑

// 表示「单音」这一特殊快捷键目标（区别于形状的 id）
const SHORTCUT_SINGLE = '__single__';

class Settings {
  constructor(state, grid, audio) {
    this.state = state;
    this.grid = grid;
    this.audio = audio;
    this.dims = null;
    this.panel = document.getElementById('settingsPanel');
    this.shapesKey = 'chalax_shapes';
    this.singleShortcutKey = 'chalax_single_shortcut';
    this.langKey = 'chalax_lang';
    this._recording = null;
    this._waitingShortcutFor = null;
    this.grid.onRecordingChange = rec => this.onRecordingChange(rec);
    this.grid.onShapeSelect = id => this.onShapeSelect(id);
    this.init();
  }

  setDims(dims) {
    this.dims = dims;
    this.buildDimSelectors();
    this.buildDiffDimSelectors();
  }

  init() {
    document.getElementById('gearBtn').addEventListener('click', e => {
      this.toggle(true);
      e.target.blur();
    });
    document.getElementById('closeBtn').addEventListener('click', e => {
      this.toggle(false);
      e.target.blur();
    });

    // 点选设置项后释放焦点，避免键盘被控件捕获（点完即可直接按键盘演奏网格）
    this.panel.addEventListener('click', e => {
      if (e.target.matches('button')) e.target.blur();
    });
    this.panel.addEventListener('change', e => {
      if (e.target.matches('select, input[type="checkbox"], input[type="range"], input[type="color"]')) {
        e.target.blur();
      }
    });

    // 背景颜色 / 透明度
    document.getElementById('bgColor').addEventListener('input', e => {
      this.state.bgColor = e.target.value;
      this.applyBackground();
    });
    document.getElementById('bgOpacity').addEventListener('input', e => {
      this.state.bgOpacity = e.target.value / 100;
      document.getElementById('bgOpacityVal').textContent = e.target.value + '%';
      this.applyBackground();
    });

    // 背景图片：本地下拉框 或 网址
    document.getElementById('picSelect').addEventListener('change', e => {
      this.state.bgImage = e.target.value
        ? 'data/pic/' + encodeURIComponent(e.target.value)
        : null;
      if (this.state.bgImage) document.getElementById('picUrl').value = '';
      this.applyBackground();
    });
    document.getElementById('picUrl').addEventListener('change', e => {
      this.state.bgImage = e.target.value || null;
      if (this.state.bgImage) document.getElementById('picSelect').value = '';
      this.applyBackground();
    });
    document.getElementById('clearPic').addEventListener('click', () => {
      this.state.bgImage = null;
      document.getElementById('picSelect').value = '';
      document.getElementById('picUrl').value = '';
      this.applyBackground();
    });
    // 上传本地图片到 data/pic/
    document.getElementById('picUploadBtn').addEventListener('click', () => {
      document.getElementById('picUpload').click();
    });
    document.getElementById('picUpload').addEventListener('change', e => this.onUploadPic(e));

    // 根音频率
    document.getElementById('fundamental').addEventListener('input', e => {
      this.state.fundamental = parseFloat(e.target.value) || 440;
    });

    // 音源切换
    document.getElementById('soundSource').addEventListener('change', e => {
      this.audio.setTone(e.target.value);
      this._updateSoundCredit();
    });

    // 延音
    document.getElementById('release').addEventListener('input', e => {
      const seconds = parseFloat(e.target.value);
      document.getElementById('releaseVal').textContent = seconds.toFixed(1) + 's';
      this.audio.setRelease(seconds);
    });

    // 网格大小
    document.getElementById('gridSize').addEventListener('change', e => {
      this.state.size = parseInt(e.target.value, 10);
      this.grid.render();
    });

    // 方块亮度依据（三种模式互斥）
    const flashModes = [
      { id: 'flashDiff', mode: 'diff' },
      { id: 'flashDim', mode: 'dimension' },
      { id: 'flashWave', mode: 'wavelength' },
    ];
    flashModes.forEach(({ id, mode }) => {
      document.getElementById(id).addEventListener('change', e => {
        if (e.target.checked) {
          flashModes.forEach(o => {
            if (o.id !== id) document.getElementById(o.id).checked = false;
          });
          this.state.flashMode = mode;
        } else {
          e.target.checked = true;   // 至少保留一种模式
        }
      });
    });

    // 亮色饱和度
    document.getElementById('saturation').addEventListener('input', e => {
      this.state.saturation = parseInt(e.target.value, 10);
      document.getElementById('saturationVal').textContent = e.target.value + '%';
    });

    // 音差开关
    document.getElementById('showDiff').addEventListener('change', e => {
      this.state.showDiff = e.target.checked;
      this.grid.render();
    });

    // 音差阈值：滑块 + 可编辑数字输入（双向同步）
    const range = document.getElementById('thresholdRange');
    const num = document.getElementById('thresholdNum');
    range.addEventListener('input', () => {
      num.value = range.value;
      this.state.threshold = parseFloat(range.value);
      this.grid.render();
    });
    num.addEventListener('input', () => {
      let v = parseFloat(num.value);
      if (isNaN(v)) return;
      v = Math.max(0, Math.min(100, v));
      range.value = v;
      this.state.threshold = v;
      this.grid.render();
    });
    // 失焦时把显示值钳制到 0–100，避免手输超界后显示与滑块不一致
    num.addEventListener('change', () => {
      let v = parseFloat(num.value);
      if (isNaN(v)) v = 50;
      v = Math.max(0, Math.min(100, v));
      num.value = v;
      range.value = v;
      this.state.threshold = v;
      this.grid.render();
    });

    // 自定义形状
    document.getElementById('newShape').addEventListener('click', () => this.onNewShape());
    document.getElementById('saveShape').addEventListener('click', () => this.onSaveShape());
    document.getElementById('cancelShape').addEventListener('click', () => this.onCancelShape());
    document.getElementById('delShape').addEventListener('click', () => this.deleteShape());
    document.getElementById('shapeSelect').addEventListener('change', e => {
      this.state.activeShapeId = e.target.value || null;
      this._updateShortcutDisplay();
    });
    document.getElementById('setShortcut').addEventListener('click', () => this.startShortcutWaiting());
    document.getElementById('clearShortcut').addEventListener('click', () => this.clearShortcut());

    // 快捷键监听（capture 阶段，优先于网格发音）
    window.addEventListener('keydown', e => this._onShortcutKeydown(e), { capture: true });

    // 语言切换（设置栏 + 帮助面板共用）
    const langSel = document.getElementById('langSelect');
    const helpLangSel = document.getElementById('helpLangSelect');
    langSel.value = I18n.current;
    helpLangSel.value = I18n.current;
    langSel.addEventListener('change', e => this.applyLanguage(e.target.value));
    helpLangSel.addEventListener('change', e => this.applyLanguage(e.target.value));

    // 帮助面板开关
    document.getElementById('helpBtn').addEventListener('click', e => {
      this.toggleHelp(true);
      e.target.blur();
    });
    document.getElementById('helpCloseBtn').addEventListener('click', e => {
      this.toggleHelp(false);
      e.target.blur();
    });

    this.loadShapes();
    this.loadSingleShortcut();
    this.loadPics();
    this._updateShapeHint();
    this._updateShortcutDisplay();
    this._updateSoundCredit();
  }

  async applyLanguage(lang) {
    localStorage.setItem(this.langKey, lang);
    await I18n.setLocale(lang);
    this.grid.render();          // 更新图例
    this.renderShapes();          // 更新形状下拉文本
    this._updateShapeHint();      // 更新形状提示
    this._updateShortcutDisplay();
    document.getElementById('langSelect').value = lang;
    document.getElementById('helpLangSelect').value = lang;
  }

  toggleHelp(open) {
    document.getElementById('helpPanel').classList.toggle('open', open);
  }

  openHelp() {
    this.toggleHelp(true);
  }

  toggle(open) {
    this.panel.classList.toggle('open', open);
    document.getElementById('gearBtn').classList.toggle('active', open);
  }

  buildDimSelectors() {
    ['hDims', 'vDims'].forEach((id, idx) => {
      const box = document.getElementById(id);
      box.innerHTML = '';
      const group = idx === 0 ? 'h' : 'v';
      this.dims.forEach(dim => {
        const label = document.createElement('label');
        label.className = 'dim-option';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = dim.dim;
        input.dataset.group = group;
        input.checked = (idx === 0 ? this.state.hDim : this.state.vDim) === dim.dim;

        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = dim.color;

        const text = document.createElement('span');
        text.textContent = `${dim.name}·${dim.prime}`;

        label.appendChild(input);
        label.appendChild(swatch);
        label.appendChild(text);
        box.appendChild(label);
      });
    });

    document.querySelectorAll('#hDims input').forEach(inp => {
      inp.addEventListener('change', () => this.onDimChange('h', inp));
    });
    document.querySelectorAll('#vDims input').forEach(inp => {
      inp.addEventListener('change', () => this.onDimChange('v', inp));
    });
  }

  // 每个轴向只允许勾选一个维度（checkbox 互斥）
  onDimChange(group, chosen) {
    const key = group === 'h' ? 'hDim' : 'vDim';
    const sel = group === 'h' ? '#hDims' : '#vDims';
    document.querySelectorAll(`${sel} input`).forEach(inp => {
      inp.checked = (inp === chosen);
    });
    this.state[key] = parseInt(chosen.value, 10);
    this.grid.render();
  }

  // 音差维度勾选（1D–5D，默认全选，可多选）
  buildDiffDimSelectors() {
    const box = document.getElementById('diffDims');
    box.innerHTML = '';
    this.dims.forEach(dim => {
      const label = document.createElement('label');
      label.className = 'dim-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = dim.dim;
      input.checked = true;

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = dim.diffColor;

      const text = document.createElement('span');
      text.textContent = `${dim.name}·${dim.prime}`;

      label.appendChild(input);
      label.appendChild(swatch);
      label.appendChild(text);
      box.appendChild(label);

      input.addEventListener('change', () => {
        this.state.showDims[dim.dim] = input.checked;
        this.grid.render();
      });
    });
  }

  async loadPics() {
    const sel = document.getElementById('picSelect');
    sel.innerHTML = `<option value="" data-i18n="settings.imageNone">${I18n.t('settings.imageNone')}</option>`;
    try {
      const res = await fetch('api/pics');
      const files = await res.json();
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.warn('加载图片列表失败', e);
    }
  }

  async onUploadPic(e) {
    const file = e.target.files[0];
    e.target.value = '';   // 清空，允许再次选择同一文件
    if (!file) return;
    try {
      const res = await fetch('api/pics/upload?name=' + encodeURIComponent(file.name), {
        method: 'POST',
        body: file,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await this.loadPics();
      document.getElementById('picSelect').value = data.name;
      this.state.bgImage = 'data/pic/' + encodeURIComponent(data.name);
      document.getElementById('picUrl').value = '';
      this.applyBackground();
    } catch (err) {
      alert(I18n.t('settings.uploadFailed'));
      console.warn('上传图片失败', err);
    }
  }

  applyBackground() {
    const layer = document.getElementById('bgLayer');
    layer.style.backgroundColor = this.state.bgColor;
    layer.style.opacity = this.state.bgOpacity;
    layer.style.backgroundImage = this.state.bgImage
      ? `url("${this.state.bgImage}")`
      : 'none';
  }

  // —— 自定义形状 ——
  loadShapes() {
    try {
      this.state.shapes = JSON.parse(localStorage.getItem(this.shapesKey) || '[]');
    } catch (e) {
      this.state.shapes = [];
    }
    this.renderShapes();
  }

  saveShapes() {
    try { localStorage.setItem(this.shapesKey, JSON.stringify(this.state.shapes)); } catch (e) { /* 忽略 */ }
  }

  loadSingleShortcut() {
    try {
      this.state.singleShortcut = localStorage.getItem(this.singleShortcutKey) || null;
    } catch (e) {
      this.state.singleShortcut = null;
    }
  }

  saveSingleShortcut() {
    try {
      if (this.state.singleShortcut) localStorage.setItem(this.singleShortcutKey, this.state.singleShortcut);
      else localStorage.removeItem(this.singleShortcutKey);
    } catch (e) { /* 忽略 */ }
  }

  renderShapes() {
    const sel = document.getElementById('shapeSelect');
    const singleSc = this.state.singleShortcut ? `[${this.shortcutSymbol(this.state.singleShortcut)}] ` : '';
    sel.innerHTML = `<option value="">${singleSc}${I18n.t('settings.shapeNone')}</option>`;
    this.state.shapes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const sc = s.shortcut ? `[${this.shortcutSymbol(s.shortcut)}] ` : '';
      opt.textContent = sc + s.name + I18n.t('settings.shapeNotesCount', { n: s.offsets.length });
      sel.appendChild(opt);
    });
    sel.value = this.state.activeShapeId || '';
  }

  onNewShape() {
    this.grid.startRecording();
    this._updateShapeUI();
  }

  onSaveShape() {
    const rec = this.grid.getRecording();
    if (!rec || rec.offsets.length === 0) return;
    const defaultName = I18n.t('settings.shapeDefaultName', { n: this.state.shapes.length + 1 });
    const name = prompt(I18n.t('settings.shapeNamePrompt'), defaultName);
    if (name == null) return;   // 用户取消
    const nm = name.trim() || defaultName;
    const shape = { id: String(Date.now()), name: nm, offsets: rec.offsets };
    this.state.shapes.push(shape);
    this.state.activeShapeId = shape.id;
    this.saveShapes();
    this.grid.cancelRecording();
    this.renderShapes();
    this._updateShapeUI();
  }

  onCancelShape() {
    this.grid.cancelRecording();
    this._updateShapeUI();
  }

  deleteShape() {
    const id = this.state.activeShapeId;
    if (!id) return;
    this.state.shapes = this.state.shapes.filter(s => s.id !== id);
    this.state.activeShapeId = null;
    this.saveShapes();
    this.renderShapes();
    this._updateShortcutDisplay();
  }

  onRecordingChange(rec) {
    this._recording = rec;
    this._updateShapeHint();
  }

  _updateShapeHint() {
    const hint = document.getElementById('shapeHint');
    const rec = this._recording;
    hint.textContent = rec
      ? I18n.t('settings.shapeRecordingHint', { n: rec.offsets.length })
      : I18n.t('settings.shapeHint');
  }

  _updateShapeUI() {
    const rec = this.grid.isRecording();
    document.getElementById('newShape').style.display = rec ? 'none' : '';
    document.getElementById('saveShape').style.display = rec ? '' : 'none';
    document.getElementById('cancelShape').style.display = rec ? '' : 'none';
    document.getElementById('delShape').style.display = rec ? 'none' : '';
  }

  // —— 形状快捷键 ——
  shortcutSymbol(code) {
    const i = SHORTCUT_KEYS.indexOf(code);
    return i >= 0 ? SHORTCUT_SYMBOLS[i] : '';
  }

  // grid 里通过 Shift+数字切换形状后，同步刷新下拉与快捷键显示
  onShapeSelect(id) {
    this.state.activeShapeId = id;
    this.renderShapes();
    this._updateShortcutDisplay();
  }

  startShortcutWaiting() {
    this._waitingShortcutFor = this.state.activeShapeId || SHORTCUT_SINGLE;
    this._updateShortcutDisplay();
  }

  clearShortcut() {
    if (this.state.activeShapeId) {
      const shape = this.state.shapes.find(s => s.id === this.state.activeShapeId);
      if (shape) shape.shortcut = null;
      this.saveShapes();
    } else {
      this.state.singleShortcut = null;
      this.saveSingleShortcut();
    }
    this.renderShapes();
    this._updateShortcutDisplay();
  }

  _onShortcutKeydown(e) {
    if (!this._waitingShortcutFor) return;
    e.stopPropagation();   // 等待期间阻止按键冒泡到网格发音
    if (e.key === 'Escape') {
      e.preventDefault();
      this._waitingShortcutFor = null;
      this._updateShortcutDisplay();
      return;
    }
    if (e.shiftKey && SHORTCUT_KEYS.includes(e.code)) {
      e.preventDefault();
      this._assignShortcut(this._waitingShortcutFor, e.code);
    }
  }

  _assignShortcut(target, code) {
    // 解除其他形状与单音对该快捷键的占用，保证一键一目标
    this.state.shapes.forEach(s => { if (s.shortcut === code) s.shortcut = null; });
    if (this.state.singleShortcut === code) this.state.singleShortcut = null;

    if (target === SHORTCUT_SINGLE) {
      this.state.singleShortcut = code;
      this.saveSingleShortcut();
    } else {
      const shape = this.state.shapes.find(s => s.id === target);
      if (shape) shape.shortcut = code;
      this.saveShapes();
    }
    this._waitingShortcutFor = null;
    this.renderShapes();
    this._updateShortcutDisplay();
  }

  _updateShortcutDisplay() {
    const display = document.getElementById('shortcutDisplay');
    if (this._waitingShortcutFor) {
      display.textContent = I18n.t('settings.shortcutWaiting');
    } else {
      let code = null;
      if (this.state.activeShapeId) {
        const shape = this.state.shapes.find(s => s.id === this.state.activeShapeId);
        code = shape && shape.shortcut;
      } else {
        code = this.state.singleShortcut;
      }
      display.textContent = code ? this.shortcutSymbol(code) : '—';
    }
  }

  // 音源下拉框下方浮现版权信息（读取当前 option 的 data-caption）
  _updateSoundCredit() {
    const sel = document.getElementById('soundSource');
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('soundCredit').textContent = opt.dataset.caption || '';
  }
}
