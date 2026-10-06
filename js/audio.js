// Chalax —— 音频引擎（Tone.js 采样器 + 合成波形）
// 6 种音源：正弦波（PolySynth 实时合成）+ 5 种采样（salamander 钢琴 / strumstick 拨弦 /
// vibraphone 颤音琴 / ksharp 竖琴 / pipeorgan 管风琴）。
// 参照 nafchlyphata 项目的 Tone.Sampler 实现。
class AudioEngine {
  constructor() {
    this.sampler = null;
    this.tone = null;
    this._started = false;
    this.release = 1.0;        // 延音（秒），可由设置栏滑块调整
    this.minDuration = 0.9;    // 单次发声时长（秒），点击与键盘共用
    this.setTone('sine');
  }

  // 构建音源实例：正弦波用 PolySynth，其余用 Tone.Sampler
  build(tone) {
    switch (tone) {
      case 'sine': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.8 }
        });
        synth.volume.value = -10;   // 多音叠加防削波
        return synth;
      }
      case 'salamander':
        return new Tone.Sampler({
          baseUrl: 'data/sound/salamander/',
          urls: {
            A0: 'A0.mp3', A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3', A6: 'A6.mp3', A7: 'A7.mp3',
            'D#1': 'Ds1.mp3', 'D#2': 'Ds2.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3', 'D#5': 'Ds5.mp3', 'D#6': 'Ds6.mp3', 'D#7': 'Ds7.mp3',
            C1: 'C1.mp3', C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', C7: 'C7.mp3', C8: 'C8.mp3',
            'F#1': 'Fs1.mp3', 'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3', 'F#5': 'Fs5.mp3', 'F#6': 'Fs6.mp3', 'F#7': 'Fs7.mp3'
          },
          release: 1.25
        });
      case 'strumstick':
        return new Tone.Sampler({
          baseUrl: 'data/sound/strumstick/',
          urls: {
            'A2': 'A2.ogg', 'A3': 'A3.ogg', 'A4': 'A4.ogg',
            'B2': 'B2.ogg', 'B3': 'B3.ogg',
            'C#3': 'Cs3.ogg', 'C#4': 'Cs4.ogg',
            'D2': 'D2.ogg', 'D3': 'D3.ogg', 'D4': 'D4.ogg',
            'E2': 'E2.ogg', 'E3': 'E3.ogg', 'E4': 'E4.ogg',
            'F#2': 'Fs2.ogg', 'F#3': 'Fs3.ogg', 'F#4': 'Fs4.ogg',
            'G2': 'G2.ogg', 'G3': 'G3.ogg', 'G4': 'G4.ogg'
          },
          release: 1.25
        });
      case 'vibraphone':
        return new Tone.Sampler({
          baseUrl: 'data/sound/vibraphone/',
          urls: {
            'A2': 'A2.ogg', 'A4': 'A4.ogg', 'B3': 'B3.ogg', 'C3': 'C3.ogg', 'C5': 'C5.ogg',
            'D4': 'D4.ogg', 'E3': 'E3.ogg', 'E5': 'E5.ogg', 'F2': 'F2.ogg', 'F4': 'F4.ogg', 'G3': 'G3.ogg'
          },
          release: 1.25
        });
      case 'ksharp':
        return new Tone.Sampler({
          baseUrl: 'data/sound/ksharp/',
          urls: {
            'A4': 'A4.ogg', 'B1': 'B1.ogg', 'B5': 'B5.ogg', 'B6': 'B6.ogg', 'C3': 'C3.ogg',
            'D4': 'D4.ogg', 'E5': 'E5.ogg', 'F2': 'F2.ogg', 'F6': 'F6.ogg', 'G3': 'G3.ogg'
          },
          release: 1.25
        });
      case 'pipeorgan':
        return new Tone.Sampler({
          baseUrl: 'data/sound/pipeorgan/',
          urls: {
            'C1': 'C1.ogg', 'C2': 'C2.ogg', 'C3': 'C3.ogg', 'C4': 'C4.ogg', 'C5': 'C5.ogg', 'C6': 'C6.ogg',
            'F#1': 'Fs1.ogg', 'F#2': 'Fs2.ogg', 'F#3': 'Fs3.ogg', 'F#4': 'Fs4.ogg', 'F#5': 'Fs5.ogg'
          },
          release: 1.25
        });
    }
    return null;
  }

  setTone(tone) {
    if (this.sampler) {
      try { this.sampler.dispose(); } catch (e) { /* 忽略 */ }
    }
    this.tone = tone;
    const inst = this.build(tone);
    this.sampler = inst ? inst.toDestination() : null;
    this.setRelease(this.release);   // 应用当前延音
  }

  // 调整延音（松开按键后的释放时长，秒）
  setRelease(seconds) {
    this.release = seconds;
    if (!this.sampler) return;
    if (this.tone === 'sine') {
      const poly = this.sampler;
      // 官方 API：更新 PolySynth 的 envelope（影响后续新建的 voice）
      try { poly.set({ envelope: { release: seconds } }); } catch (e) { /* 忽略 */ }
      // 兜底：直接更新所有 voice 的 envelope.release，确保当前已存在的 voice 即时生效
      const setVoice = v => { if (v && v.envelope) v.envelope.release = seconds; };
      try { setVoice(poly.voice); } catch (e) { /* 忽略 */ }
      try {
        let voices = poly._voices;
        if (voices && voices.voices) voices = voices.voices;   // 某些版本用 Volume 包装
        if (Array.isArray(voices)) voices.forEach(setVoice);
      } catch (e) { /* 忽略 */ }
    } else {
      try { this.sampler.release = seconds; } catch (e) { /* 忽略 */ }
    }
  }

  isReady() {
    if (!this.sampler) return false;
    if (this.tone === 'sine') return true;    // 合成器即用
    return !!this.sampler.loaded;             // 采样器需等待加载完成
  }

  _ensureStarted() {
    if (this._started) return;
    this._started = true;
    try { Tone.start(); } catch (e) { /* 忽略 */ }
  }

  play(freq, dur = this.minDuration) {
    if (!this.isReady()) return;
    this._ensureStarted();
    this.sampler.triggerAttackRelease(freq, dur, undefined, 0.9);
  }
}
