// 设置页：每日新词数 / 切换词库 / 备份与恢复 / 重置 / 关于
import { esc } from '../dom.js';
import { backupAgeDays, backupOverdue } from '../prefs.js';
import { auditNewWords } from '../../core/audit.js';

export function settingsView(app, ctx) {
  const cfg = app.state.config;
  const target = cfg.dailyNewTarget;
  const eta = ctx.total ? Math.ceil((ctx.newLeftInDeck || 0) / Math.max(1, target)) : 0;

  // 今日新词自查：计数 vs 复习日志里的独立记录
  let auditText = '';
  try {
    const reviews = app.storage?.getReviews?.() || [];
    const a = auditNewWords(app.state, reviews, ctx.today);
    auditText = `${a.counted} / 日志 ${a.logged} ${a.ok ? '✓' : '⚠ 不一致'}`;
  } catch {
    auditText = '无法核对';
  }
  const auditBad = auditText.includes('不一致');

  // 当前是主屏 App 还是 Safari 标签页（两套 localStorage，跑错容器就会「数据变空」）
  const standalone = !!(
    globalThis.matchMedia?.('(display-mode: standalone)')?.matches ||
    globalThis.navigator?.standalone === true
  );

  // 备份状态
  const ageDays = backupAgeDays(app.prefs);
  const overdue = backupOverdue(app.prefs, ctx.learned);
  const backupText = ageDays === null
    ? '从未导出'
    : ageDays === 0 ? '今天' : `${ageDays} 天前`;

  const persistText = {
    granted: '已授予（不容易被系统回收）',
    default: '未授予（空间紧张时可能被清）',
    unsupported: '浏览器不支持',
    unknown: '未知',
  }[app.persistState] || '检查中…';

  return `
  <div class="page">
    <header class="topbar">
      <div class="topbar-main">
        <div class="date">我的</div>
        <div class="sub">${esc(ctx.deck?.name || '-')} · 已学 ${ctx.learned}/${ctx.total}</div>
      </div>
    </header>

    <section class="card">
      <h2>生词本</h2>
      <div class="kv"><span>已录</span><span>${ctx.customCount} 个 · 今天待复习 ${ctx.customDue}</span></div>
      <div class="kv"><span>今日录入</span><span>${ctx.customAddedToday}/${ctx.customDailyLimit}</span></div>
      <div class="actions">
        <button class="primary" data-action="open-custom">＋ 记一个生词</button>
        <button class="link" data-action="open-custom-list">查看 / 编辑</button>
      </div>
    </section>

    <section class="card">
      <h2>偏好</h2>
      <div class="pref-row">
        <div class="pref-text">
          <b>提示音</b>
          <span class="muted small">答对/答错时一声短音，开关存在本机</span>
        </div>
        <button class="switch ${app.prefs?.sound ? 'on' : ''}" data-action="toggle-sound"
          role="switch" aria-checked="${!!app.prefs?.sound}" aria-label="提示音开关"><i></i></button>
      </div>
    </section>

    <section class="card">
      <h2>每天学几个新词</h2>
      <div class="chips">
        ${[5, 10, 15, 20].map((n) => `
          <button class="chip ${target === n ? 'active' : ''}" data-action="set-target" data-target="${n}">${n}</button>`).join('')}
      </div>
      <p class="muted small">按这个速度，剩下的 ${ctx.newLeftInDeck} 个词还要 ${eta} 天。改设置不影响今天的打卡目标。</p>
    </section>

    <section class="card">
      <h2>词库</h2>
      <div class="deck-switch">
        ${app.deckMetas.map((d) => `
          <button class="deck-row ${cfg.deckId === d.id ? 'active' : ''}" data-action="switch-deck" data-deck="${esc(d.id)}">
            <span>${esc(d.name)}</span>
            <em>${d.count} 词${cfg.deckId === d.id ? ' · 使用中' : ''}</em>
          </button>`).join('')}
      </div>
      <p class="muted small">换词库不会丢进度：每个词的卡片独立保存。</p>
    </section>

    <section class="card">
      <h2>数据与备份</h2>
      <div class="kv"><span>当前环境</span><span>${standalone ? '主屏 App（数据独立于 Safari）' : 'Safari 标签页'}</span></div>
      <div class="kv"><span>上次备份</span><span class="${overdue ? 'warn-text' : ''}">${backupText}</span></div>
      <div class="kv"><span>持久化存储</span><span>${persistText}</span></div>
      <div class="kv"><span>今日新词核对</span><span class="${auditBad ? 'warn-text' : ''}">${auditText}</span></div>
      <p class="muted small">「今日新词」按不同单词计数，同一个词补考多少次都只算 1 个。这一行把计数和复习日志对了一遍，两个数字一致才打勾。</p>
      <p class="muted small">数据只存在这台设备的浏览器里。换手机、清缓存、删主屏图标之前请先导出。</p>
      <div class="actions">
        <button class="primary" data-action="export-download">导出备份文件</button>
        <button class="link" data-action="export-copy">复制到剪贴板</button>
      </div>
      <details class="import-box">
        <summary>从备份恢复（会覆盖当前进度）</summary>
        <textarea id="import-box" rows="4" placeholder="把之前导出的 JSON 粘到这里"></textarea>
        <button class="primary" data-action="import-data">导入并覆盖</button>
      </details>
    </section>

    <section class="card">
      <h2>每天怎么被叫来</h2>
      <p class="muted small">网页不能定时推送（iOS 的推送必须走服务器）。用系统自带的「快捷指令」，5 分钟配一次，之后每天到点自动弹：</p>
      <ol class="steps">
        <li>打开「快捷指令」→ 自动化 → 新建</li>
        <li>触发条件选「时间」→ 每天 → 挑个你会在家的点</li>
        <li>动作搜「打开 URL」，填本页地址</li>
        <li>关掉「运行前询问」，保存</li>
      </ol>
      <p class="muted small">再加一步「显示通知」，锁屏也能看到提醒。</p>
    </section>

    <section class="card danger">
      <h2>重置进度</h2>
      <p class="muted small">清空所有学习记录和复习日志，词库和每日新词数保留。不可撤销。</p>
      <input id="reset-input" type="text" inputmode="text" placeholder="输入「重置」两个字确认" />
      <button class="danger-btn" data-action="reset-data">清空进度</button>
    </section>

    <section class="card">
      <h2>关于</h2>
      <div class="kv"><span>版本</span><span>0.10.2</span></div>
      <div class="kv"><span>词库</span><span>雅思词汇真经 ${ctx.total} 词</span></div>
      <div class="kv"><span>来源</span><span>github.com/hefengxian/my-ielts</span></div>
      <div class="kv"><span>协议</span><span>原仓库未声明 LICENSE，仅个人学习用</span></div>
      <div class="kv"><span>算法</span><span>简化 SM-2（三键评分）</span></div>
      <p class="muted small">认识：间隔 × 难度因子；模糊：至少 +1 天；不认识：回到 1 天并在本场再看一次。</p>
      <button class="link" data-action="force-reload">页面出问题？强制刷新（清离线缓存）</button>
    </section>
  </div>`;
}










