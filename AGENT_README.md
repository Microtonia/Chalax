# Chalax — 项目实现速览（面向后续 Agent）

本文件用于让后续 Agent 快速理解项目实现方式，无需重复通读全部代码。

## 1. 项目是什么

Chalax 是一个**纯前端、无构建步骤的 Web 微分音/泛音网格应用**，基于 LΛMPLIGHT 的「シャサフ式（Shasavistic）音乐理论」。它把一个「维度（dimension）= 素数泛音」的概念可视化为一张**二维纯律晶格（lattice）**：每个格子代表一个音，点击/拖拽/按键盘即可发声，并可叠加显示该音相对各维度泛音的**音差**（逗号比 + 音分）。

- 入口页面：[Chalax.html](file:///d:/AI项目/git/Chalax/Chalax.html)
- 逻辑入口：[js/main.js](file:///d:/AI项目/git/Chalax/js/main.js)
- 服务端：[server.py](file:///d:/AI项目/git/Chalax/server.py)

## 2. 技术栈与运行方式

- 纯 HTML + CSS + JS，**普通 `<script>` 脚本（非 ES Module）**，全局 `class` 协作，无打包器、无框架。
- 音频：**Tone.js**（从 CDN `https://unpkg.com/tone` 加载，全局 `Tone`），用于 `Sampler`（采样器）与 `PolySynth`（合成波形）。
- 国际化：自研轻量 i18n（`js/i18n.js`），语言文案放 `data/locales/{zh,en,ja}.json`，页面用 `data-i18n` 标记、JS 用 `I18n.t(key, vars)` 取词。
- 后端：Python `http.server`（`ThreadingHTTPServer`，端口 **8080**），负责静态文件服务、数据预计算、`/api/pics` 接口，以及 `.ogg/.mp3` MIME 修复。
- 数据：音符与维度信息**启动时预计算一次**写入 `data/*.json`，前端 `fetch` 读取，运行时不再重复计算。

> 运行：`python server.py` 后打开 `http://localhost:8080/Chalax.html`。
> 重新生成数据：`python server.py --regen`（正常情况下 `data/notes.json` 已存在则跳过）。
> 注意：Tone.js 走 CDN 需联网；采样文件在本地 `data/sound/`；语言 JSON 也走 `fetch`，直接 `file://` 打开会失效。

## 3. 目录结构

```
Chalax/
├── Chalax.html          # 全部 DOM：上/下边框、帮助/齿轮按钮、左设置栏、右帮助面板、网格容器
├── keyboard-test.html   # 键盘冲突（ghosting）测试工具
├── server.py            # 静态服务 + 数据预计算 + /api/pics + MIME 修复
├── css/style.css        # 全部样式
├── js/
│   ├── audio.js         # Tone.js 音频引擎（6 种音源 + 延音 + 长按）
│   ├── grid.js          # 网格渲染 / 点击拖拽键盘交互 / 三种亮色 / 形状演奏 / 快捷键切换
│   ├── i18n.js          # 国际化（JSON 字典 + data-i18n 替换 + t() 插值）
│   ├── settings.js      # 设置栏 + 帮助面板逻辑（含形状录制、快捷键绑定）
│   └── main.js          # 入口：加载语言/数据、初始化 audio/grid/settings、共享 state、图例
└── data/
    ├── dimensions.json  # 维度元数据（server.py 生成）
    ├── notes.json       # 所有格子音符预计算结果（server.py 生成）
    ├── locales/         # 语言文件 zh.json / en.json / ja.json
    ├── pic/             # 背景图片（用户在设置栏下拉框选择）
    └── sound/           # 5 种采样音源（salamander/strumstick/vibraphone/ksharp/pipeorgan）
```

## 4. 核心领域概念（Shasav 音乐理论）

### 4.1 维度 = 素数泛音

| 维度 | 素数 | 八度约减比 | 音程 | 标识色 | 音差色 |
|---|---|---|---|---|---|
| 1D | 2 | 1/1 | 八度(根音) | 白 #ffffff | 蓝 #4dabf7 |
| 2D | 3 | 3/2 | 纯五度 | 红 #ff5c5c | 红 #ff5c5c |
| 3D | 5 | 5/4 | 大三度 | 绿 #2ecc71 | 绿 #2ecc71 |
| 4D | 7 | 7/4 | 和声七度 | 紫 #b07ce8 | 紫 #b07ce8 |
| 5D | 11 | 11/8 | 十一分 | 黄 #f5d34b | 黄 #f5d34b |

- 定义见 [server.py](file:///d:/AI项目/git/Chalax/server.py#L29-L35) 的 `PRIMES / DIM_COLORS / DIFF_COLORS`。
- 「标识色」用于维度选择与点击闪烁；「音差色」用于音差显示（根音为蓝色）。

### 4.2 网格 = 二维纯律晶格

- 用户选择两个维度：横向（默认 2D=3）与纵向（默认 3D=5）。
- 每个格子 `(x, y)` 的音高比 = `横向素数^x × 纵向素数^y`，再做**八度约减（octave reduce）**到 `[1, 2)` 区间。
- 格子频率 = `根音频率 × (n/d)`（根音默认 440 Hz）。
- 例：横向 3、纵向 5 时，格子 `(1,1)` = `3×5=15` → 约减为 `15/8`；格子 `(2,2)` = `225` → `225/128`。

### 4.3 音差（音程差）

- 对每个音符，计算它到 5 个维度泛音音高类（根音 0¢、3/2、5/4、7/4、11/8）的**八度等价音差**。
- 音差用「逗号比」（`comma_ratio`，约减到 `[1/√2, √2)`，如 `81/80`、`225/224`）+ 有符号音分表示。
- 前端按「阈值」（0–100 音分，默认 50）与「选中的维度」筛选：`|cents| < threshold` 且维度被勾选才显示，并染成对应音差色。

## 5. 数据模型（data/*.json）

### 5.1 dimensions.json

数组，每项：`{ dim, prime, ratio:[n,d], cents, color, diffColor, name }`。

### 5.2 notes.json

```jsonc
{
  "range": 8,                  // 指数范围 -8..8，网格最大 17×17
  "combos": {
    "2_3": [ [cell, ...], ... ] // matrix[y+range][x+range]，键为 "横向维度_纵向维度"
  }
}
```

每个 `cell`：
```jsonc
{
  "n": 15, "d": 8, "cents": 1088.269,   // 八度约减后的音符比与音分
  "diffs": [                              // 与 1D..5D 各维度的音差
    { "dim": 1, "n": 15, "d": 8, "cents": 1088.269 },
    { "dim": 2, "n": 3,  "d": 2, "cents": 701.955 }
    // ...
  ]
}
```

- 预计算逻辑：`server.py` 的 `octave_reduce / comma_ratio / cents_of / build_notes`。
- **只计算一次**：`generate_data(force=...)` 若文件已存在则跳过。

## 6. 模块职责与数据流

加载链：`Chalax.html` 依次 `<script>` 引入 `Tone(CDN) → audio.js → grid.js → i18n.js → settings.js → main.js`。

`main.js` 是装配中心（IIFE）：
1. 定义共享 `state` 对象（见 §7）。
2. `await I18n.setLocale(lang)` 加载语言字典并应用到 `data-i18n` 元素。
3. `fetch` 加载 `dimensions.json` / `notes.json`。
4. 依次创建 `AudioEngine`、`Grid`、`Settings`，把 `state` 与依赖注入三者。
5. `grid.render()` 首次渲染，首次进入（无 `chalax_help_seen`）自动打开帮助面板。

| 模块 | 职责 |
|---|---|
| `audio.js` | `AudioEngine`：`setTone(tone)` 切换音源、`setRelease(s)` 调延音、`play(freq, dur)` 一次性发声、`noteOn/noteOff` 长按、`isReady()` 判断采样器加载完成 |
| `grid.js` | `Grid`：`render()` 绘制格子；点击/拖拽/键盘交互；`_colorFor` 三种亮色 + 饱和度；`_playShape` 形状演奏；`_onKeyDown` 里处理 `Shift+数字行` 切换形状；录制 `startRecording/recordAt/getRecording` |
| `i18n.js` | `I18n`：`setLocale(lang)` 加载 JSON 并 `apply()`；`t(key, vars)` 取词（支持 `{n}` 插值） |
| `settings.js` | `Settings`：绑定设置栏控件；形状增删/录制/快捷键绑定；语言切换 `applyLanguage`；帮助面板开关 `toggleHelp/openHelp` |
| `main.js` | 装配 + 共享 `state` + 图例 `updateLegend` + 首次打开帮助 |

## 7. 共享 state（main.js）

```js
const state = {
  hDim: 2,            // 横向维度
  vDim: 3,            // 纵向维度
  size: 9,            // 网格大小（奇数 3..17）
  showDiff: false,    // 是否显示音差
  threshold: 50,      // 音差阈值（音分）
  showDims: {1:true, 2:true, 3:true, 4:true, 5:true}, // 显示哪些维度的音差
  flashMode: 'diff',  // 方块亮色依据：diff / dimension / wavelength
  saturation: 100,    // 亮色饱和度（0–100）
  shapes: [],         // 自定义形状 [{ id, name, offsets:[{dx,dy}], shortcut }]
  activeShapeId: null,// 当前选中形状（null = 单音）
  fundamental: 440,   // 根音频率
  bgColor: '#5c5470', bgOpacity: 1.0, bgImage: null, // 背景
};
```

`Grid` 与 `Settings` 都持有该 `state` 引用；改完状态后调用 `grid.render()` 重绘。形状持久化在 `localStorage['chalax_shapes']`，语言在 `localStorage['chalax_lang']`。

## 8. 音频实现（audio.js）

- `build(tone)` 返回 `Tone.Sampler`（5 种采样）或 `Tone.PolySynth`（正弦波，`volume.value = -10` 防削波）。
- 采样器用 `baseUrl: 'data/sound/<name>/'` + `urls: { 音名: 文件名 }`（参照 nafchlyphata 的 `sound.js`）。
- `play()`：先 `Tone.start()`（首次，用户手势内），再 `triggerAttackRelease(freq, dur, undefined, 0.9)`。
- `noteOn/noteOff()`：`triggerAttack` / `triggerRelease`，用于键盘长按（合成器持续、采样器延音）。
- `setRelease(s)`：正弦波 `set({ envelope: { release: s } })`，采样器 `.release = s`；`setTone` 时自动应用当前值。
- 切换音源 `setTone()`：`dispose()` 旧的，创建新的并 `.toDestination()`；采样器异步加载，未加载完时 `isReady()` 为 false、发声被静默跳过。

6 种音源：`sine`（正弦波）、`salamander`（钢琴）、`strumstick`（拨弦）、`vibraphone`（颤音琴）、`ksharp`（竖琴）、`pipeorgan`（管风琴）。

音源来源（版权信息见 `Chalax.html` 中各 `<option>` 的 `data-caption`，选择音源时显示在 `#soundCredit`）：
- `salamander`：Salamander Grand Piano（Yamaha C5, Alexander Holm, CC BY 3.0）
- `strumstick` / `vibraphone` / `ksharp`：VCSL（Versilian Studios LLC, CC0）
- `pipeorgan`：VCSL Pipe Organ（Simon Dalzell, Versilian Studios LLC, CC0）

## 9. 交互：点击 / 拖拽 / 键盘（grid.js）

- **点击/拖拽**：容器 `pointerdown` 开始，`pointermove`（按住）经 `document.elementFromPoint + closest('.cell')` 命中格子并 `onClick`；`pointerup/pointercancel` 结束。同一格子不重复触发（`_lastCell`）。
- **键盘**：`KEY_ROWS`（用 `e.code` 物理键位）+ `_keyMap`（`x = col-5, y = 2-row`），`h` 键 = 根音（asdf 行为根音行）。`keydown` 命中后查 `_cellMap["x,y"]` 触发；`keyup` 释放。网格越大能映射的键越多；宽 13 可覆盖全部 12 列。输入框内按键、Ctrl/Alt/⌘ 组合、`e.repeat` 均跳过。
- **形状快捷键**：`Shift+数字行`（`!@#$%^&*()_+`，`SHORTCUT_KEYS`）用于切换形状，不发声；命中则设 `state.activeShapeId` 并回调 `onShapeSelect`。
- **录制形状**：`isRecording()` 时点击/按键调用 `recordAt(x,y)`（首个为根音 0,0，其余记相对偏移），不发声。

## 10. 亮色（三种模式 + 饱和度）

`flash(el, cell, freq)` / `flashHold(...)` 计算颜色逻辑在 `_colorFor(el, cell, freq)`：

- `diff`：取 `cell.diffs` 中 `|cents|` 最小的维度标识色（默认，与「显示音差」开关无关）。
- `dimension`：根音白；其余按「先低维度后高维度，最后一步方向」取色（`_dimensionColor`）。
- `wavelength`：频率当光波长，乘/除 2 到 `[380,750]nm`，再 `wavelengthToRGB` 转色（同音名八度等价 → 同色）。
- 统一经 `_withSaturation(rgb)` 按 `state.saturation` 调 HSL 饱和度。

颜色工具函数（`hexToRgb/toRgb/rgbToHsl/hslToRgb/wavelengthToRGB`）位于 grid.js 顶部。

## 11. 关键入口点（改代码定位）

- 音符预计算 / 维度定义：[server.py](file:///d:/AI项目/git/Chalax/server.py#L29-L148) `PRIMES / DIM_COLORS / DIFF_COLORS / build_notes / comma_ratio`
- 网格渲染与交互：[grid.js](file:///d:/AI项目/git/Chalax/js/grid.js) `render / onClick / _onKeyDown / _playShape`
- 亮色与形状：[grid.js](file:///d:/AI项目/git/Chalax/js/grid.js) `_colorFor / _dimensionColor / _getShapeCells / recordAt`
- 音频引擎 / 音源 / 延音：[audio.js](file:///d:/AI项目/git/Chalax/js/audio.js) `build / setTone / setRelease / noteOn / noteOff`
- 设置栏 / 帮助 / 语言 / 形状管理：[settings.js](file:///d:/AI项目/git/Chalax/js/settings.js) `init / applyLanguage / toggleHelp / onSaveShape / _assignShortcut`
- 国际化：[i18n.js](file:///d:/AI项目/git/Chalax/js/i18n.js) `setLocale / t / apply`
- 共享状态与初始化：[main.js](file:///d:/AI项目/git/Chalax/js/main.js)
- 静态服务 / API / MIME：[server.py](file:///d:/AI项目/git/Chalax/server.py) `Handler`

## 12. 注意事项 / 易踩坑

- **数据只算一次**：改 `build_notes` 后必须 `python server.py --regen` 或删掉 `data/notes.json` 再启动，否则旧数据不更新。
- **采样 MIME**：`.ogg/.mp3` 已在 `Handler.extensions_map` 修复，删除会导致采样加载失败。
- **Tone.js 是 CDN 依赖**：离线时 `Tone` 未定义、整个页面报错；音源切换后采样器需要短暂加载时间（`isReady()` 未就绪时发声被跳过）。
- **语言 JSON 走 fetch**：`file://` 直接打开会加载失败（回退到 key）；建议用 `python server.py` 运行。
- **脚本是普通脚本**：类挂全局、靠加载顺序共享，**不要**改成 ES Module import/export 而不调整加载方式。
- **格子坐标**：`notes.combos["h_v"][y+range][x+range]`；渲染时 `y = half - r`（上行为正，音高向上）。
- **快捷键用 `e.code`**：物理键位，不受 Shift/输入法影响；`Shift+数字行` 在 `_onKeyDown` 中先于发音判断。
- **形状/语言/帮助标记存 localStorage**：`chalax_shapes` / `chalax_lang` / `chalax_help_seen`（首次打开帮助）。
