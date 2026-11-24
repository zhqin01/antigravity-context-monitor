/**
 * Antigravity Context Monitor - Chat Toolbar Badge & Details Popover
 * 实时在对话输入框下方的模型选择器右侧同一行显示上下文占用徽标
 * 点击展开自适应屏幕边缘的详情卡片，智能防止超出屏幕边界
 */
(function initAntigravityContextBadge() {
  'use strict';

  let lastData = null;
  let pollInterval = null;
  let isPopoverOpen = false;

  function formatK(num) {
    if (!num) return '0';
    if (num >= 1000000) {
      const v = num / 1000000;
      return (v % 1 === 0 || (num % 1000000 < 100000) ? Math.round(v) : v.toFixed(1)) + 'M';
    }
    if (num >= 10000) return Math.round(num / 1000) + 'k';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  }

  function formatModelName(model) {
    if (!model) return 'Gemini 3.8 Flash';
    const m = model.toLowerCase();
    if (m.includes('3.8-flash-high') || m.includes('3.8-flash')) return 'Gemini 3.8 Flash';
    if (m.includes('2.5-pro')) return 'Gemini 2.5 Pro';
    if (m.includes('2.5-flash')) return 'Gemini 2.5 Flash';
    if (m.includes('claude-3-7')) return 'Claude 3.7 Sonnet';
    if (m.includes('claude-3-5')) return 'Claude 3.5 Sonnet';
    if (m.includes('gpt-4o')) return 'GPT-4o';
    return model.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ');
  }

  function findModelSelector() {
    const inputEl = document.querySelector('textarea, [contenteditable="true"]');
    if (inputEl) {
      let container = inputEl.parentElement;
      for (let depth = 0; depth < 6 && container && container !== document.body; depth++) {
        const btns = container.querySelectorAll('button, [role="button"], div[tabindex]');
        for (let i = 0; i < btns.length; i++) {
          const btn = btns[i];
          if (btn.id === 'agy-context-pill' || btn.closest('#agy-context-popover')) continue;
          const txt = (btn.innerText || btn.textContent || '').trim();
          if (txt.length > 0 && txt.length < 35 && /(?:Gemini|Claude|GPT|Flash|Pro|o1|o3)/i.test(txt)) {
            if (!btn.querySelector('textarea, input')) {
              return btn;
            }
          }
        }
        container = container.parentElement;
      }
    }

    const candidates = document.querySelectorAll('button, [role="button"], div[tabindex]');
    for (let i = candidates.length - 1; i >= 0; i--) {
      const el = candidates[i];
      if (el.id === 'agy-context-pill' || el.closest('#agy-context-popover')) continue;
      const txt = (el.innerText || el.textContent || '').trim();
      if (txt.length > 0 && txt.length < 35 && /(?:Gemini|Claude|GPT|Flash|Pro|o1|o3)/i.test(txt)) {
        if (!el.querySelector('textarea, input')) {
          return el;
        }
      }
    }

    const byAttr = document.querySelector('[aria-label*="Model" i], [aria-label*="模型"], [title*="Model" i], [title*="模型"]');
    if (byAttr && byAttr.id !== 'agy-context-pill') return byAttr;

    return null;
  }

  function executeAutoCompact() {
    closePopover();
    const inputEl = document.querySelector('textarea, [contenteditable="true"]');
    if (!inputEl) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('/compact');
      }
      showToast('已复制 /compact 压缩指令');
      return;
    }

    if (inputEl.tagName === 'TEXTAREA') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(inputEl, '/compact');
      } else {
        inputEl.value = '/compact';
      }
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      inputEl.textContent = '/compact';
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    inputEl.focus();

    setTimeout(() => {
      let sendBtn = null;
      const buttons = Array.from(document.querySelectorAll('button'));

      for (let i = buttons.length - 1; i >= 0; i--) {
        const b = buttons[i];
        if (b.id === 'agy-context-pill' || b.closest('#agy-context-popover')) continue;
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();
        if (aria.includes('send') || aria.includes('发送') || title.includes('send') || title.includes('发送') || b.type === 'submit') {
          sendBtn = b;
          break;
        }
      }

      if (!sendBtn) {
        for (let i = buttons.length - 1; i >= 0; i--) {
          const b = buttons[i];
          if (b.id === 'agy-context-pill' || b.closest('#agy-context-popover')) continue;
          const rect = b.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20 && rect.right > window.innerWidth - 120 && rect.bottom > window.innerHeight - 150) {
            sendBtn = b;
            break;
          }
        }
      }

      if (sendBtn) {
        sendBtn.click();
      } else {
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }
      showToast('⚡ 正在执行 /compact 智能会话压缩...');
    }, 120);
  }

  function updatePopoverPosition() {
    const pill = document.getElementById('agy-context-pill');
    const popover = document.getElementById('agy-context-popover');
    if (!pill || !popover) return;

    const pillRect = pill.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const popoverWidth = Math.min(295, windowWidth - 16);

    let targetLeft = pillRect.left;
    if (targetLeft + popoverWidth > windowWidth - 8) {
      targetLeft = windowWidth - popoverWidth - 8;
    }
    if (targetLeft < 8) {
      targetLeft = 8;
    }

    const bottomOffset = Math.max(8, windowHeight - pillRect.top + 8);

    popover.style.position = 'fixed';
    popover.style.left = Math.round(targetLeft) + 'px';
    popover.style.bottom = Math.round(bottomOffset) + 'px';
    popover.style.width = Math.round(popoverWidth) + 'px';
    popover.style.maxWidth = 'calc(100vw - 16px)';
    popover.style.boxSizing = 'border-box';
  }

  function togglePopover() {
    if (isPopoverOpen) {
      closePopover();
    } else {
      openPopover();
    }
  }

  function openPopover() {
    const pill = document.getElementById('agy-context-pill');
    if (!pill || !lastData) return;

    let popover = document.getElementById('agy-context-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'agy-context-popover';
      document.body.appendChild(popover);
    }

    renderPopoverContent(popover, lastData);
    updatePopoverPosition();
    popover.style.display = 'block';
    isPopoverOpen = true;

    popover.style.opacity = '0';
    popover.style.transform = 'translateY(6px)';
    requestAnimationFrame(() => {
      popover.style.transition = 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      popover.style.opacity = '1';
      popover.style.transform = 'translateY(0)';
    });
  }

  function closePopover() {
    const popover = document.getElementById('agy-context-popover');
    if (popover && isPopoverOpen) {
      popover.style.opacity = '0';
      popover.style.transform = 'translateY(6px)';
      setTimeout(() => {
        popover.style.display = 'none';
        isPopoverOpen = false;
      }, 150);
    }
  }

  function renderPopoverContent(popover, data) {
    const percent = data.percent || 0;
    const pctStr = percent.toFixed(1) + '%';
    const inputFormatted = (data.inputTokens || 0).toLocaleString();
    const outputFormatted = (data.outputTokens || 0).toLocaleString();
    const cacheHitRate = data.totalContext > 0 ? ((data.cacheTokens / data.totalContext) * 100).toFixed(1) + '%' : '0%';
    const modelClean = formatModelName(data.model);

    let statusText = '空间充裕';
    let statusColor = '#10b981';
    let statusBg = 'rgba(16, 185, 129, 0.15)';
    let barColor = 'linear-gradient(90deg, #10b981, #34d399)';

    if (percent >= 85) {
      statusText = '极度拥挤';
      statusColor = '#ef4444';
      statusBg = 'rgba(239, 68, 68, 0.16)';
      barColor = 'linear-gradient(90deg, #f59e0b, #ef4444)';
    } else if (percent >= 75) {
      statusText = '用量偏高';
      statusColor = '#f59e0b';
      statusBg = 'rgba(245, 158, 11, 0.15)';
      barColor = 'linear-gradient(90deg, #10b981, #f59e0b)';
    }

    popover.style.background = '#181c24';
    popover.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    popover.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.35)';
    popover.style.borderRadius = '10px';
    popover.style.padding = '12px 14px';
    popover.style.color = '#e2e8f0';
    popover.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    popover.style.fontSize = '12px';
    popover.style.lineHeight = '1.4';
    popover.style.zIndex = '99999';
    popover.style.userSelect = 'none';
    popover.style.cursor = 'default';

    popover.innerHTML = `
      <!-- 顶部标题栏 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; padding-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px;">🧠</span>
          <span style="font-weight: 600; font-size: 12.5px; color: #f8fafc; letter-spacing: -0.2px;">上下文用量详情</span>
          <span style="font-size: 10px; padding: 1px 6px; border-radius: 8px; background: ${statusBg}; color: ${statusColor}; font-weight: 500;">${statusText}</span>
        </div>
        <div id="agy-popover-close-btn" style="cursor: pointer; opacity: 0.6; font-size: 15px; padding: 0 4px; line-height: 1; transition: opacity 0.2s;">&times;</div>
      </div>

      <!-- 模型与窗口总额 -->
      <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: #94a3b8; margin-bottom: 5px;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 175px;">模型: <strong style="color: #f1f5f9; font-weight: 500;">${modelClean}</strong></span>
        <span style="white-space: nowrap;">已用: <strong style="color: ${statusColor}; font-weight: 600;">${pctStr}</strong></span>
      </div>

      <!-- 进度条 -->
      <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 11px;">
        <div style="width: ${Math.min(100, percent)}%; height: 100%; background: ${barColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
      </div>

      <!-- 2x2 指标卡片 -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 11px;">
        <div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 5px 8px;">
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">⚡ Prompt 缓存</div>
          <div style="font-size: 12px; font-weight: 600; color: #10b981; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${formatK(data.cacheTokens)} <span style="font-size: 9.5px; color: #64748b; font-weight: 400;">(${cacheHitRate})</span></div>
        </div>
        <div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 5px 8px;">
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">🛡️ 剩余可用量</div>
          <div style="font-size: 12px; font-weight: 600; color: #38bdf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${formatK(data.remaining)} <span style="font-size: 9.5px; color: #64748b; font-weight: 400;">Tokens</span></div>
        </div>
        <div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 5px 8px;">
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">📥 未缓存输入</div>
          <div style="font-size: 12px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inputFormatted}</div>
        </div>
        <div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 5px 8px;">
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">📤 最新模型输出</div>
          <div style="font-size: 12px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${outputFormatted}</div>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div style="display: flex; gap: 6px; margin-top: 1px;">
        <button id="agy-popover-compact-btn" style="flex: 1; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.15s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ⚡ 自动压缩会话 (/compact)
        </button>
        <button id="agy-popover-refresh-btn" style="background: rgba(255,255,255,0.07); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 9px; font-size: 11px; cursor: pointer; transition: background 0.15s ease; white-space: nowrap;">
          🔄 刷新
        </button>
      </div>
    `;

    const closeBtn = popover.querySelector('#agy-popover-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
      });
      closeBtn.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
      closeBtn.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.6'; });
    }

    const compactBtn = popover.querySelector('#agy-popover-compact-btn');
    if (compactBtn) {
      compactBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        compactBtn.style.opacity = '0.8';
        executeAutoCompact();
      });
      compactBtn.addEventListener('mouseenter', () => { compactBtn.style.background = '#1d4ed8'; });
      compactBtn.addEventListener('mouseleave', () => { compactBtn.style.background = '#2563eb'; });
    }

    const refreshBtn = popover.querySelector('#agy-popover-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchContextData();
        showToast('🔄 已同步最新上下文数据');
      });
      refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.background = 'rgba(255,255,255,0.12)'; });
      refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.background = 'rgba(255,255,255,0.07)'; });
    }

    popover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  function createOrGetPill() {
    let pill = document.getElementById('agy-context-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'agy-context-pill';
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');

      pill.style.cssText = `
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        margin-left: 8px !important;
        margin-right: 4px !important;
        padding: 2px 9px !important;
        height: 22px !important;
        line-height: 22px !important;
        border-radius: 11px !important;
        font-size: 11px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        white-space: nowrap !important;
        vertical-align: middle !important;
        flex-shrink: 0 !important;
        align-self: center !important;
        z-index: 10 !important;
      `;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePopover();
      });

      pill.addEventListener('mouseenter', () => {
        pill.style.filter = 'brightness(1.15)';
      });
      pill.addEventListener('mouseleave', () => {
        pill.style.filter = 'brightness(1.0)';
      });

      document.addEventListener('click', (e) => {
        const popover = document.getElementById('agy-context-popover');
        if (isPopoverOpen && !pill.contains(e.target) && (!popover || !popover.contains(e.target))) {
          closePopover();
        }
      });

      window.addEventListener('resize', () => {
        if (isPopoverOpen) updatePopoverPosition();
      });
    }
    return pill;
  }

  function showToast(msg) {
    let toast = document.getElementById('agy-context-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'agy-context-toast';
      toast.style.cssText = 'position: fixed; bottom: 75px; left: 50%; transform: translateX(-50%) translateY(10px); background: rgba(24, 28, 36, 0.95); color: #f8fafc; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); pointer-events: none; opacity: 0; transition: all 0.25s ease; z-index: 100001;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2000);
  }

  function renderPill(data) {
    if (!data || data.totalContext === undefined) return;
    lastData = data;

    const modelSelector = findModelSelector();
    if (!modelSelector || !modelSelector.parentElement) return;

    const parent = modelSelector.parentElement;
    parent.style.display = 'flex';
    parent.style.flexDirection = 'row';
    parent.style.alignItems = 'center';
    parent.style.flexWrap = 'nowrap';
    modelSelector.style.flexShrink = '0';
    modelSelector.style.alignSelf = 'center';

    const pill = createOrGetPill();

    const percent = data.percent || 0;
    let bgColor, textColor, borderColor, iconColor;

    if (percent >= 85) {
      bgColor = 'rgba(239, 68, 68, 0.16)';
      textColor = '#ef4444';
      borderColor = 'rgba(239, 68, 68, 0.35)';
      iconColor = '#ef4444';
    } else if (percent >= 75) {
      bgColor = 'rgba(245, 158, 11, 0.15)';
      textColor = '#f59e0b';
      borderColor = 'rgba(245, 158, 11, 0.32)';
      iconColor = '#f59e0b';
    } else {
      bgColor = 'rgba(16, 185, 129, 0.13)';
      textColor = '#10b981';
      borderColor = 'rgba(16, 185, 129, 0.28)';
      iconColor = '#10b981';
    }

    pill.style.background = bgColor;
    pill.style.color = textColor;
    pill.style.border = '1px solid ' + borderColor;

    const totalStr = formatK(data.totalContext);
    const limitStr = formatK(data.maxLimit);
    const pctStr = percent.toFixed(1) + '%';

    const dashoffset = (40.84 * (1 - Math.min(1, percent / 100))).toFixed(1);
    const svgIcon = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink: 0; vertical-align: middle;"><circle cx="8" cy="8" r="6.5" stroke="' + iconColor + '" stroke-width="1.8" stroke-dasharray="40.84" stroke-dashoffset="' + dashoffset + '" stroke-linecap="round" transform="rotate(-90 8 8)"/><circle cx="8" cy="8" r="2" fill="' + iconColor + '"/></svg>';

    let badgeText = pill.querySelector('#agy-pill-text');
    if (!badgeText) {
      badgeText = document.createElement('span');
      badgeText.id = 'agy-pill-text';
      badgeText.style.display = 'inline-flex';
      badgeText.style.alignItems = 'center';
      badgeText.style.gap = '4px';
      pill.appendChild(badgeText);
    }
    badgeText.innerHTML = svgIcon + '<span style="letter-spacing: -0.2px;">' + pctStr + '</span><span style="opacity: 0.75; font-size: 10px; margin-left: -2px;">(' + totalStr + '/' + limitStr + ')</span>';

    pill.title = '点击查看上下文详细指标与快捷操作';

    if (isPopoverOpen) {
      const popover = document.getElementById('agy-context-popover');
      if (popover) {
        renderPopoverContent(popover, data);
        updatePopoverPosition();
      }
    }

    if (pill.parentElement !== parent || pill.previousElementSibling !== modelSelector) {
      parent.insertBefore(pill, modelSelector.nextSibling);
    }
  }

  function fetchContextData() {
    try {
      fetch('http://127.0.0.1:23947/context')
        .then(res => {
          if (!res.ok) throw new Error('status ' + res.status);
          return res.json();
        })
        .then(data => {
          if (data && data.totalContext !== undefined) {
            renderPill(data);
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  function startPolling() {
    fetchContextData();
    if (!pollInterval) {
      pollInterval = setInterval(fetchContextData, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }

  const badgeObserver = new MutationObserver(() => {
    if (lastData) {
      const pill = document.getElementById('agy-context-pill');
      const modelSelector = findModelSelector();
      if (modelSelector && (!pill || pill.parentElement !== modelSelector.parentElement)) {
        renderPill(lastData);
      }
    }
  });

  try {
    badgeObserver.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  console.log('[Antigravity Context Badge & Popover] Initialized successfully.');
})();
