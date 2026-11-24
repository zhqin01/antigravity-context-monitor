const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

/**
 * 常用模型上下文窗口上限字典 (Tokens)
 */
const MODEL_LIMITS = {
  'gemini-3.8-flash': 1048576,
  'gemini-3.8-flash-high': 1048576,
  'gemini-2.5-flash': 1048576,
  'gemini-2.5-pro': 2097152,
  'gemini-3-pro': 2097152,
  'gemini-1.5-pro': 2097152,
  'gemini-1.5-flash': 1048576,
  'claude-3-5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'o1': 200000,
  'o3-mini': 200000
};

function getModelLimit(model) {
  if (!model) return 1048576;
  const m = model.toLowerCase();
  for (const [k, v] of Object.entries(MODEL_LIMITS)) {
    if (m.includes(k)) return v;
  }
  if (m.includes('pro')) return 2097152;
  if (m.includes('claude')) return 200000;
  if (m.includes('gpt-4')) return 128000;
  if (m.includes('flash')) return 1048576;
  return 1048576;
}

function formatTokens(num) {
  if (num >= 1000000) {
    const val = num / 1000000;
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + 'M';
  }
  if (num >= 10000) {
    return Math.round(num / 1000) + 'k';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return (num || 0).toString();
}

function formatExact(num) {
  return (num || 0).toLocaleString();
}

function makeProgressBar(percent, length = 16) {
  const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

class AntigravityContextMonitor {
  constructor(context) {
    this.context = context;
    this.brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    this.currentTranscriptPath = null;
    this.currentConvId = null;
    this.currentData = null;
    this.fileWatcher = null;
    this.pollTimer = null;
    this.warnedConversations = new Set();
    this.refreshDebounceTimer = null;
    this.httpServer = null;
    this.httpPort = 23947;

    // 1. 创建 VS Code 底部状态栏项 (右侧靠左，紧随原生 Antigravity 按钮)
    this.statusBarItem = vscode.window.createStatusBarItem(
      'antigravity-context-item',
      vscode.StatusBarAlignment.Right,
      99
    );
    this.statusBarItem.name = 'Antigravity 上下文监控';
    this.statusBarItem.command = 'antigravity-context.menu';
    this.statusBarItem.text = '$(hubot) 上下文: 检测中...';
    this.statusBarItem.tooltip = '正在读取 Antigravity 对话上下文数据...';
    this.statusBarItem.show();

    // 2. 注册 VS Code 快捷指令
    this.registerCommands();

    // 3. 启动本地轻量 HTTP 数据服务 (供 Webview 界面无缝读取上下文)
    this.startHttpServer();

    // 4. 确保 Webview 输入栏胶囊与详情卡片就绪
    this.ensureWebviewPillInjected();

    // 5. 启动数据监听与轮询
    this.startMonitoring();
  }

  ensureWebviewPillInjected() {
    try {
      const extDir = path.join(os.homedir(), '.vscode', 'extensions');
      if (!fs.existsSync(extDir)) return;
      const items = fs.readdirSync(extDir);
      for (const item of items) {
        if (item.startsWith('google.google-antigravity')) {
          const runtimePath = path.join(extDir, item, 'agy-i18n-runtime.js');
          if (fs.existsSync(runtimePath)) {
            const badgePath = path.join(__dirname, 'runtime-badge.js');
            if (fs.existsSync(badgePath)) {
              const badgeContent = fs.readFileSync(badgePath, 'utf8');
              const currentContent = fs.readFileSync(runtimePath, 'utf8');

              const startMarker = '/* ANTIGRAVITY_CONTEXT_MONITOR_START */';
              const endMarker = '/* ANTIGRAVITY_CONTEXT_MONITOR_END */';
              const wrappedSnippet = `${startMarker}\n${badgeContent}\n${endMarker}`;

              if (currentContent.includes(startMarker) && currentContent.includes(endMarker)) {
                const sIdx = currentContent.indexOf(startMarker);
                const eIdx = currentContent.indexOf(endMarker) + endMarker.length;
                const before = currentContent.substring(0, sIdx);
                const after = currentContent.substring(eIdx);
                fs.writeFileSync(runtimePath, before + wrappedSnippet + after, 'utf8');
                console.log('[AntigravityContextMonitor] Webview 上下文胶囊代码已平滑更新至最新版本');
              } else {
                const legacyIdx = currentContent.indexOf('initAntigravityContextBadge');
                if (legacyIdx > -1) {
                  const commentIdx = currentContent.lastIndexOf('/**', legacyIdx);
                  const cleanBase = commentIdx > -1 ? currentContent.substring(0, commentIdx).trimEnd() : currentContent.substring(0, legacyIdx).trimEnd();
                  fs.writeFileSync(runtimePath, cleanBase + '\n\n' + wrappedSnippet + '\n', 'utf8');
                  console.log('[AntigravityContextMonitor] Webview 上下文胶囊代码已清理旧版并注入新版');
                } else {
                  fs.appendFileSync(runtimePath, '\n\n' + wrappedSnippet + '\n', 'utf8');
                  console.log('[AntigravityContextMonitor] Webview 上下文胶囊代码已注入');
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AntigravityContextMonitor] 自动注入检查跳过:', e.message);
    }
  }

  registerCommands() {
    this.context.subscriptions.push(
      this.statusBarItem,
      vscode.commands.registerCommand('antigravity-context.menu', () => this.showActionMenu()),
      vscode.commands.registerCommand('antigravity-context.refresh', () => {
        this.updateContextData(true);
        vscode.window.showInformationMessage('🔄 Antigravity 上下文数据已手动刷新！');
      }),
      vscode.commands.registerCommand('antigravity-context.showDetails', () => this.showDetailedModal()),
      vscode.commands.registerCommand('antigravity-context.copyCompact', () => this.copyCompactCommand()),
      vscode.commands.registerCommand('antigravity-context.openLog', () => this.openTranscriptLog()),
      vscode.commands.registerCommand('antigravity-context.openFolder', () => this.openConversationFolder())
    );
  }

  startHttpServer() {
    try {
      this.httpServer = http.createServer((req, res) => {
        // 设置跨域 CORS 响应头，允许 Webview 内 JavaScript 自由调用
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        };

        if (req.method === 'OPTIONS') {
          res.writeHead(204, headers);
          res.end();
          return;
        }

        const urlStr = req.url || '';
        if (urlStr.startsWith('/context')) {
          let responseData = null;
          try {
            const parsedUrl = new URL(urlStr, 'http://127.0.0.1:23947');
            const requestedConvId = parsedUrl.searchParams.get('convId');

            if (requestedConvId) {
              responseData = this.getConversationData(requestedConvId);
            }

            if (!responseData) {
              const wsConvId = this.getActiveWorkspaceConversationId();
              if (wsConvId) {
                responseData = this.getConversationData(wsConvId);
              }
            }
          } catch (e) {}

          if (!responseData) {
            responseData = {
              convId: requestedConvId || 'new',
              model: 'Gemini 3.8 Flash',
              totalContext: 0,
              maxLimit: 1048576,
              percent: 0,
              remaining: 1048576,
              inputTokens: 0,
              cacheTokens: 0,
              outputTokens: 0,
              isNew: true,
              timestamp: new Date().toISOString()
            };
          }

          // 核心机制：当 Webview 汇报或查询任意会话时，实时同步更新 VS Code 底部状态栏与活跃监控
          this.syncActiveConversationState(responseData);

          res.writeHead(200, headers);
          res.end(JSON.stringify(responseData));
        } else if (urlStr.startsWith('/report_debug')) {
          let b = '';
          req.on('data', chunk => b += chunk);
          req.on('end', () => {
            try {
              fs.writeFileSync(path.join(os.tmpdir(), 'antigravity_webview_debug.json'), b, 'utf8');
            } catch (e) {}
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        } else if (urlStr.startsWith('/action/compact')) {
          this.copyCompactCommand();
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: true, message: '已复制 /compact' }));
        } else {
          res.writeHead(404, headers);
          res.end(JSON.stringify({ error: 'not_found' }));
        }
      });

      this.httpServer.on('error', (err) => {
        console.warn('[AntigravityContextMonitor] HTTP 服务端口异常:', err.message);
      });

      this.httpServer.listen(this.httpPort, '127.0.0.1', () => {
        console.log(`[AntigravityContextMonitor] 本地上下文 API 服务已就绪: http://127.0.0.1:${this.httpPort}/context`);
      });
    } catch (err) {
      console.warn('[AntigravityContextMonitor] 启动本地 HTTP 服务失败:', err);
    }
  }

  /**
   * 与当前活跃会话状态强同步
   * 当 Webview 轮询或侦测到用户切换会话时，第一时间更新底层的状态栏项及文件监听
   */
  syncActiveConversationState(data) {
    if (!data) return;

    const isConvChanged = (data.convId !== this.currentConvId);
    const isTokensChanged = (!this.currentData || data.totalContext !== this.currentData.totalContext || data.percent !== this.currentData.percent);

    if (isConvChanged || isTokensChanged) {
      this.currentData = data;
      this.currentConvId = data.convId;

      if (data.convId && data.convId !== 'new') {
        const transcriptPath = path.join(this.brainDir, data.convId, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(transcriptPath)) {
          this.currentTranscriptPath = transcriptPath;
          this.setupFileWatcher(transcriptPath);
        } else {
          this.currentTranscriptPath = null;
        }
      } else {
        this.currentTranscriptPath = null;
      }

      this.renderStatusBar();
      this.checkAlerts();
    }
  }

  startMonitoring() {
    // 首次立即更新
    this.updateContextData();

    // 周期性轮询检测会话切换 (每 2 秒)
    const config = vscode.workspace.getConfiguration('antigravityContext');
    const interval = config.get('refreshInterval', 2000);
    this.pollTimer = setInterval(() => {
      this.checkForActiveSessionChange();
    }, interval);
  }

  getLatestTranscript() {
    if (!fs.existsSync(this.brainDir)) return null;
    try {
      const entries = fs.readdirSync(this.brainDir, { withFileTypes: true });
      let latestFile = null;
      let latestMtime = 0;
      let latestId = null;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const tPath = path.join(this.brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
          if (fs.existsSync(tPath)) {
            try {
              const stat = fs.statSync(tPath);
              if (stat.mtimeMs > latestMtime) {
                latestMtime = stat.mtimeMs;
                latestFile = tPath;
                latestId = entry.name;
              }
            } catch (e) {}
          }
        }
      }
      return { path: latestFile, id: latestId, mtime: latestMtime };
    } catch (err) {
      return null;
    }
  }

  getConversationData(convId) {
    if (!convId || convId === 'new') {
      return {
        convId: 'new',
        model: 'Gemini 3.8 Flash',
        totalContext: 0,
        maxLimit: 1048576,
        percent: 0,
        remaining: 1048576,
        inputTokens: 0,
        cacheTokens: 0,
        outputTokens: 0,
        isNew: true,
        timestamp: new Date().toISOString()
      };
    }

    const tPath = path.join(this.brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(tPath)) {
      return {
        convId: convId,
        model: 'Gemini 3.8 Flash',
        totalContext: 0,
        maxLimit: 1048576,
        percent: 0,
        remaining: 1048576,
        inputTokens: 0,
        cacheTokens: 0,
        outputTokens: 0,
        isNew: true,
        timestamp: new Date().toISOString()
      };
    }

    try {
      const fileStat = fs.statSync(tPath);
      const tokenData = this.parseLatestTokens(tPath);
      if (!tokenData) {
        return {
          convId: convId,
          model: 'Gemini 3.8 Flash',
          totalContext: 0,
          maxLimit: 1048576,
          percent: 0,
          remaining: 1048576,
          inputTokens: 0,
          cacheTokens: 0,
          outputTokens: 0,
          isNew: true,
          timestamp: new Date().toISOString()
        };
      }

      const maxLimit = getModelLimit(tokenData.model);
      const totalContext = (tokenData.inputTokens || 0) + (tokenData.cacheTokens || 0);
      const percent = maxLimit > 0 ? (totalContext / maxLimit) * 100 : 0;
      const remaining = Math.max(0, maxLimit - totalContext);

      return {
        ...tokenData,
        totalContext,
        maxLimit,
        percent,
        remaining,
        convId: convId,
        fileMtime: fileStat.mtimeMs
      };
    } catch (e) {
      return null;
    }
  }

  getActiveWorkspaceConversationId() {
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return null;
      const activeFolderUri = folders[0].uri.toString();

      const userStorage = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage');
      if (!fs.existsSync(userStorage)) return null;

      const subdirs = fs.readdirSync(userStorage);
      for (const dir of subdirs) {
        const wsJsonPath = path.join(userStorage, dir, 'workspace.json');
        if (fs.existsSync(wsJsonPath)) {
          try {
            const wsContent = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
            if (wsContent.folder && (wsContent.folder === activeFolderUri || wsContent.folder.toLowerCase() === activeFolderUri.toLowerCase())) {
              const dbPath = path.join(userStorage, dir, 'state.vscdb');
              if (fs.existsSync(dbPath)) {
                const content = fs.readFileSync(dbPath).toString('latin1');
                const m = content.match(/lastConversationId.*?([0-9a-fA-F\-]{36})/);
                if (m && m[1]) return m[1];
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return null;
  }

  parseLatestTokens(filePath) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0) return null;

      // 仅读取文件末尾 64KB，极大降低 I/O 开销与内存消耗
      const readSize = Math.min(stat.size, 65536);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
      fs.closeSync(fd);

      const lines = buffer.toString('utf-8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.input_tokens !== undefined) {
            return {
              stepIndex: obj.step_index || 0,
              model: obj.model || 'gemini-3.8-flash-high',
              inputTokens: obj.input_tokens || 0,
              cacheTokens: obj.cache_read_tokens || 0,
              outputTokens: obj.output_tokens || 0,
              timestamp: obj.created_at || new Date().toISOString()
            };
          }
        } catch (e) {}
      }
    } catch (err) {}
    return null;
  }

  checkForActiveSessionChange() {
    const latest = this.getLatestTranscript();
    if (!latest || !latest.path) return;

    if (latest.path !== this.currentTranscriptPath) {
      this.currentTranscriptPath = latest.path;
      this.currentConvId = latest.id;
      this.setupFileWatcher(latest.path);
      this.updateContextData();
    } else {
      try {
        const stat = fs.statSync(latest.path);
        if (this.currentData && stat.mtimeMs > (this.currentData.fileMtime || 0)) {
          this.updateContextData();
        }
      } catch (e) {}
    }
  }

  setupFileWatcher(filePath) {
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch (e) {}
      this.fileWatcher = null;
    }

    try {
      this.fileWatcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
          this.refreshDebounceTimer = setTimeout(() => {
            this.updateContextData();
          }, 300);
        }
      });
    } catch (e) {}
  }

  updateContextData(force = false) {
    if (!this.currentTranscriptPath) {
      const latest = this.getLatestTranscript();
      if (latest && latest.path) {
        this.currentTranscriptPath = latest.path;
        this.currentConvId = latest.id;
        this.setupFileWatcher(latest.path);
      }
    }

    if (!this.currentTranscriptPath || !fs.existsSync(this.currentTranscriptPath)) {
      this.statusBarItem.text = '$(hubot) 上下文: 等待对话';
      this.statusBarItem.tooltip = '尚未检测到 Antigravity 活跃会话日志。';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const tokenData = this.parseLatestTokens(this.currentTranscriptPath);
    if (!tokenData) return;

    const fileStat = fs.statSync(this.currentTranscriptPath);
    const maxLimit = getModelLimit(tokenData.model);
    const totalContext = tokenData.inputTokens + tokenData.cacheTokens;
    const percent = Math.min(100, Math.max(0, (totalContext / maxLimit) * 100));
    const remaining = Math.max(0, maxLimit - totalContext);

    this.currentData = {
      ...tokenData,
      totalContext,
      maxLimit,
      percent,
      remaining,
      convId: this.currentConvId,
      fileMtime: fileStat.mtimeMs
    };

    this.renderStatusBar();
    this.checkAlerts();
  }

  renderStatusBar() {
    if (!this.currentData) return;

    const config = vscode.workspace.getConfiguration('antigravityContext');
    const displayMode = config.get('displayMode', 'percentageAndTokens');
    const warningThreshold = config.get('warningThreshold', 75);
    const criticalThreshold = config.get('criticalThreshold', 85);

    const { percent, totalContext, maxLimit, remaining, inputTokens, cacheTokens, outputTokens, model, convId, isNew } = this.currentData;

    const percentStr = (percent || 0).toFixed(1) + '%';
    const totalStr = formatTokens(totalContext);
    const limitStr = formatTokens(maxLimit);

    let icon = '$(dashboard)';
    let statusDesc = '🟢 充裕 (安全)';

    if (isNew || totalContext === 0) {
      this.statusBarItem.backgroundColor = undefined;
      statusDesc = '🟢 准备就绪 (新会话)';
      if (displayMode === 'percentageOnly') {
        this.statusBarItem.text = `${icon} 0.0%`;
      } else if (displayMode === 'tokensOnly') {
        this.statusBarItem.text = `${icon} 0/${limitStr}`;
      } else {
        this.statusBarItem.text = `${icon} 上下文: 0.0% (0/${limitStr})`;
      }
    } else {
      if (percent >= criticalThreshold) {
        icon = '$(error)';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusDesc = '🔴 极度拥挤 (强烈建议使用 /compact 压缩)';
      } else if (percent >= warningThreshold) {
        icon = '$(warning)';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusDesc = '🟡 偏高 (建议在适当时机进行压缩)';
      } else {
        this.statusBarItem.backgroundColor = undefined;
      }

      // 格式化状态栏文本
      if (displayMode === 'percentageOnly') {
        this.statusBarItem.text = `${icon} ${percentStr}`;
      } else if (displayMode === 'tokensOnly') {
        this.statusBarItem.text = `${icon} ${totalStr}/${limitStr}`;
      } else {
        this.statusBarItem.text = `${icon} 上下文: ${percentStr} (${totalStr}/${limitStr})`;
      }
    }

    // 进度条渲染
    const progressBar = makeProgressBar(percent, 16);
    const cacheHitRate = totalContext > 0 ? ((cacheTokens / totalContext) * 100).toFixed(1) + '%' : '0%';

    // Markdown Tooltip 卡片设计
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const convTitle = (isNew || convId === 'new') ? '新会话 (准备就绪)' : (convId ? convId.substring(0, 16) + '...' : '当前会话');

    md.appendMarkdown(`### 🧠 Antigravity 对话上下文监控\n\n`);
    md.appendMarkdown(`**当前会话**: \`${convTitle}\`\n\n`);
    md.appendMarkdown(`**活跃模型**: \`${model || 'Gemini 3.8 Flash'}\`  *(上限: ${limitStr} Tokens)*\n\n`);
    md.appendMarkdown(`---\n\n`);

    md.appendMarkdown(`| 维度指标 | 数值统计 | 说明占比 |\n`);
    md.appendMarkdown(`| :--- | :--- | :--- |\n`);
    md.appendMarkdown(`| 📊 **总上下文占用** | **${formatExact(totalContext)}** | **${percentStr}** (${statusDesc.split(' ')[0]}) |\n`);
    md.appendMarkdown(`| 📥 **未缓存输入** | ${formatExact(inputTokens)} | 本轮直接输入 |\n`);
    md.appendMarkdown(`| ⚡ **Prompt 缓存** | ${formatExact(cacheTokens)} | 命中率 **${cacheHitRate}** |\n`);
    md.appendMarkdown(`| 📤 **最新模型输出** | ${formatExact(outputTokens)} | 上一轮生成结果 |\n`);
    md.appendMarkdown(`| 🛡️ **剩余可用空间** | **${formatExact(remaining)}** | 剩余额度 |\n\n`);

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`**占用进度**: \`[${progressBar}] ${percentStr}\`\n\n`);
    md.appendMarkdown(`*评估健康度*: **${statusDesc}**\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[📊 查看详情](command:antigravity-context.showDetails) &nbsp;|&nbsp; [🧹 复制 /compact](command:antigravity-context.copyCompact) &nbsp;|&nbsp; [🔄 刷新用量](command:antigravity-context.refresh) &nbsp;|&nbsp; [📁 打开目录](command:antigravity-context.openFolder)\n`);

    this.statusBarItem.tooltip = md;
  }

  checkAlerts() {
    if (!this.currentData) return;
    const config = vscode.workspace.getConfiguration('antigravityContext');
    const warningThreshold = config.get('warningThreshold', 75);
    const { percent, convId, totalContext, maxLimit } = this.currentData;

    if (percent >= warningThreshold && !this.warnedConversations.has(convId)) {
      this.warnedConversations.add(convId);
      vscode.window.showWarningMessage(
        `⚠️ Antigravity 上下文占用已达 ${percent.toFixed(1)}% (${formatTokens(totalContext)}/${formatTokens(maxLimit)})，建议在聊天窗口输入 /compact 压缩会话以保持最佳推理速度。`,
        '一键复制 /compact',
        '我知道了'
      ).then(selection => {
        if (selection === '一键复制 /compact') {
          this.copyCompactCommand();
        }
      });
    }
  }

  async showActionMenu() {
    if (!this.currentData) {
      vscode.window.showInformationMessage('当前暂未侦测到活跃的 Antigravity 对话。');
      return;
    }

    const { percent, totalContext, maxLimit, remaining, model, convId } = this.currentData;

    const items = [
      {
        label: `$(graph) 查看上下文指标详情`,
        description: `${percent.toFixed(1)}% - 已用 ${formatTokens(totalContext)} / 剩余 ${formatTokens(remaining)}`,
        action: 'showDetails'
      },
      {
        label: `$(clippy) 复制 /compact 压缩指令`,
        description: '复制快捷指令，直接在 Antigravity 聊天窗口中粘贴发送',
        action: 'copyCompact'
      },
      {
        label: `$(file-text) 查看当前会话日志 (transcript.jsonl)`,
        description: '在编辑器中打开底层的详细 JSONL 执行链路日志',
        action: 'openLog'
      },
      {
        label: `$(folder-opened) 打开当前会话存储目录`,
        description: `定位到 .gemini/antigravity/brain/${convId ? convId.substring(0, 8) : ''}...`,
        action: 'openFolder'
      },
      {
        label: `$(sync) 立即强制重新读取数据`,
        description: '刷新当前会话统计',
        action: 'refresh'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Antigravity 上下文监控 · 当前模型: ${model} (${percent.toFixed(1)}%)`
    });

    if (!selected) return;

    switch (selected.action) {
      case 'showDetails':
        this.showDetailedModal();
        break;
      case 'copyCompact':
        this.copyCompactCommand();
        break;
      case 'openLog':
        this.openTranscriptLog();
        break;
      case 'openFolder':
        this.openConversationFolder();
        break;
      case 'refresh':
        this.updateContextData(true);
        vscode.window.showInformationMessage('🔄 上下文占用数据已更新！');
        break;
    }
  }

  showDetailedModal() {
    if (!this.currentData) return;
    const { percent, totalContext, maxLimit, remaining, inputTokens, cacheTokens, outputTokens, model, convId, timestamp } = this.currentData;

    const message = [
      `【Antigravity 对话上下文报告】`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• 活跃模型: ${model}`,
      `• 会话 ID: ${convId || '未知'}`,
      `• 上下文上限: ${formatExact(maxLimit)} Tokens (${formatTokens(maxLimit)})`,
      `• 当前已占用: ${formatExact(totalContext)} Tokens (${percent.toFixed(2)}%)`,
      `• 剩余可用量: ${formatExact(remaining)} Tokens (${(100 - percent).toFixed(2)}%)`,
      `──────────────────────────`,
      `• 未缓存输入: ${formatExact(inputTokens)} Tokens`,
      `• Prompt 缓存: ${formatExact(cacheTokens)} Tokens (${((cacheTokens / totalContext) * 100).toFixed(1)}%)`,
      `• 最新输出: ${formatExact(outputTokens)} Tokens`,
      `• 更新时间: ${timestamp}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      percent >= 80 ? '⚠️ 当前上下文较满，建议执行 /compact 压缩！' : '🟢 上下文健康充裕，运行流畅。'
    ].join('\n');

    vscode.window.showInformationMessage(message, { modal: true }, '复制 /compact 指令', '打开日志文件').then(btn => {
      if (btn === '复制 /compact 指令') this.copyCompactCommand();
      if (btn === '打开日志文件') this.openTranscriptLog();
    });
  }

  async copyCompactCommand() {
    await vscode.env.clipboard.writeText('/compact');
    vscode.window.showInformationMessage('📋 已成功复制 "/compact" 到剪贴板！请直接在 Antigravity 聊天框中粘贴发送以压缩上下文。');
  }

  async openTranscriptLog() {
    if (this.currentTranscriptPath && fs.existsSync(this.currentTranscriptPath)) {
      const doc = await vscode.workspace.openTextDocument(this.currentTranscriptPath);
      await vscode.window.showTextDocument(doc, { preview: true });
    } else {
      vscode.window.showErrorMessage('未找到当前会话日志文件。');
    }
  }

  openConversationFolder() {
    if (this.currentConvId) {
      const folderPath = path.join(this.brainDir, this.currentConvId);
      if (fs.existsSync(folderPath)) {
        vscode.env.openExternal(vscode.Uri.file(folderPath));
        return;
      }
    }
    vscode.window.showErrorMessage('未找到对应的会话文件夹。');
  }

  dispose() {
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (e) {}
    }
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch (e) {}
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

let monitorInstance = null;

function activate(context) {
  monitorInstance = new AntigravityContextMonitor(context);
}

function deactivate() {
  if (monitorInstance) {
    monitorInstance.dispose();
    monitorInstance = null;
  }
}

module.exports = {
  activate,
  deactivate
};
