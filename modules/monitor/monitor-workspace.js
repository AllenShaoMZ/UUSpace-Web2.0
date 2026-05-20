/**
 * 综测工作台：独立表格/曲线工作区、搜索下拉勾选、与遥测页状态隔离。
 * 由 app.js 在运行时注入依赖后调用。
 */
export function createMonitorWorkspaceApi(deps) {
  const {
    state,
    escapeAttr,
    renderTabScrollerHtml,
    renderParamValueCell,
    renderActiveCurvePage,
    getCurveChartApi,
    getCurveWindowMs,
    getSheetStat,
    getTelemetryRowsForSheet,
    getAllTelemetryRows,
    getSelectedWaveRows,
    buildTableSearchGroups,
    normalizeCurveView,
    schedulePersistWorkspace,
    appendStatusEvent,
    renderView,
  } = deps;

  function ensureMonitorWorkspace() {
    if (!state.monitorWorkspace) {
      state.monitorWorkspace = {
        curveViews: [],
        activeCurveViewId: "",
        layoutColumns: 1,
        tableViews: [],
        activeTableViewId: "",
        tableSearch: "",
        tableSearchHistory: [],
      };
    }
    if (!Array.isArray(state.monitorWorkspace.tableViews)) state.monitorWorkspace.tableViews = [];
    if (!Array.isArray(state.monitorWorkspace.tableSearchHistory)) {
      state.monitorWorkspace.tableSearchHistory = [];
    }
    return state.monitorWorkspace;
  }

  function isMonitorViewActive() {
    return state.activeView === "monitor";
  }

  function getWorkspaceTableSearch() {
    if (isMonitorViewActive()) return ensureMonitorWorkspace().tableSearch || "";
    return state.tableSearch || "";
  }

  function setWorkspaceTableSearch(text) {
    const value = String(text ?? "");
    if (isMonitorViewActive()) ensureMonitorWorkspace().tableSearch = value;
    else state.tableSearch = value;
  }

  function getWorkspaceTableSearchHistory() {
    if (isMonitorViewActive()) return ensureMonitorWorkspace().tableSearchHistory || [];
    return state.tableSearchHistory || [];
  }

  function setWorkspaceTableSearchHistory(list) {
    if (isMonitorViewActive()) ensureMonitorWorkspace().tableSearchHistory = list;
    else state.tableSearchHistory = list;
  }

  function getMonitorTableViews() {
    return ensureMonitorWorkspace().tableViews || [];
  }

  function getActiveMonitorTableView() {
    const views = getMonitorTableViews();
    const activeId = ensureMonitorWorkspace().activeTableViewId || "";
    return views.find((view) => view.id === activeId) || views[0] || null;
  }

  function getMonitorTelemetryRows() {
    const view = getActiveMonitorTableView();
    if (!view) return [];
    const sheetIndex = Number(view.sheet);
    let rows = getTelemetryRowsForSheet(sheetIndex);
    if (view.wholeSheet) return rows;
    if (view.codes?.length) rows = rows.filter((row) => view.codes.includes(row.code));
    return rows;
  }

  function parseMonitorSheetKeyword(keyword) {
    const text = String(keyword || "").trim();
    if (!text) return null;
    const sheets = deps.protocolRules.map((rule) => Number(rule.sheet));
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

  function addMonitorTableView({ name, sheet, codes, wholeSheet }) {
    const ws = ensureMonitorWorkspace();
    const id = `mtable-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const view = {
      id,
      name: name || `表格${ws.tableViews.length + 1}`,
      sheet: Number(sheet),
      codes: wholeSheet ? [] : [...new Set((codes || []).filter(Boolean))],
      wholeSheet: !!wholeSheet,
    };
    ws.tableViews = [...ws.tableViews, view];
    ws.activeTableViewId = id;
    ws.tableSearch = "";
    state.selectedWaveCodes.clear();
    schedulePersistWorkspace();
    return view;
  }

  function addMonitorWholeSheet(sheetIndex) {
    const sheet = Number(sheetIndex);
    const rows = getTelemetryRowsForSheet(sheet);
    if (!rows.length) {
      appendStatusEvent("无法添加整表", `Sheet ${sheet} 暂无参数定义`);
      return null;
    }
    const view = addMonitorTableView({ name: `表${sheet}`, sheet, wholeSheet: true });
    appendStatusEvent(`已添加 Sheet ${sheet} 整表`, `${rows.length} 项 · ${view.name}`);
    return view;
  }

  function handleMonitorAddTable() {
    const keyword = getWorkspaceTableSearch().trim();
    const selected = getSelectedWaveRows();
    if (selected.length) {
      const view = addMonitorTableView({
        name: `表格${getMonitorTableViews().length}`,
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
    return Math.min(4, Math.max(1, Number(ensureMonitorWorkspace().layoutColumns) || 1));
  }

  function applyMonitorWorkspaceLayout(columns) {
    const ws = ensureMonitorWorkspace();
    ws.layoutColumns = Math.min(4, Math.max(1, Number(columns) || 1));
    const root = document.querySelector(".monitor-view");
    if (root) {
      root.className = `view monitor-view layout-cols-${ws.layoutColumns}`;
      requestAnimationFrame(() => {
        deps.curveChartInstances.forEach((entry) => entry.chart?.resize());
      });
    } else {
      renderView();
    }
    schedulePersistWorkspace();
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

  function renderMonitorToolbar() {
    const monitorLayout = getMonitorLayoutColumns();
    const layoutOptions = Array.from({ length: 4 }, (_, index) => index + 1);
    const curveApi = getCurveChartApi();
    const curveWindowMs = getCurveWindowMs();
    const windowOptions = curveApi?.CURVE_WINDOW_OPTIONS || [{ seconds: 7200, label: "2 小时" }];
    return `
    <div class="monitor-toolbar">
      <button type="button" class="ghost-button" data-add-table>添加表格</button>
      <button type="button" class="ghost-button" data-add-curve>添加曲线</button>
      <button type="button" class="ghost-button" data-create-curve-view title="新建空白 Tab 页面，不添加波道">新建Tab页面</button>
      <button type="button" class="ghost-button" data-clear-curves>清空曲线</button>
      <div class="search-history-wrap monitor-search">
        <input class="search-box" id="monitorParamSearch" value="${escapeAttr(getWorkspaceTableSearch())}" placeholder="搜索参数代号或 Sheet 号（如 0、sheet2）" autocomplete="off" aria-expanded="false" aria-controls="monitorSearchDropdown" />
        <div class="monitor-search-dropdown search-history-panel" id="monitorSearchDropdown" role="listbox" aria-label="波道搜索与勾选"></div>
      </div>
      <label class="curve-layout-select monitor-toolbar-select">
        分列
        <select data-monitor-layout-select aria-label="工作区分列">
          ${layoutOptions
            .map((count) => `<option value="${count}" ${monitorLayout === count ? "selected" : ""}>${count} 列</option>`)
            .join("")}
        </select>
      </label>
      <label class="curve-layout-select monitor-toolbar-select">
        显示时长
        <select data-curve-window-select aria-label="曲线显示时长">
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

  function renderMonitorTableBody() {
    const tableViews = getMonitorTableViews();
    const activeView = getActiveMonitorTableView();
    const rows = getMonitorTelemetryRows().filter((param) => {
      if (state.dataFilter === "告警") return param.status === "告警" || param.status === "关注";
      if (state.dataFilter === "收藏") return state.favorites.has(param.code);
      return true;
    });
    const sheetStat = activeView ? getSheetStat(activeView.sheet) : null;
    const tableBody = !activeView
      ? `<div class="monitor-table-empty"><div class="empty-hint">工作区暂无表格。在上方搜索框下拉中勾选波道，或输入 Sheet 号后点「添加表格」。</div></div>`
      : !rows.length
        ? `<div class="monitor-table-empty"><div class="empty-hint">${activeView.wholeSheet ? `Sheet ${activeView.sheet} 整表暂无数据` : "该表格暂无匹配参数"}</div></div>`
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
    const monitorTableTabs =
      tableViews.length > 0
        ? `<div class="monitor-table-tabs">
          ${renderTabScrollerHtml(
            tableViews
              .map(
                (view) =>
                  `<button type="button" class="segment ${view.id === activeView?.id ? "active" : ""}" data-table-view="${escapeAttr(view.id)}">${escapeAttr(view.name)}${view.wholeSheet ? " ·整表" : ""}</button>`,
              )
              .join(""),
            { segmentClass: "monitor-table-view-tabs", ariaLabel: "综测表格切换" },
          )}
          ${activeView ? `<button type="button" class="send-mini" data-remove-table-view="${escapeAttr(activeView.id)}">删除表格</button>` : ""}
        </div>
        ${
          activeView && sheetStat
            ? `<div class="monitor-table-status">
                <span class="tag ${sheetStat.total > 0 ? "ok" : "warn"}">${sheetStat.total > 0 ? "刷新中" : "等待 UDP"}</span>
                <span>Sheet ${activeView.sheet} · ${rows.length} 项</span>
              </div>`
            : ""
        }`
        : "";
    return `
    <div class="monitor-table-body">
      ${monitorTableTabs}
      <section class="table-wrap monitor-table-wrap monitor-table-wrap-full">
        ${tableBody}
      </section>
    </div>`;
  }

  function renderMonitorCurveStage() {
    const curveViews = deps.getCurveViews ? deps.getCurveViews() : [];
    const activeCurveView = deps.getActiveCurveView();
    const activeId = deps.getActiveCurveViewId ? deps.getActiveCurveViewId() : "";
    const plottedCount = [
      ...new Set(curveViews.flatMap((view) => (view.charts || []).flatMap((chart) => chart.codes || []))),
    ].length;
    const tabsHtml = curveViews.length
      ? renderTabScrollerHtml(
          curveViews
            .map(
              (view) =>
                `<button type="button" class="segment ${view.id === activeId ? "active" : ""}" data-curve-view="${escapeAttr(view.id)}">${escapeAttr(view.name)}</button>`,
            )
            .join(""),
          { segmentClass: "monitor-curve-tabs", ariaLabel: "综测曲线 Tab 切换" },
        )
      : "";
    return `
    <div class="monitor-curve-pane">
      <div class="monitor-curve-workbar curve-workbar">
        <div class="curve-page-toolbar monitor-curve-toolbar">
          <div class="view-title curve-page-toolbar-title">曲线 Tab<small>${curveViews.length} 个 Tab · ${plottedCount} 个通道</small></div>
          <div class="curve-page-tabs-scroll">${tabsHtml}</div>
          ${
            activeCurveView
              ? `<input class="inline-name-input curve-page-rename" data-rename-curve="${escapeAttr(activeCurveView.id)}" value="${escapeAttr(activeCurveView.name)}" aria-label="修改 Tab 页面标题" />`
              : ""
          }
        </div>
        <div class="header-actions monitor-curve-actions">
          ${
            activeCurveView
              ? `<button type="button" class="send-mini" data-remove-curve-view="${escapeAttr(activeCurveView.id)}">删除本 Tab</button>`
              : ""
          }
        </div>
      </div>
      <div class="monitor-curve-stage curve-page-stage">
        ${
          activeCurveView
            ? renderActiveCurvePage(activeCurveView)
            : `<article class="view-surface chart-wrap empty-curve-panel"><div class="empty-hint">点「新建Tab页面」建空白页，或在搜索框勾选波道后点「添加曲线」。</div></article>`
        }
      </div>
    </div>`;
  }
  function renderMonitor() {
    const layoutCols = getMonitorLayoutColumns();
    return `
    <div class="view monitor-view layout-cols-${layoutCols}">
      ${renderMonitorToolbar()}
      <section class="monitor-pane monitor-pane-table">${renderMonitorTableBody()}</section>
      <section class="monitor-pane monitor-pane-curve">${renderMonitorCurveStage()}</section>
    </div>`;
  }

  function updateMonitorTableRowsInPlace() {
    const view = getActiveMonitorTableView();
    if (!view) return;
    const sheetIndex = Number(view.sheet);
    const liveValues = state.sheetLiveValues[String(sheetIndex)] || {};
    document.querySelectorAll(".monitor-table-wrap tr[data-param-row]").forEach((row) => {
      const live = liveValues[row.dataset.paramRow];
      if (!live) return;
      const display = deps.getTelemetryDisplayValue(live, row.dataset.paramRow);
      deps.updateValueCell(row.querySelector("[data-param-value]"), row.dataset.paramRow, display.value);
      deps.updateCellText(row.querySelector("[data-param-hex]"), deps.formatRawHex(live.raw ?? live.hex));
    });
  }

  function hydrateMonitorWorkspace() {
    if (!state.monitorWorkspace?.curveViews?.length) state.monitorWorkspace.activeCurveViewId = "";
    if (!state.monitorWorkspace?.tableViews?.length) state.monitorWorkspace.activeTableViewId = "";
    state.monitorWorkspace.tableSearchHistory = deps.normalizeTableSearchHistory(
      state.monitorWorkspace.tableSearchHistory,
    );
  }

  return {
    ensureMonitorWorkspace,
    isMonitorViewActive,
    getWorkspaceTableSearch,
    setWorkspaceTableSearch,
    getWorkspaceTableSearchHistory,
    setWorkspaceTableSearchHistory,
    getMonitorTableViews,
    getActiveMonitorTableView,
    getMonitorTelemetryRows,
    parseMonitorSheetKeyword,
    addMonitorWholeSheet,
    handleMonitorAddTable,
    applyMonitorWorkspaceLayout,
    updateMonitorSearchDropdown,
    scheduleMonitorSearchUpdate,
    renderMonitor,
    updateMonitorTableRowsInPlace,
    hydrateMonitorWorkspace,
    getCurveViewsForMonitor: () => {
      const ws = ensureMonitorWorkspace();
      ws.curveViews = (ws.curveViews || []).map(normalizeCurveView);
      return ws.curveViews;
    },
    getActiveCurveViewIdForMonitor: () => ensureMonitorWorkspace().activeCurveViewId || "",
    setActiveCurveViewIdForMonitor: (id) => {
      ensureMonitorWorkspace().activeCurveViewId = id || "";
    },
    setCurveViewsForMonitor: (views) => {
      ensureMonitorWorkspace().curveViews = views;
    },
    getAllMonitorCurveCodes: () => {
      return [
        ...new Set(
          (ensureMonitorWorkspace().curveViews || [])
            .flatMap((view) => (normalizeCurveView(view).charts || []).flatMap((chart) => chart.codes || []))
            .filter(Boolean),
        ),
      ];
    },
  };
}
