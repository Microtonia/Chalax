// Chalax —— 入口：加载数据、初始化音频/网格/设置
(async function () {
  const state = {
    hDim: 2,           // 横向维度（默认 2D = 3）
    vDim: 3,           // 纵向维度（默认 3D = 5）
    size: 9,           // 网格大小（奇数，3..17）
    showDiff: false,   // 是否显示音差
    threshold: 50,     // 音差显示阈值（0–100 音分）
    showDims: {1: true, 2: true, 3: true, 4: true, 5: true},  // 显示哪些维度的音差
    flashMode: 'diff', // 方块亮色依据：diff(音差) / dimension(维度方向) / wavelength(频率波长)
    saturation: 100,   // 亮色饱和度（0–100，100=原色）
    shapes: [],        // 自定义形状 [{ id, name, offsets:[{dx,dy}], shortcut }]（localStorage 加载）
    activeShapeId: null, // 当前选中的形状 id（null = 单音）
    singleShortcut: null, // 单音模式的快捷键（Shift+数字行，存 localStorage）
    fundamental: 440,  //根音频率 ——A
    bgColor: '#5c5470',
    bgOpacity: 1.0,
    bgImage: null,
  };

  await I18n.setLocale(localStorage.getItem('chalax_lang') || 'zh');

  const [dims, notes] = await Promise.all([
    fetch('data/dimensions.json').then(r => r.json()),
    fetch('data/notes.json').then(r => r.json()),
  ]);

  const audio = new AudioEngine();
  const grid = new Grid(document.getElementById('gridContainer'), audio, state);
  grid.setData(notes, dims);

  const settings = new Settings(state, grid, audio);
  settings.setDims(dims);
  settings.applyBackground();

  grid.onRender = () => updateLegend(dims, state);
  grid.render();

  // 首次进入自动打开帮助面板
  if (!localStorage.getItem('chalax_help_seen')) {
    localStorage.setItem('chalax_help_seen', '1');
    settings.openHelp();
  }

  window.addEventListener('resize', () => grid.render());

  function updateLegend(dims, state) {
    const h = dims[state.hDim - 1];
    const v = dims[state.vDim - 1];
    document.getElementById('axisLegend').innerHTML =
      `<span class="legend-item"><i class="swatch" style="background:${h.color}"></i>${I18n.t('legend.horizontal', { name: h.name, prime: h.prime })}</span>` +
      `<span class="legend-item"><i class="swatch" style="background:${v.color}"></i>${I18n.t('legend.vertical', { name: v.name, prime: v.prime })}</span>`;
  }
})();
