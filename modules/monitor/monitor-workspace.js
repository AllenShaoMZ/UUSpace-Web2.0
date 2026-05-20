/**
 * 综测工作台：工作区 Tab（整页：表格 + 曲线 + 分列）独立持久化。
 */

function defaultWorkspaceTab(name = "Tab页面 1") {
  return {
    id: `mws-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name,
    layoutColumns: 1,
    panels: [],
    curveWindowMs: 0,
    tableSearch: "",
  };
}

function normalizeTablePanel(panel) {
  return {
    id: String(panel.id || `mtable-${Date.now()}`),
    kind: "table",
    name: String(panel.name || "表格"),
    sheet: Number(panel.sheet) || 0,
    codes: Array.isArray(panel.codes) ? panel.codes.filter(Boolean) : [],
    wholeSheet: !!panel.wholeSheet,
  };
}

function normalizeCurvePanel(panel, normalizeCurveView) {
  const view = normalizeCurveView({
    id: panel.id,
    name: panel.name,
    charts: panel.charts,
    layoutColumns: panel.layoutColumns,
  });
  return {
    id: view.id,
    kind: "curve",
    name: view.name,
    charts: view.charts,
    layoutColumns: view.layoutColumns,
  };
}

function legacyTabToPanels(tab, normalizeCurveView) {
  const panels = [];
  (tab.tableViews || []).forEach((tv) => {
    panels.push(
      normalizeTablePanel({
        id: tv.id,
        kind: "table",
        name: tv.name,
        sheet: tv.sheet,
        codes: tv.codes,
        wholeSheet: tv.wholeSheet,
      }),
    );
  });
  (tab.curveViews || []).forEach((cv) => {
    const view = normalizeCurveView(cv);
    panels.push(normalizeCurvePanel({ kind: "curve", ...view }, normalizeCurveView));
  });
  return panels;
}

/** 旧 tableViews + curveViews → panels（表格在前、曲线在后） */
function migrateTabToPanels(tab, normalizeCurveView) {
  if (Array.isArray(tab.panels) && tab.panels.length) {
    return tab.panels.map((panel) =>
      panel.kind === "curve" ? normalizeCurvePanel(panel, normalizeCurveView) : normalizeTablePanel(panel),
    );
  }
  if (Array.isArray(tab.panels)) {
    return legacyTabToPanels(tab, normalizeCurveView);
  }
  return legacyTabToPanels(tab, normalizeCurveView);
}

function normalizeWorkspaceTab(tab, normalizeCurveView) {
  return {
    id: String(tab.id || `mws-${Date.now()}`),
    name: String(tab.name || "Tab页面"),
    layoutColumns: Math.min(4, Math.max(1, Number(tab.layoutColumns) || 1)),
    panels: migrateTabToPanels(tab, normalizeCurveView),
    curveWindowMs: Number(tab.curveWindowMs) || 0,
    tableSearch: String(tab.tableSearch || ""),
  };
}

/** 规范化/迁移综测工作区快照（含旧版扁平结构） */
export function normalizeMonitorWorkspaceSnapshot(ws, normalizeCurveView = (v) => v) {
  if (!ws || typeof ws !== "object") {
    return { tabs: [defaultWorkspaceTab()], activeTabId: "", tableSearchHistory: [] };
  }
  if (Array.isArray(ws.tabs) && ws.tabs.length) {
    const normalized = {
      tabs: ws.tabs.map((tab) => normalizeWorkspaceTab(tab, normalizeCurveView)),
      activeTabId: String(ws.activeTabId || ""),
      tableSearchHistory: Array.isArray(ws.tableSearchHistory) ? ws.tableSearchHistory : [],
    };
    if (!normalized.activeTabId || !normalized.tabs.some((tab) => tab.id === normalized.activeTabId)) {
      normalized.activeTabId = normalized.tabs[0].id;
    }
    return normalized;
  }
  const legacyTab = normalizeWorkspaceTab(
    {
      id: `mws-legacy-${Date.now()}`,
      name: "Tab页面 1",
      layoutColumns: ws.layoutColumns,
      tableViews: ws.tableViews,
      curveViews: ws.curveViews,
      tableSearch: ws.tableSearch,
      curveWindowMs: ws.curveWindowMs,
    },
    normalizeCurveView,
  );
  return {
    tabs: [legacyTab],
    activeTabId: legacyTab.id,
    tableSearchHistory: Array.isArray(ws.tableSearchHistory) ? ws.tableSearchHistory : [],
  };
}

export function createMonitorWorkspaceApi(deps) {
  const {
    state,
    protocolRules,
    escapeAttr,
    renderTabScrollerHtml,
    renderParamValueCell,
    renderActiveCurvePage,
    getActiveCurveView,
    getCurveChartApi,
    getCurveWindowMs,
    getSheetStat,
    getTelemetryRowsForSheet,
    getSelectedWaveRows,
    buildTableSearchGroups,
    normalizeCurveView,
    schedulePersistWorkspace,
    appendStatusEvent,
    renderView,
    normalizeTableSearchHistory,
    getTelemetryDisplayValue,
    updateValueCell,
    updateCellText,
    formatRawHex,
    curveChartInstances,
  } = deps;

  function ensureMonitorWorkspace() {
    if (!state.monitorWorkspace || typeof state.monitorWorkspace !== "object") {
      state.monitorWorkspace = normalizeMonitorWorkspaceSnapshot(null, normalizeCurveView);
    }
    const ws = state.monitorWorkspace;
    if (!Array.isArray(ws.tabs) || !ws.tabs.length) {
      const tab = defaultWorkspaceTab();
      ws.tabs = [tab];
      ws.activeTabId = tab.id;
    }
    if (!Array.isArray(ws.tableSearchHistory)) ws.tableSearchHistory = [];
    ws.tabs.forEach((tab) => {
      if (!Array.isArray(tab.panels)) {
        tab.panels = migrateTabToPanels(tab, normalizeCurveView);
      } else if (tab.panels.length) {
        tab.panels = tab.panels.map((panel) =>
          panel.kind === "curve" ? normalizeCurvePanel(panel, normalizeCurveView) : normalizeTablePanel(panel),
        );
      } else if (tab.tableViews?.length || tab.curveViews?.length) {
        tab.panels = migrateTabToPanels(tab, normalizeCurveView);
      }
      tab.layoutColumns = Math.min(4, Math.max(1, Number(tab.layoutColumns) || 1));
      tab.curveWindowMs = Number(tab.curveWindowMs) || 0;
      delete tab.tableViews;
      delete tab.curveViews;
      delete tab.activeTableViewId;
      delete tab.activeCurveViewId;
    });
    if (!ws.activeTabId || !ws.tabs.some((tab) => tab.id === ws.activeTabId)) {
      ws.activeTabId = ws.tabs[0].id;
    }
    return ws;
  }

  function getWorkspaceTabs() {
    return ensureMonitorWorkspace().tabs;
  }

  function getActiveWorkspaceTab() {
    const ws = ensureMonitorWorkspace();
    return ws.tabs.find((tab) => tab.id === ws.activeTabId) || ws.tabs[0] || null;
  }

  function getActiveWorkspaceTabId() {
    return ensureMonitorWorkspace().activeTabId || "";
  }

  function setActiveWorkspaceTabId(id) {
    const ws = ensureMonitorWorkspace();
    if (ws.tabs.some((tab) => tab.id === id)) ws.activeTabId = id;
  }

  function isMonitorViewActive() {
    return state.activeView === "monitor";
  }

  function getWorkspaceTableSearch() {
    if (!isMonitorViewActive()) return state.tableSearch || "";
    return getActiveWorkspaceTab()?.tableSearch || "";
  }

  function setWorkspaceTableSearch(text) {
    const value = String(text ?? "");
    if (isMonitorViewActive()) {
      const tab = getActiveWorkspaceTab();
      if (tab) tab.tableSearch = value;
    } else {
      state.tableSearch = value;
    }
  }

  function getWorkspaceTableSearchHistory() {
    if (isMonitorViewActive()) return ensureMonitorWorkspace().tableSearchHistory || [];
    return state.tableSearchHistory || [];
  }

  function setWorkspaceTableSearchHistory(list) {
    if (isMonitorViewActive()) ensureMonitorWorkspace().tableSearchHistory = list;
    else state.tableSearchHistory = list;
  }

  function getMonitorPanels() {
    return getActiveWorkspaceTab()?.panels || [];
  }

  function getMonitorTablePanels() {
    return getMonitorPanels().filter((panel) => panel.kind === "table");
  }

  function getMonitorCurvePanels() {
    return getMonitorPanels().filter((panel) => panel.kind === "curve");
  }

  function getMonitorPanelById(panelId) {
    return getMonitorPanels().find((panel) => panel.id === panelId) || null;
  }

  function panelToCurveView(panel) {
    return normalizeCurveView({
      id: panel.id,
      name: panel.name,
      charts: panel.charts,
      layoutColumns: panel.layoutColumns,
    });
  }

  function getRowsForTablePanel(panel) {
    if (!panel || panel.kind !== "table") return [];
    const sheetIndex = Number(panel.sheet);
    let rows = getTelemetryRowsForSheet(sheetIndex);
    if (panel.wholeSheet) return rows;
    if (panel.codes?.length) rows = rows.filter((row) => panel.codes.includes(row.code));
    return rows;
  }

  function getMonitorTelemetryRows() {
    const firstTable = getMonitorTablePanels()[0];
    return firstTable ? getRowsForTablePanel(firstTable) : [];
  }

  function parseMonitorSheetKeyword(keyword) {
    const text = String(keyword || "").trim();
    if (!text) return null;
    const sheets = protocolRules.map((rule) => Number(rule.sheet));
    if (/^\d+$/.test(text)) {
      const n = Number(text);
      if (sheets.includes(n)) return n;
    }
    const patterns = [/^(?:sheet|s|表)\s*(\d+)$/i, /^(\d+)\s*(?:sheet|表)$/i, /^s\s*(\d+)$/i];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const n = Number(match[1]);
      if (sheets.includes(n)) return n;
    }
    return null;
  }

  function inferSheetFromTelemetryRows(rows) {
    for (const row of rows || []) {
      const fromGroup = String(row.group || "").match(/Sheet\s*(\d+)/i);
      if (fromGroup) return Number(fromGroup[1]);
      const fromFrame = String(row.frame || "").match(/^S(\d+)$/i);
      if (fromFrame) return Number(fromFrame[1]);
    }
    return Number(state.activeSheet) || 0;
  }

  function addMonitorTablePanel({ name, sheet, codes, wholeSheet }) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return null;
    const tableCount = getMonitorTablePanels().length;
    const id = `mtable-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const panel = normalizeTablePanel({
      id,
      kind: "table",
      name: name || `表格${tableCount + 1}`,
      sheet: Number(sheet),
      codes: wholeSheet ? [] : [...new Set((codes || []).filter(Boolean))],
      wholeSheet: !!wholeSheet,
    });
    tab.panels = [...(tab.panels || []), panel];
    tab.tableSearch = "";
    state.selectedWaveCodes.clear();
    schedulePersistWorkspace();
    return panel;
  }

  function addMonitorCurvePanel(codes) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return null;
    const uniqueCodes = [...new Set((codes || []).filter(Boolean))];
    if (!uniqueCodes.length) return null;
    const curveCount = getMonitorCurvePanels().length;
    const panelId = `mcurve-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const chart = {
      id: `chart-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      name: `曲线${curveCount + 1}`,
      codes: uniqueCodes,
    };
    const panel = normalizeCurvePanel(
      {
        id: panelId,
        kind: "curve",
        name: `曲线${curveCount + 1}`,
        charts: [chart],
        layoutColumns: 1,
      },
      normalizeCurveView,
    );
    tab.panels = [...(tab.panels || []), panel];
    tab.tableSearch = "";
    state.selectedWaveCodes.clear();
    schedulePersistWorkspace();
    return { panel, chart, view: panelToCurveView(panel) };
  }

  function removeMonitorPanel(panelId) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return;
    const removed = (tab.panels || []).find((panel) => panel.id === panelId);
    if (!removed) return;
    if (removed.kind === "curve") {
      (removed.charts || []).forEach((chart) => deps.disposeCurveChart?.(chart.id));
    }
    tab.panels = (tab.panels || []).filter((panel) => panel.id !== panelId);
    schedulePersistWorkspace();
  }

  function getMonitorCurveWindowMs() {
    const tab = getActiveWorkspaceTab();
    const raw = Number(tab?.curveWindowMs) || 0;
    const api = getCurveChartApi();
    if (api?.normalizeCurveWindowMs) return api.normalizeCurveWindowMs(raw || state.curveWindowMs);
    return raw || Number(state.curveWindowMs) || 7_200_000;
  }

  function setMonitorCurveWindowMs(ms) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return;
    const api = getCurveChartApi();
    tab.curveWindowMs = api?.normalizeCurveWindowMs ? api.normalizeCurveWindowMs(ms) : ms;
    schedulePersistWorkspace();
  }

  function addMonitorWholeSheet(sheetIndex) {
    const sheet = Number(sheetIndex);
    const rows = getTelemetryRowsForSheet(sheet);
    if (!rows.length) {
      appendStatusEvent("无法添加整表", `Sheet ${sheet} 暂无参数定义`);
      return null;
    }
    const view = addMonitorTablePanel({ name: `表${sheet}`, sheet, wholeSheet: true });
    appendStatusEvent(`已添加 Sheet ${sheet} 整表`, `${rows.length} 项 · ${view.name}`);
    renderView();
    return view;
  }

  function handleMonitorAddTable() {
    const keyword = getWorkspaceTableSearch().trim();
    const selected = getSelectedWaveRows();
    if (selected.length) {
      const view = addMonitorTablePanel({
        name: `表格${getMonitorTablePanels().length}`,
        sheet: inferSheetFromTelemetryRows(selected),
        codes: selected.map((row) => row.code),
        wholeSheet: false,
      });
      appendStatusEvent("已添加表格", `${selected.length} 个波道 · ${view.name}`);
      renderView();
      return;
    }
    const sheetFromSearch = parseMonitorSheetKeyword(keyword);
    if (sheetFromSearch != null) {
      addMonitorWholeSheet(sheetFromSearch);
      renderView();
      return;
    }
    appendStatusEvent(
      "请先搜索并勾选波道",
      "输入参数代号勾选，或输入 Sheet 号（如 0、sheet2）后点「添加表格」",
    );
  }

  function getMonitorLayoutColumns() {
    const tab = getActiveWorkspaceTab();
    return Math.min(4, Math.max(1, Number(tab?.layoutColumns) || 1));
  }

  function applyMonitorWorkspaceLayout(columns) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return;
    tab.layoutColumns = Math.min(4, Math.max(1, Number(columns) || 1));
    const root = document.querySelector(".monitor-view");
    if (root) {
      root.style.setProperty("--monitor-cols", String(tab.layoutColumns));
      requestAnimationFrame(() => {
        curveChartInstances.forEach((entry) => entry.chart?.resize());
      });
    } else {
      renderView();
    }
    schedulePersistWorkspace();
  }

  function createWorkspaceTab({ name } = {}) {
    const ws = ensureMonitorWorkspace();
    const tab = defaultWorkspaceTab(name || `Tab页面 ${ws.tabs.length + 1}`);
    ws.tabs = [...ws.tabs, tab];
    ws.activeTabId = tab.id;
    schedulePersistWorkspace();
    return tab;
  }

  function switchWorkspaceTab(tabId) {
    if (!tabId || getActiveWorkspaceTabId() === tabId) return;
    setActiveWorkspaceTabId(tabId);
    schedulePersistWorkspace();
    deps.disposeAllCurveCharts?.();
    renderView();
  }

  function removeWorkspaceTab(tabId) {
    const ws = ensureMonitorWorkspace();
    const removed = ws.tabs.find((tab) => tab.id === tabId);
    if (!removed) return;
    (removed.panels || [])
      .filter((panel) => panel.kind === "curve")
      .forEach((panel) => {
        (panel.charts || []).forEach((chart) => deps.disposeCurveChart?.(chart.id));
      });
    ws.tabs = ws.tabs.filter((tab) => tab.id !== tabId);
    if (ws.activeTabId === tabId) {
      ws.activeTabId = ws.tabs[0]?.id || "";
    }
    if (!ws.tabs.length) {
      const tab = defaultWorkspaceTab();
      ws.tabs = [tab];
      ws.activeTabId = tab.id;
    }
    schedulePersistWorkspace();
  }

  function forEachCurveChartInActiveTab(callback) {
    getMonitorCurvePanels().forEach((panel) => {
      const view = panelToCurveView(panel);
      (view.charts || []).forEach((chart) => callback(chart, view, panel));
    });
  }

  function findCurveChartInActiveTab(chartId) {
    let found = null;
    forEachCurveChartInActiveTab((chart, view) => {
      if (chart.id === chartId) found = { chart, view };
    });
    return found;
  }

  function renderMonitorSearchDropdownHtml() {
    const keyword = getWorkspaceTableSearch().trim();
    const picked = state.selectedWaveCodes;
    const sheetIdx = parseMonitorSheetKeyword(keyword);
    const parts = [];
    if (!keyword && !picked.size) {
      return `<div class="search-history-empty">输入参数代号或 Sheet 号（0–7），在下拉中勾选</div>`;
    }
    if (sheetIdx != null) {
      parts.push(
        `<div class="monitor-sheet-add-block"><button type="button" class="primary-button" data-add-monitor-sheet="${sheetIdx}">添加 Sheet ${sheetIdx} 整表（${getTelemetryRowsForSheet(sheetIdx).length} 项）</button></div>`,
      );
    }
    if (keyword) {
      const groups = buildTableSearchGroups(getWorkspaceTableSearch());
      if (!groups.length && sheetIdx == null) {
        parts.push(`<div class="search-history-empty">未找到「${escapeAttr(keyword)}」</div>`);
      } else if (groups.length) {
        parts.push(
          `<div class="monitor-search-groups auto-hide-scrollbar">${groups
            .map(
              (group) => `<div class="channel-group"><h4>${group.name}</h4>${group.items
                .map(
                  (item) =>
                    `<label class="check-row monitor-search-row"><span>${escapeAttr(item.name)}</span><input type="checkbox" class="wave-check" data-wave-select="${escapeAttr(item.code)}" ${picked.has(item.code) ? "checked" : ""} /></label>`,
                )
                .join("")}</div>`,
            )
            .join("")}</div>`,
        );
      }
    }
    if (picked.size) {
      parts.push(
        `<div class="monitor-search-dropdown-footer">已选 ${picked.size} 项 · 点「添加表格」或「添加曲线」</div>`,
      );
    }
    return parts.join("");
  }

  function updateMonitorSearchDropdown() {
    const panel = document.getElementById("monitorSearchDropdown");
    const input = document.getElementById("monitorParamSearch");
    if (!panel || !input) return;
    const focused =
      document.activeElement === input ||
      (document.activeElement && panel.contains(document.activeElement));
    panel.innerHTML = renderMonitorSearchDropdownHtml();
    panel.classList.toggle("open", focused);
    input.setAttribute("aria-expanded", focused ? "true" : "false");
  }

  function scheduleMonitorSearchUpdate(input) {
    clearTimeout(state.searchDebounceTimers.monitorParamSearch);
    state.searchDebounceTimers.monitorParamSearch = setTimeout(() => {
      setWorkspaceTableSearch(input.value);
      schedulePersistWorkspace();
      updateMonitorSearchDropdown();
    }, 200);
  }

  function renderMonitorWorkspaceTabsBar() {
    const tabs = getWorkspaceTabs();
    const activeId = getActiveWorkspaceTabId();
    const activeTab = getActiveWorkspaceTab();
    const plottedCount = [
      ...new Set(
        tabs.flatMap((tab) =>
          (tab.panels || [])
            .filter((panel) => panel.kind === "curve")
            .flatMap((panel) => (panel.charts || []).flatMap((chart) => chart.codes || [])),
        ),
      ),
    ].length;
    const tabsHtml = tabs.length
      ? renderTabScrollerHtml(
          tabs
            .map(
              (tab) =>
                `<button type="button" class="segment ${tab.id === activeId ? "active" : ""}" data-monitor-workspace-tab="${escapeAttr(tab.id)}">${escapeAttr(tab.name)}</button>`,
            )
            .join(""),
          { segmentClass: "monitor-workspace-tabs", ariaLabel: "综测工作区 Tab" },
        )
      : "";
    return `
    <div class="monitor-workspace-bar">
      <div class="curve-page-toolbar monitor-workspace-toolbar">
        <div class="view-title curve-page-toolbar-title">工作区 Tab<small>${tabs.length} 个 · ${plottedCount} 个曲线通道</small></div>
        <div class="curve-page-tabs-scroll">${tabsHtml}</div>
        ${
          activeTab
            ? `<input class="inline-name-input curve-page-rename" data-rename-monitor-workspace="${escapeAttr(activeTab.id)}" value="${escapeAttr(activeTab.name)}" aria-label="修改工作区 Tab 名称" />`
            : ""
        }
      </div>
      <div class="header-actions monitor-workspace-actions">
        <button type="button" class="ghost-button" data-create-monitor-workspace title="新建空白工作区 Tab（含表格区与曲线区）">新建Tab页面</button>
        ${
          activeTab && tabs.length > 1
            ? `<button type="button" class="send-mini" data-remove-monitor-workspace="${escapeAttr(activeTab.id)}">删除本 Tab</button>`
            : activeTab && tabs.length === 1
              ? `<button type="button" class="send-mini" data-remove-monitor-workspace="${escapeAttr(activeTab.id)}" title="删除后自动新建空白 Tab">删除本 Tab</button>`
              : ""
        }
      </div>
    </div>`;
  }

  function renderMonitorToolbar() {
    const monitorLayout = getMonitorLayoutColumns();
    const layoutOptions = Array.from({ length: 4 }, (_, index) => index + 1);
    const curveApi = getCurveChartApi();
    const curveWindowMs = getMonitorCurveWindowMs();
    const windowOptions = curveApi?.CURVE_WINDOW_OPTIONS || [{ seconds: 7200, label: "2 小时" }];
    return `
    ${renderMonitorWorkspaceTabsBar()}
    <div class="monitor-toolbar">
      <button type="button" class="ghost-button" data-add-table>添加表格</button>
      <button type="button" class="ghost-button" data-add-curve>添加曲线</button>
      <button type="button" class="ghost-button" data-clear-curves>清空曲线</button>
      <div class="search-history-wrap monitor-search">
        <input class="search-box" id="monitorParamSearch" value="${escapeAttr(getWorkspaceTableSearch())}" placeholder="搜索参数代号或 Sheet 号（如 0、sheet2）" autocomplete="off" aria-expanded="false" aria-controls="monitorSearchDropdown" />
        <div class="monitor-search-dropdown search-history-panel" id="monitorSearchDropdown" role="listbox" aria-label="波道搜索与勾选"></div>
      </div>
      <label class="curve-layout-select monitor-toolbar-select">
        分列
        <select data-monitor-layout-select aria-label="当前工作区 Tab 分列（表格与曲线布局）">
          ${layoutOptions
            .map((count) => `<option value="${count}" ${monitorLayout === count ? "selected" : ""}>${count} 列</option>`)
            .join("")}
        </select>
      </label>
      <label class="curve-layout-select monitor-toolbar-select">
        显示时长
        <select data-monitor-curve-window-select aria-label="当前工作区曲线显示时长">
          ${windowOptions
            .map((opt) => {
              const ms = opt.seconds * 1000;
              return `<option value="${ms}" ${curveWindowMs === ms ? "selected" : ""}>${escapeAttr(opt.label)}</option>`;
            })
            .join("")}
        </select>
      </label>
    </div>`;
  }

  function renderMonitorTablePanel(panel) {
    const rows = getRowsForTablePanel(panel).filter((param) => {
      if (state.dataFilter === "告警") return param.status === "告警" || param.status === "关注";
      if (state.dataFilter === "收藏") return state.favorites.has(param.code);
      return true;
    });
    const sheetStat = getSheetStat(panel.sheet);
    const tableBody = !rows.length
      ? `<div class="monitor-table-empty"><div class="empty-hint">${panel.wholeSheet ? `Sheet ${panel.sheet} 整表暂无数据` : "该表格暂无匹配参数"}</div></div>`
      : `<div class="table-scroll auto-hide-scrollbar" aria-label="遥测参数列表">
            <table class="param-table">
              <thead>
                <tr><th style="width:54px">选择</th><th>参数代号</th><th>参数名称</th><th>当前值</th><th>十六进制</th><th>单位</th></tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (param) => `
                      <tr class="${param.code === state.selectedParamCode ? "selected-row" : ""} ${param.updated ? "fresh-row" : ""} ${param.status === "告警" ? "alert-row" : ""}" data-param-row="${param.code}">
                        <td data-wave-cell><input class="wave-check" type="checkbox" data-wave-select="${param.code}" ${state.selectedWaveCodes.has(param.code) ? "checked" : ""} /></td>
                        <td>${param.code}</td>
                        <td>${param.name}</td>
                        <td data-param-value>${renderParamValueCell(param)}</td>
                        <td data-param-hex>${param.hex || param.raw}</td>
                        <td>${param.unit || ""}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`;
    return `
      <div class="monitor-panel-cell monitor-panel-table" data-panel-kind="table" data-panel-id="${escapeAttr(panel.id)}" data-monitor-sheet="${panel.sheet}">
        <header class="monitor-panel-header">
          <strong>${escapeAttr(panel.name)}</strong>
          ${panel.wholeSheet ? `<span class="tag ok">整表</span>` : ""}
          <span class="monitor-panel-meta">Sheet ${panel.sheet} · ${rows.length} 项</span>
          ${sheetStat ? `<span class="tag ${sheetStat.total > 0 ? "ok" : "warn"}">${sheetStat.total > 0 ? "刷新中" : "等待 UDP"}</span>` : ""}
          <button type="button" class="send-mini" data-remove-monitor-panel="${escapeAttr(panel.id)}">删除</button>
        </header>
        <section class="table-wrap monitor-table-wrap monitor-table-wrap-full">${tableBody}</section>
      </div>`;
  }

  function renderMonitorCurvePanel(panel) {
    const view = panelToCurveView(panel);
    const channelCount = (view.charts || []).reduce((n, chart) => n + (chart.codes?.length || 0), 0);
    return `
      <div class="monitor-panel-cell monitor-panel-curve" data-panel-kind="curve" data-panel-id="${escapeAttr(panel.id)}">
        <header class="monitor-panel-header">
          <strong>${escapeAttr(panel.name)}</strong>
          <span class="monitor-panel-meta">${channelCount ? `${channelCount} 个通道` : "暂无通道"}</span>
          <button type="button" class="send-mini" data-remove-monitor-panel="${escapeAttr(panel.id)}">删除</button>
        </header>
        <div class="monitor-curve-stage curve-page-stage">
          ${renderActiveCurvePage(view)}
        </div>
      </div>`;
  }

  function renderMonitorGrid() {
    const panels = getMonitorPanels();
    if (!panels.length) {
      return `<div class="monitor-grid-empty"><div class="empty-hint">本工作区 Tab 暂无格子。勾选波道后点「添加表格」或「添加曲线」，或输入 Sheet 号添加整表；「分列」决定每行格子数，按顺序从左到右、从上到下填充。</div></div>`;
    }
    return `<div class="monitor-grid">${panels.map((panel) => (panel.kind === "curve" ? renderMonitorCurvePanel(panel) : renderMonitorTablePanel(panel))).join("")}</div>`;
  }

  function renderMonitor() {
    try {
      const layoutCols = getMonitorLayoutColumns();
      const panels = getMonitorPanels();
      return `
    <div class="view monitor-view" style="--monitor-cols: ${layoutCols}" data-monitor-panel-count="${panels.length}">
      <div class="monitor-chrome">${renderMonitorToolbar()}</div>
      ${renderMonitorGrid()}
    </div>`;
    } catch (err) {
      console.error("[UUSPACE monitor] renderMonitor failed", err);
      return `<div class="view monitor-view"><div class="empty-hint">综测工作台渲染失败：${escapeAttr(err?.message || String(err))}</div></div>`;
    }
  }

  function updateMonitorTableRowsInPlace() {
    getMonitorTablePanels().forEach((panel) => {
      const sheetIndex = Number(panel.sheet);
      const liveValues = state.sheetLiveValues[String(sheetIndex)] || {};
      const root = document.querySelector(`.monitor-panel-table[data-panel-id="${escapeAttr(panel.id)}"]`);
      if (!root) return;
      root.querySelectorAll("tr[data-param-row]").forEach((row) => {
        const live = liveValues[row.dataset.paramRow];
        if (!live) return;
        const display = getTelemetryDisplayValue(live, row.dataset.paramRow);
        updateValueCell(row.querySelector("[data-param-value]"), row.dataset.paramRow, display.value);
        updateCellText(row.querySelector("[data-param-hex]"), formatRawHex(live.raw ?? live.hex));
      });
    });
  }

  function hydrateMonitorWorkspace() {
    ensureMonitorWorkspace();
    const ws = state.monitorWorkspace;
    ws.tableSearchHistory = normalizeTableSearchHistory(ws.tableSearchHistory);
    ws.tabs.forEach((tab) => {
      tab.panels = migrateTabToPanels(tab, normalizeCurveView);
    });
  }

  function getCurveViewsForMonitor() {
    return getMonitorCurvePanels().map(panelToCurveView);
  }

  function getActiveCurveViewIdForMonitor() {
    return getMonitorCurvePanels()[0]?.id || "";
  }

  function setActiveCurveViewIdForMonitor(id) {
    void id;
  }

  function setCurveViewsForMonitor(views) {
    const tab = getActiveWorkspaceTab();
    if (!tab) return;
    const curveById = new Map((views || []).map((view) => [view.id, normalizeCurveView(view)]));
    tab.panels = (tab.panels || []).map((panel) => {
      if (panel.kind !== "curve") return panel;
      const updated = curveById.get(panel.id);
      if (!updated) return panel;
      return normalizeCurvePanel(
        { kind: "curve", id: panel.id, name: updated.name, charts: updated.charts, layoutColumns: updated.layoutColumns },
        normalizeCurveView,
      );
    });
  }

  function getAllMonitorCurveCodes() {
    return [
      ...new Set(
        getWorkspaceTabs().flatMap((tab) =>
          (tab.panels || [])
            .filter((panel) => panel.kind === "curve")
            .flatMap((panel) => (panel.charts || []).flatMap((chart) => chart.codes || []))
            .filter(Boolean),
        ),
      ),
    ];
  }

  return {
    ensureMonitorWorkspace,
    isMonitorViewActive,
    getWorkspaceTableSearch,
    setWorkspaceTableSearch,
    getWorkspaceTableSearchHistory,
    setWorkspaceTableSearchHistory,
    getMonitorPanels,
    getMonitorTablePanels,
    getMonitorTelemetryRows,
    addMonitorCurvePanel,
    removeMonitorPanel,
    getMonitorCurveWindowMs,
    setMonitorCurveWindowMs,
    forEachCurveChartInActiveTab,
    findCurveChartInActiveTab,
    parseMonitorSheetKeyword,
    addMonitorWholeSheet,
    handleMonitorAddTable,
    applyMonitorWorkspaceLayout,
    updateMonitorSearchDropdown,
    scheduleMonitorSearchUpdate,
    renderMonitor,
    updateMonitorTableRowsInPlace,
    hydrateMonitorWorkspace,
    createWorkspaceTab,
    switchWorkspaceTab,
    removeWorkspaceTab,
    getWorkspaceTabs,
    getActiveWorkspaceTab,
    getCurveViewsForMonitor,
    getActiveCurveViewIdForMonitor,
    setActiveCurveViewIdForMonitor,
    setCurveViewsForMonitor,
    getAllMonitorCurveCodes,
  };
}
