// Chalax —— 国际化（i18n）
// 业内标准做法：语言文案独立成 JSON 字典（data/locales/{lang}.json），
// 页面静态文本用 data-i18n / data-i18n-placeholder / data-i18n-title 标记，
// 动态文本在 JS 里通过 I18n.t(key, vars) 取文案。新增语言只需增加一个 JSON 文件。
const I18n = {
  langs: ['zh', 'en', 'ja'],
  current: 'zh',
  dict: {},

  // 加载指定语言并应用到页面；lang 非法时回退到中文
  async setLocale(lang) {
    if (!this.langs.includes(lang)) lang = 'zh';
    try {
      const res = await fetch(`data/locales/${lang}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.dict = await res.json();
    } catch (e) {
      console.warn('[i18n] 语言文件加载失败，回退到 key', e);
      this.dict = {};
    }
    this.current = lang;
    document.documentElement.lang = { zh: 'zh-CN', en: 'en', ja: 'ja' }[lang] || 'en';
    this.apply();
    return this.current;
  },

  // 取文案，支持 {name} 占位符插值
  t(key, vars) {
    let s = this.dict[key] ?? key;
    if (vars) {
      for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
    }
    return s;
  },

  // 把字典应用到所有带 data-i18n* 标记的元素
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
  }
};
