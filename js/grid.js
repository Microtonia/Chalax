// Chalax —— 方形网格渲染与交互

// QWERTY 键盘（物理键位，用 e.code）到网格坐标的映射：
// 列号 - 5 = x（横向），2 - 行号 = y（纵向，中间 asdf 行 = 根音行）。
// 网格越大能映射的键越多；宽 13 时可覆盖全部 12 列（含 1/q/a/z 到 =、'、/）。
const KEY_ROWS = [
  ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'],
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
  ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'],
];

// 形状快捷键：Shift+数字行，对应符号 !@#$%^&*()_+，用物理键位 e.code 存储
const SHORTCUT_KEYS = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'];
const SHORTCUT_SYMBOLS = ['!','@','#','$','%','^','&','*','(',')','_','+'];

// —— 颜色工具（用于三种亮色模式 + 饱和度调整）——
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toRgb(color) {
  if (typeof color !== 'string') return [255, 255, 255];
  if (color[0] === '#') return hexToRgb(color);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255, 255, 255];
  const p = m[1].split(',').map(s => parseFloat(s));
  return [p[0], p[1], p[2]];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// 可见光波长 -> RGB（Dan Bruton 近似算法）
function wavelengthToRGB(wl) {
  let r, g, b;
  if (wl >= 380 && wl < 440) { r = -(wl - 440) / 60; g = 0; b = 1; }
  else if (wl >= 440 && wl < 490) { r = 0; g = (wl - 440) / 50; b = 1; }
  else if (wl >= 490 && wl < 510) { r = 0; g = 1; b = -(wl - 510) / 20; }
  else if (wl >= 510 && wl < 580) { r = (wl - 510) / 70; g = 1; b = 0; }
  else if (wl >= 580 && wl < 645) { r = 1; g = -(wl - 645) / 65; b = 0; }
  else if (wl >= 645 && wl < 750) { r = 1; g = 0; b = 0; }
  else { r = 0; g = 0; b = 0; }

  let f;
  if (wl >= 380 && wl < 420) f = 0.3 + 0.7 * (wl - 380) / 40;
  else if (wl >= 420 && wl < 700) f = 1;
  else if (wl >= 700 && wl < 750) f = 0.3 + 0.7 * (750 - wl) / 50;
  else f = 0;

  return [
    Math.round(255 * Math.pow(r * f, 0.8)),
    Math.round(255 * Math.pow(g * f, 0.8)),
    Math.round(255 * Math.pow(b * f, 0.8))
  ];
}

// 音分八度等价约减到 [-600, 600)
function wrapCents(c) {
  while (c < -600) c += 1200;
  while (c >= 600) c -= 1200;
  return c;
}

class Grid {
  constructor(container, audio, state) {
    this.container = container;
    this.audio = audio;
    this.state = state;            // { hDim, vDim, size, showDiff, fundamental }
    this.notes = null;             // data/notes.json
    this.dims = null;              // data/dimensions.json
    this.onRender = null;          // 每次渲染后回调（用于更新图例）
    this._flashTimers = [];
    this._dragging = false;        // 是否处于拖拽状态
    this._lastCell = null;         // 拖拽过程中最近一次发音的格子元素
    this._cellMap = {};            // "x,y" -> 格子元素（键盘发音定位用）
    this._recording = null;        // 形状录制状态 { root, offsets }，非空即录制中

    // 键盘 -> 网格坐标（物理键位）
    this._keyMap = {};
    KEY_ROWS.forEach((row, r) => {
      row.forEach((code, c) => {
        this._keyMap[code] = { x: c - 5, y: 2 - r };
      });
    });

    // 拖拽 / 滑动连续发音
    this.container.addEventListener('pointerdown', e => this._onPointerDown(e));
    this.container.addEventListener('selectstart', e => e.preventDefault());
    window.addEventListener('pointermove', e => this._onPointerMove(e));
    window.addEventListener('pointerup', () => this._onPointerUp());
    window.addEventListener('pointercancel', () => this._onPointerUp());

    // 键盘发音（按下发声，与点击一致）
    window.addEventListener('keydown', e => this._onKeyDown(e));
  }

  setData(notes, dims) {
    this.notes = notes;
    this.dims = dims;
  }

  getCombo() {
    const key = `${this.state.hDim}_${this.state.vDim}`;
    return this.notes.combos[key];
  }

  render() {
    const combo = this.getCombo();
    if (!combo) return;

    this._flashTimers.forEach(t => clearTimeout(t));
    this._flashTimers = [];

    const n = this.state.size;
    const half = (n - 1) / 2;
    const range = this.notes.range;
    const availW = this.container.clientWidth - 12;
    const availH = this.container.clientHeight - 12;
    const cellPx = Math.max(26, Math.floor(Math.min(availW, availH) / n));

    this.container.innerHTML = '';
    this._cellMap = {};
    const board = document.createElement('div');
    board.className = 'board';
    board.style.width = (cellPx * n) + 'px';
    board.style.height = (cellPx * n) + 'px';
    board.style.gridTemplateColumns = `repeat(${n}, ${cellPx}px)`;
    board.style.gridTemplateRows = `repeat(${n}, ${cellPx}px)`;
    this.container.appendChild(board);

    for (let r = 0; r < n; r++) {
      const y = half - r;               // 上行为正（音高向上）
      for (let c = 0; c < n; c++) {
        const x = c - half;
        const cell = combo[y + range][x + range];
        const el = document.createElement('div');
        el.className = 'cell';
        if (x === 0 && y === 0) el.classList.add('root');
        el.dataset.x = x;
        el.dataset.y = y;

        const content = this._cellContent(cell, cellPx);
        if (content) {
          el.classList.add('diff');
          if (content.bg) el.style.background = content.bg;
          el.innerHTML = content.html;
        }

        el._cell = cell;
        this._cellMap[`${x},${y}`] = el;
        board.appendChild(el);
      }
    }

    if (this.onRender) this.onRender();
  }

  // 按当前阈值与选中维度，筛选该音符的匹配音差（按 |cents| 升序）
  matchDims(cell) {
    const t = this.state.threshold;
    const sel = this.state.showDims;
    return cell.diffs
      .filter(d => sel[d.dim] && Math.abs(d.cents) < t)
      .sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents));
  }

  // 音差模式：为每个匹配维度渲染一行「逗号比 + 音分」（纯率音比目标音低时音分带负号）
  nearChip(matches, cellPx) {
    const fsR = Math.max(8, Math.floor(cellPx / 4.2));
    const fsC = Math.max(7, Math.floor(cellPx / 6));
    const rows = matches.map(m => {
      const color = this.dims[m.dim - 1].diffColor;
      const cents = Math.round(m.cents);
      return `<div class="near-row" style="border-left:3px solid ${color}">
        <span class="chip-ratio" style="font-size:${fsR}px">${m.n}/${m.d}</span>
        <span class="chip-cents" style="font-size:${fsC}px">${cents}¢</span>
      </div>`;
    });
    return `<div class="near">${rows.join('')}</div>`;
  }

  // 组装格子的显示内容（纯率音差 / 平均律步数与音差），返回 { html, bg } 或 null
  _cellContent(cell, cellPx) {
    const isEqual = this.state.tuning === 'equal';

    if (!isEqual) {
      // 纯率：沿用原有音差显示（音分带符号）
      if (!this.state.showDiff) return null;
      const matches = this.matchDims(cell);
      if (matches.length === 0) return { html: '', bg: null };
      return { html: this.nearChip(matches, cellPx), bg: this.dims[matches[0].dim - 1].diffColor };
    }

    // 平均律
    const edo = this._computeEdo(cell);
    const parts = [];
    let bg = null;

    if (this.state.showEdoSteps) {
      parts.push(this._stepChip(edo, cellPx));
    }

    if (this.state.showDiff) {
      const matches = this.matchDims(cell);   // 有颜色：纯率格匹配泛音维度
      if (matches.length > 0) {
        bg = this.dims[matches[0].dim - 1].diffColor;
        parts.push(this._chainChips(matches, edo, cellPx));
      } else {
        // 无颜色：仅显示 EDO 音 vs 纯率格的音差
        parts.push(this._justCentsChip(edo, cellPx));
      }
    }

    if (parts.length === 0) return null;
    return { html: `<div class="near">${parts.join('')}</div>`, bg };
  }

  // 计算该纯率格最近的平均律音（edo）及音差
  _computeEdo(cell) {
    const N = this.state.edoN;
    let k = Math.round(N * cell.cents / 1200) % N;   // 步数 0..N-1（八度等价回绕）
    const edoCents = 1200 * k / N;
    const vsJustCents = wrapCents(edoCents - cell.cents);
    const diffs = this.dims.map(dim => ({
      dim: dim.dim,
      cents: wrapCents(edoCents - dim.cents),
    }));
    return { k, edoCents, vsJustCents, diffs };
  }

  // 根据当前调音计算该格子的实际发声频率（平均律时用最近的 EDO 音高）
  _freqFor(cell) {
    let ratio = cell.n / cell.d;
    if (this.state.tuning === 'equal') {
      const N = this.state.edoN;
      const k = Math.round(N * cell.cents / 1200) % N;
      ratio = Math.pow(2, k / N);
    }
    return this.state.fundamental * ratio;
  }

  // 步数行：如 12\0
  _stepChip(edo, cellPx) {
    const fs = Math.max(9, Math.floor(cellPx / 3.6));
    return `<div class="near-row step-row">
      <span class="chip-step" style="font-size:${fs}px">${this.state.edoN}\\${edo.k}</span>
    </div>`;
  }

  // 有颜色格子：纯率逗号比（不变）+「纯率音分 → EDO 音到目标音的音差」（同一行）
  _chainChips(matches, edo, cellPx) {
    const fsR = Math.max(8, Math.floor(cellPx / 4.2));
    const fsC = Math.max(7, Math.floor(cellPx / 6));
    return matches.map(m => {
      const color = this.dims[m.dim - 1].diffColor;
      const pureCents = Math.round(m.cents);          // 纯率格到目标音的音差
      const ed = edo.diffs.find(d => d.dim === m.dim);
      const edoCents = Math.round(ed ? ed.cents : 0); // EDO 音到目标音的音差
      return `<div class="near-row" style="border-left:3px solid ${color}">
        <span class="chip-ratio" style="font-size:${fsR}px">${m.n}/${m.d}</span>
        <span class="chip-cents" style="font-size:${fsC}px">${pureCents}¢ → ${edoCents}¢</span>
      </div>`;
    }).join('');
  }

  // 无颜色格子：仅 EDO 音 vs 纯率格的音差（音分，带符号）
  _justCentsChip(edo, cellPx) {
    const fs = Math.max(7, Math.floor(cellPx / 6));
    const cents = Math.round(edo.vsJustCents);
    return `<div class="near-row">
      <span class="chip-cents" style="font-size:${fs}px">${cents}¢</span>
    </div>`;
  }

  onClick(el, cell) {
    const x = parseInt(el.dataset.x, 10);
    const y = parseInt(el.dataset.y, 10);
    if (this.isRecording()) { this.recordAt(x, y); return; }
    this._playShape(x, y);
  }

  // —— 自定义形状 ——
  isRecording() { return !!this._recording; }

  startRecording() {
    this._recording = { root: null, offsets: [] };
    this._emitRecordingChange();
  }

  cancelRecording() {
    this._recording = null;
    this._emitRecordingChange();
  }

  getRecording() {
    return this._recording ? { offsets: this._recording.offsets.slice() } : null;
  }

  // 录制中点击格子：第一个作为根音(0,0)，其余记录相对偏移
  recordAt(x, y) {
    const r = this._recording;
    if (!r) return;
    if (r.root == null) {
      r.root = { x, y };
      r.offsets.push({ dx: 0, dy: 0 });
    } else {
      r.offsets.push({ dx: x - r.root.x, dy: y - r.root.y });
    }
    const el = this._cellMap[`${x},${y}`];
    if (el && el._cell) {
      const freq = this._freqFor(el._cell);
      this.flash(el, el._cell, freq);
    }
    this._emitRecordingChange();
  }

  _emitRecordingChange() {
    if (this.onRecordingChange) this.onRecordingChange(this._recording);
  }

  _getActiveShape() {
    const id = this.state.activeShapeId;
    if (!id) return null;
    return this.state.shapes.find(s => s.id === id) || null;
  }

  // 根音格子 (x,y) + 形状偏移 -> 网格内的格子坐标列表（含根音）
  _getShapeCells(x, y) {
    const shape = this._getActiveShape();
    const half = (this.state.size - 1) / 2;
    if (!shape) return [{ x, y }];
    const cells = [];
    for (const off of shape.offsets) {
      const nx = x + off.dx;
      const ny = y + off.dy;
      if (Math.abs(nx) <= half && Math.abs(ny) <= half) cells.push({ x: nx, y: ny });
    }
    return cells;
  }

  // 点击 / 拖拽演奏形状（一次性 attack+release）
  _playShape(x, y) {
    this._getShapeCells(x, y).forEach(c => {
      const el = this._cellMap[`${c.x},${c.y}`];
      if (!el || !el._cell) return;
      const freq = this._freqFor(el._cell);
      this.audio.play(freq);
      this.flash(el, el._cell, freq);
    });
  }

  // —— 拖拽 / 滑动连续发音 ——
  _onPointerDown(e) {
    e.preventDefault();          // 阻止浏览器默认的文字选中 / 拖拽行为
    this._dragging = true;
    this._lastCell = null;
    this._playAt(e.clientX, e.clientY);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._playAt(e.clientX, e.clientY);
  }

  _onPointerUp() {
    this._dragging = false;
    this._lastCell = null;
  }

  // 根据坐标找到格子，且与上一个格子不同时才发音（避免同一格重复触发）
  _playAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const cellEl = el ? el.closest('.cell') : null;
    if (!cellEl || cellEl === this._lastCell) return;
    this._lastCell = cellEl;
    this.onClick(cellEl, cellEl._cell);
  }

  // 键盘发音：把物理键位映射到网格坐标并触发对应格子（与点击一致，一次性发声）
  _onKeyDown(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const m = this._keyMap[e.code];
    if (!m) return;

    // Shift+数字行（!@#$%^&*()_+）用于切换形状/单音，不用于发音
    if (e.shiftKey && SHORTCUT_KEYS.includes(e.code)) {
      if (this.state.singleShortcut === e.code) {
        e.preventDefault();
        this.state.activeShapeId = null;
        if (this.onShapeSelect) this.onShapeSelect(null);
      } else {
        const shape = this.state.shapes.find(s => s.shortcut === e.code);
        if (shape) {
          e.preventDefault();
          this.state.activeShapeId = shape.id;
          if (this.onShapeSelect) this.onShapeSelect(shape.id);
        }
      }
      return;
    }

    const half = (this.state.size - 1) / 2;
    if (Math.abs(m.x) > half || Math.abs(m.y) > half) return;
    e.preventDefault();
    if (e.repeat) return;  // 已按下，不重复触发

    if (this.isRecording()) { this.recordAt(m.x, m.y); return; }

    this._playShape(m.x, m.y);
  }

  // 计算某个音符在当前「亮色依据」模式下的颜色（已应用饱和度）
  _colorFor(el, cell, freq) {
    const mode = this.state.flashMode;
    let rgb;
    if (mode === 'wavelength') {
      // 频率当作光波长，乘/除 2 直到落入可见光范围（同音名八度等价 => 同色）
      let wl = freq;
      while (wl < 380) wl *= 2;
      while (wl > 750) wl /= 2;
      rgb = wavelengthToRGB(wl);
    } else if (mode === 'dimension') {
      rgb = toRgb(this._dimensionColor(el));
    } else {
      // 默认「音差」：取 |cents| 最近的泛音维度标识色（与「显示音差」开关无关）
      let best = cell.diffs[0];
      for (const d of cell.diffs) {
        if (Math.abs(d.cents) < Math.abs(best.cents)) best = d;
      }
      rgb = toRgb(this.dims[best.dim - 1].color);
    }
    return this._withSaturation(rgb);
  }

  // 维度方向模式：根音白色；其余按「先低维度后高维度，最后一步方向」着色
  _dimensionColor(el) {
    const x = parseInt(el.dataset.x, 10);
    const y = parseInt(el.dataset.y, 10);
    if (x === 0 && y === 0) return '#ffffff';
    const h = this.state.hDim;
    const v = this.state.vDim;
    if (h < v) {
      // 低维度=横向，先走横向再走纵向；最后一步在纵向（若 y≠0）
      return y !== 0 ? this.dims[v - 1].color : this.dims[h - 1].color;
    }
    // 低维度=纵向；最后一步在横向（若 x≠0）
    return x !== 0 ? this.dims[h - 1].color : this.dims[v - 1].color;
  }

  // 按饱和度滑块调整颜色（0-100，100=原色）
  _withSaturation(rgb) {
    const sat = this.state.saturation;
    if (sat >= 100) return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const [r, g, b] = hslToRgb(h, s * (sat / 100), l);
    return `rgb(${r},${g},${b})`;
  }

  // 点击 / 拖拽后短暂闪烁
  flash(el, cell, freq) {
    const color = this._colorFor(el, cell, freq);
    el.style.setProperty('--flash', color);
    el.classList.add('playing');
    const t = setTimeout(() => el.classList.remove('playing'), 380);
    this._flashTimers.push(t);
  }
}
