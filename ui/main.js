// 沉浸式免费翻译 · 桌面版前端入口
// 引擎：从浏览器插件 background.js 移植的服务商层（providers/请求分派/降级/解析）
// 桥接：storage → localStorage；HTTP → Tauri invoke http_post_json（绕 CORS）

// ---------- 配置存储（localStorage 持久化） ----------
const CFG_KEY = 'iftdesktop-cfg';
const DEFAULTS = {
  provider: 'zhipu',
  apiKey: '',
  apiKeys: {},
  model: '',
  targetLang: '简体中文',
  preserveNames: true,
  trMode: 'bilingual',
};
function cfgLoad() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (_) {}
  return Object.assign({}, DEFAULTS);
}
function cfgSave(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

// ---------- 服务商表（与插件 background.js 同步维护） ----------
const PROVIDERS = {
  zhipu: {
    label: '智谱 BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-5.3-flash',
  },
  mimo: {
    label: '小米 MiMo 开放平台',
    baseUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
    defaultModel: 'mimo-v2.6-flash',
  },
  bailian: {
    label: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen3.8-flash',
  },
  volc: {
    label: '火山方舟 · 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-seed-1.6-flash-250815',
  },
  siliconflow: {
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    defaultModel: 'Qwen/Qwen3-8B',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-flash-latest',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
  },
};

// HTTP 桥：Tauri 环境走 Rust 转发（无 CORS）；普通浏览器环境直接 fetch（开发预览）
async function httpPostJson(url, body, key) {
  const tauri = window.__TAURI__;
  if (tauri && tauri.core) {
    const text = await tauri.core.invoke('http_post_json', { url, body, key });
    return { ok: true, body: text };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

// ---------- 引擎核心（移植自插件，含降级/参数变体/占位符约束） ----------
function resolveUrl(cfg) {
  if (cfg.provider === 'mimo' && /^tp-/.test(cfg.apiKeys.mimo || '')) {
    return 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
  }
  return PROVIDERS[cfg.provider].baseUrl;
}
function apiKeyFor(cfg) {
  return (cfg.apiKeys && cfg.apiKeys[cfg.provider]) || '';
}

function buildRequestBody(cfg, items) {
  const body = {
    model: cfg.model || PROVIDERS[cfg.provider].defaultModel,
    messages: [
      { role: 'system', content: buildSystem(cfg) },
      { role: 'user', content: items },
    ],
    temperature: 0.6,
    max_tokens: Math.max(2000, Math.ceil(items.length * 1.5)),
  };
  if (cfg.provider === 'zhipu') {
    body.do_sample = false;
    if (/^glm-5/.test(body.model)) {
      // GLM-5 强制思考关不掉；json_object 模式会吞数组输出，靠提示词约束
      body.max_tokens = Math.max(8192, 4096);
    } else if (/^glm-4\.7/.test(body.model)) {
      body.max_tokens = Math.max(4096, 4096);
    } else if (/^glm-4\.[56]/.test(body.model)) {
      body.thinking = { type: 'disabled' };
    }
    if (!/^glm-5/.test(body.model)) {
      body.response_format = { type: 'json_object' };
    }
  } else if (cfg.provider === 'mimo') {
    body.thinking = { type: 'disabled' };
  } else if (cfg.provider === 'bailian' && /qwen3/i.test(body.model)) {
    body.enable_thinking = false;
  } else if (cfg.provider === 'volc' && /doubao/i.test(body.model)) {
    body.thinking = { type: 'disabled' };
  }
  return body;
}

function buildSystem(cfg) {
  let sys =
    '你是翻译引擎。用户给出一段文本，把它翻译成' + cfg.targetLang +
    '。要求：忠实原意、书面通顺；代码、命令、URL、邮箱、专有名词保留原文；不要扩写。' +
    '译文必须以 JSON 输出：{"translation":"译文"}，不要任何解释或 Markdown 代码块。';
  if (cfg.preserveNames !== false) {
    sys +=
      '\n专有名词保留：电子游戏名、软件名、作品名、品牌名、人名保留原文不翻译——如 Call of Duty、Photoshop 仍原样输出。若整段只有专有名词组成，translation 字段输出原文。';
  }
  return sys;
}

// 请求体适配为 chat/completions 单段翻译（桌面工作台一次一段）
async function translateText(cfg, text) {
  const items = [{ id: 0, text }];
  const body = buildRequestBody(cfg, JSON.stringify(items));
  const key = apiKeyFor(cfg);
  let lastErr = null;
  // 参数变体降级：4xx 时逐步去掉可选参数
  const variants = [body];
  variants.push(Object.assign({}, body, { response_format: undefined, do_sample: undefined, thinking: undefined, enable_thinking: undefined }));
  for (const v of variants) {
    const rr = await httpPostJson(resolveUrl(cfg), JSON.stringify(v), key);
    if (rr.ok) {
      try {
        const data = JSON.parse(rr.body);
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        let c = (msg && typeof msg.content === 'string') ? msg.content.trim() : '';
        if (!c && msg && typeof msg.reasoning_content === 'string') c = msg.reasoning_content.trim();
        if (c) {
          const parsed = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1));
          return parsed.translation || '';
        }
        lastErr = new Error('模型返回了空内容');
      } catch (e) {
        lastErr = e;
      }
    } else {
      lastErr = new Error(rr.error || ('HTTP ' + (rr.status || '')));
      if (!/HTTP 4/.test(lastErr.message)) break; // 非 4xx 不做参数变体
    }
  }
  throw lastErr || new Error('翻译失败');
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const cfg = cfgLoad();

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text || '';
  el.className = cls || '';
}

function applyProviderDesc() {
  const p = PROVIDERS[cfg.provider];
  $('provDesc').textContent = p.label + ' · 默认模型 ' + p.defaultModel;
  $('modelDesc').textContent = '当前：' + (cfg.model || p.defaultModel);
}

function applyCfgToUI() {
  $('provider').value = cfg.provider;
  $('apiKey').value = cfg.apiKeys[cfg.provider] || '';
  $('model').value = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  $('targetLang').value = cfg.targetLang;
  $('swPreserve').classList.toggle('on', cfg.preserveNames !== false);
  $('swPreserve').setAttribute('aria-checked', String(cfg.preserveNames !== false));
  applyProviderDesc();
}

// 导航
document.querySelectorAll('.f-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.f-nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[data-page]').forEach((p) => {
      if (p.tagName !== 'BUTTON') p.hidden = p.dataset.page !== btn.dataset.page;
    });
  });
});

// 设置联动
$('provider').addEventListener('change', () => {
  cfg.provider = $('provider').value;
  cfg.model = PROVIDERS[cfg.provider].defaultModel;
  $('apiKey').value = cfg.apiKeys[cfg.provider] || '';
  $('model').value = cfg.model;
  applyProviderDesc();
});
$('swPreserve').addEventListener('click', () => {
  const on = $('swPreserve').classList.toggle('on');
  $('swPreserve').setAttribute('aria-checked', String(on));
});
$('btnSave').addEventListener('click', () => {
  cfg.provider = $('provider').value;
  cfg.model = $('model').value.trim() || PROVIDERS[cfg.provider].defaultModel;
  cfg.targetLang = $('targetLang').value;
  cfg.preserveNames = $('swPreserve').classList.contains('on');
  const key = $('apiKey').value.trim();
  if (key) cfg.apiKeys = Object.assign({}, cfg.apiKeys, { [cfg.provider]: key });
  cfgSave(cfg);
  $('saveStatus').textContent = '已保存 ✓';
  setTimeout(() => { $('saveStatus').textContent = ''; }, 2000);
});
$('btnTest').addEventListener('click', async () => {
  cfg.model = $('model').value.trim() || PROVIDERS[cfg.provider].defaultModel;
  const key = $('apiKey').value.trim();
  if (key) cfg.apiKeys = Object.assign({}, cfg.apiKeys, { [cfg.provider]: key });
  cfgSave(cfg);
  $('saveStatus').textContent = '测试中…';
  try {
    const t = await translateText(cfg, 'Hello, this is a connection test.');
    $('saveStatus').textContent = '连接成功 ✓';
    console.log('test result:', t);
  } catch (e) {
    $('saveStatus').textContent = '失败：' + String(e.message || e).slice(0, 80);
  }
});

// 翻译工作台
async function doTranslate() {
  const text = $('input').value.trim();
  if (!text) return;
  $('btnGo').disabled = true;
  $('result').innerHTML = '<span class="ph">翻译中…</span>';
  try {
    const t = await translateText(cfg, text);
    $('result').textContent = t;
    $('status').textContent = '';
  } catch (e) {
    $('result').innerHTML = '';
    $('result').textContent = '⚠ ' + String(e.message || e);
    setStatus('翻译失败', 'err');
  } finally {
    $('btnGo').disabled = false;
  }
}
$('btnGo').addEventListener('click', doTranslate);
$('btnCopy').addEventListener('click', () => {
  navigator.clipboard.writeText($('result').textContent).then(() => setStatus('已复制 ✓', 'ok'));
});
$('input').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doTranslate();
});

applyCfgToUI();
