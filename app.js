const state = {
  activeView: "status",
  frame: 582912,
  missionSatTitle: "XX-07",
  dataFilter: "全部",
  commandFilter: "",
  commandCategory: "全部",
  selectedCommandId: "K2001",
  selectedRuleId: "S0",
  selectedParamCode: "FW-A-RPM",
  udpBridge: {
    available: false,
    connected: false,
    udpPort: 7101,
    udpPorts: [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108],
    portStats: [],
    parser: { enabled: false, meterFile: "", sheetCounts: {} },
    total: 0,
    lastPacket: null,
    history: [],
  },
  liveTelemetry: [],
  sheetDefinitions: {},
  sheetStats: [],
  sheetLiveValues: {},
  activeSheet: 0,
  dockHighlightSheet: 0,
  activeTableViewId: "sheet-0",
  tableViews: [],
  selectedWaveCodes: new Set(),
  waveDrawerOpen: false,
  tableSearch: "",
  tableSearchHistory: [],
  telemetry: { decimals: {}, columns: {} },
  curveSearch: "",
  curveBuffers: {},
  pendingCurveCodes: [],
  refreshTimer: null,
  searchDebounceTimers: {},
  renameDebounceTimers: {},
  lastViewRefreshAt: 0,
  lastUdpEventAt: 0,
  suppressedUdpEvents: 0,
  rowsCacheKey: "",
  rowsCache: [],
  channels: new Set(),
  curveViews: [],
  activeCurveViewId: "",
  curveAnimationFrame: null,
  isComposing: false,
  pendingCommandId: "",
  commandResults: {},
  connectionConfigOpen: false,
  protocolTestHex: "",
  protocolDraftRuleId: "",
  protocolDraftHeader: "",
  favorites: new Set(["FW-A-RPM", "ATT-X", "BAT-VOLT", "TEMP-CABIN"]),
  summaryCollapsed: false,
  dockCollapsed: false,
  curveChannelPanelCollapsed: false,
  chartTick: 0,
  lastWaveSelectCode: "",
};

let lastAlarmPanelUpdateAt = 0;

const views = [
  { id: "status", label: "状态总览" },
  { id: "protocol", label: "协议配置" },
  { id: "table", label: "遥测表格" },
  { id: "curve", label: "遥测曲线" },
  { id: "command", label: "指令控制" },
  { id: "connection", label: "连接管理" },
];

const links = [
  {
    id: "udp",
    name: "UDP 遥测链路",
    mode: "Server",
    local: "192.168.11.166:7101-7108",
    remote: "遥测大表 Sheet 0-7",
    rate: "125 pkt/s",
    loss: "0.12%",
    status: "ok",
  },
  {
    id: "tcp",
    name: "TCP 工作站链路",
    mode: "Standby",
    local: "0.0.0.0:18080",
    remote: "2 个客户端",
    rate: "42 pkt/s",
    loss: "0.00%",
    status: "ok",
  },
  {
    id: "serial",
    name: "串口调试链路",
    mode: "COM3",
    local: "115200 / 8N1",
    remote: "本机采集",
    rate: "待机",
    loss: "--",
    status: "warn",
  },
];

const summaryItems = [
  { code: "FW-A-RPM", name: "飞轮A转速", value: "1248 rpm", percent: 62, status: "ok" },
  { code: "FW-B-RPM", name: "飞轮B转速", value: "1186 rpm", percent: 58, status: "ok" },
  { code: "ATT-X", name: "姿态角 X", value: "+0.013 deg", percent: 47, status: "ok" },
  { code: "ATT-Y", name: "姿态角 Y", value: "-0.020 deg", percent: 51, status: "ok" },
  { code: "TEMP-CABIN", name: "舱内温度", value: "28.6 ℃", percent: 71, status: "warn" },
  { code: "BAT-VOLT", name: "电池母线电压", value: "28.4 V", percent: 82, status: "ok" },
];

const alarms = [
  { level: "warning", source: "飞轮热控", text: "飞轮A温度接近上限", time: "08:13:22" },
  { level: "danger", source: "UDP链路", text: "2号工作站丢包率瞬时升高", time: "08:18:04" },
  { level: "warning", source: "姿控软件", text: "姿态Y短时漂移", time: "08:21:49" },
];

const statusEvents = [
  { time: "08:11:08", type: "success", text: "UDP 7101-7108 遥测链路建立", detail: "每个端口对应遥测大表一个数字 Sheet" },
  { time: "08:13:22", type: "warning", text: "飞轮A温度接近上限", detail: "当前 68.2 ℃ / 上限 70 ℃" },
  { time: "08:15:43", type: "success", text: "遥测帧 F2 恢复连续", detail: "Frame 582681 起连续 25fps" },
  { time: "08:18:04", type: "danger", text: "UDP工作站丢包率瞬时升高", detail: "2号工作站 1.8% / 当前已回落" },
  { time: "08:22:15", type: "info", text: "协议 Sheet 与遥测表同步完成", detail: "F0-F7 数字 Sheet 已映射" },
];

const telemetryGroups = [
  {
    name: "飞轮组",
    items: [
      { code: "FW-A-RPM", name: "A转速", unit: "rpm", value: 1248, color: "#5B7CFA" },
      { code: "FW-B-RPM", name: "B转速", unit: "rpm", value: 1186, color: "#3DD9B4" },
      { code: "FW-C-RPM", name: "C转速", unit: "rpm", value: 1214, color: "#FFB020" },
    ],
  },
  {
    name: "姿态组",
    items: [
      { code: "ATT-X", name: "姿态X", unit: "deg", value: 0.013, color: "#00C2FF" },
      { code: "ATT-Y", name: "姿态Y", unit: "deg", value: -0.02, color: "#9B8CFF" },
      { code: "ATT-Z", name: "姿态Z", unit: "deg", value: 0.018, color: "#FF6B9A" },
    ],
  },
  {
    name: "温度组",
    items: [
      { code: "TEMP-CABIN", name: "舱内温度", unit: "℃", value: 28.6, color: "#FFB020" },
      { code: "TEMP-WHEEL", name: "飞轮温度", unit: "℃", value: 68.2, color: "#FF5A65" },
      { code: "TEMP-PCDU", name: "PCDU温度", unit: "℃", value: 31.8, color: "#3DD9B4" },
    ],
  },
];

const parameters = [
  { code: "FW-A-RPM", name: "飞轮A速度", group: "飞轮组", frame: "F2", value: "1248", unit: "rpm", status: "正常", raw: "0B C1 04 E0" },
  { code: "FW-B-RPM", name: "飞轮B速度", group: "飞轮组", frame: "F2", value: "1186", unit: "rpm", status: "正常", raw: "0B C1 04 A2" },
  { code: "ATT-X", name: "姿态X", group: "姿态组", frame: "F1", value: "+0.013", unit: "deg", status: "正常", raw: "22 01 00 0D" },
  { code: "ATT-Y", name: "姿态Y", group: "姿态组", frame: "F1", value: "-0.020", unit: "deg", status: "关注", raw: "22 02 FF EC" },
  { code: "TEMP-CABIN", name: "卫星舱内温度", group: "温度组", frame: "F0", value: "28.6", unit: "℃", status: "正常", raw: "31 10 01 1E" },
  { code: "TEMP-WHEEL", name: "飞轮A温度", group: "温度组", frame: "F2", value: "68.2", unit: "℃", status: "告警", raw: "31 20 02 AA" },
  { code: "TEMP-PCDU", name: "PCDU温度", group: "电源PCDU", frame: "F4", value: "31.8", unit: "℃", status: "正常", raw: "31 24 01 3E" },
  { code: "BAT-VOLT", name: "电池电压", group: "电源PCDU", frame: "F4", value: "28.4", unit: "V", status: "正常", raw: "40 02 01 1C" },
  { code: "UDP-LOSS", name: "UDP丢包率", group: "链路", frame: "SYS", value: "0.12", unit: "%", status: "正常", raw: "55 01 00 0C" },
  { code: "F2-LEN", name: "F2帧长度", group: "协议", frame: "F2", value: "512", unit: "byte", status: "正常", raw: "F2 00 02 00" },
];

const protocolRules = [
  { id: "S0", enabled: true, header: "AA", length: 1777, checksum: "关闭", port: 7101, sheet: 0, type: "1", endian: "大端" },
  { id: "S1", enabled: true, header: "26", length: 1777, checksum: "关闭", port: 7102, sheet: 1, type: "1", endian: "大端" },
  { id: "S2", enabled: true, header: "07 40", length: 1024, checksum: "关闭", port: 7103, sheet: 2, type: "1", endian: "大端" },
  { id: "S3", enabled: true, header: "07 50", length: 1024, checksum: "关闭", port: 7104, sheet: 3, type: "1", endian: "大端" },
  { id: "S4", enabled: true, header: "07 60", length: 1024, checksum: "关闭", port: 7105, sheet: 4, type: "1", endian: "大端" },
  { id: "S5", enabled: true, header: "07 70", length: 1024, checksum: "关闭", port: 7106, sheet: 5, type: "1", endian: "大端" },
  { id: "S6", enabled: true, header: "07 80", length: 1024, checksum: "关闭", port: 7107, sheet: 6, type: "1", endian: "大端" },
  { id: "S7", enabled: true, header: "1A CF", length: 29, checksum: "关闭", port: 7108, sheet: 7, type: "1", endian: "大端" },
];

const commands = [
  {
    id: "K2001",
    name: "飞轮A启动",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "间接指令",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 01 01 00 05 AA BB CC DD EE 4F 2E E9 C8 FD",
    desc: "启动飞轮A闭环控制，等待遥测确认。",
  },
  {
    id: "K2002",
    name: "飞轮A停止",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "间接指令",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 01 01 00 04 AA BB 00 00 4B 2E E9 C8 FD",
    desc: "停止飞轮A输出，适用于热控关注后的人工干预。",
  },
  {
    id: "K2003",
    name: "姿态初始化",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "内部指令",
    node: "姿控软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 02 00 30 01 00 0F 01 00 08 01 02 03 04 05 06 07 08 6A 2E E9 C8 FD",
    desc: "复位姿态控制状态机并装订初始状态。",
  },
  {
    id: "D3101",
    name: "动力学接入",
    category: "动力学指令",
    target: "127.0.0.1",
    port: "18100",
    type: "程控指令",
    node: "地测软件",
    packet: "DA 31 01 00 10 01 00 00 00 7E",
    desc: "接入动力学数据源，用于联调姿控响应。",
  },
  {
    id: "P4101",
    name: "热控参数上注",
    category: "参数上注",
    target: "192.168.11.166",
    port: "19200",
    type: "参数上注",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 03 01 00 06 54 48 43 01 46 00 5D 2E E9 C8 FD",
    desc: "更新飞轮热控阈值和回差参数。",
  },
];

const $ = (selector) => document.querySelector(selector);

function createStore(initialState) {
  const listeners = new Map();
  return {
    state: initialState,
    set(key, value) {
      if (Object.is(initialState[key], value)) return;
      initialState[key] = value;
      (listeners.get(key) || []).forEach((callback) => callback(value, initialState));
    },
    subscribe(keys, callback) {
      keys.forEach((key) => {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(callback);
      });
      return () => {
        keys.forEach((key) => {
          const bucket = listeners.get(key);
          if (bucket) bucket.delete(callback);
        });
      };
    },
  };
}

const store = createStore(state);

/** @type {Map<string, { chart: object, host: Element, legendSelected: Record<string, boolean> }>} */
const curveChartInstances = new Map();
let curveChartFlushTimer = null;
let curveChartFlushInterval = null;

const APP_VERSION =
  typeof window !== "undefined" && window.UUSPACE_APP_VERSION ? window.UUSPACE_APP_VERSION : "2.0.5";

function getUserSettingsApi() {
  return window.UUSPACE_USER_SETTINGS || null;
}

function getPersistApi() {
  return window.UUSPACE_PERSIST || null;
}

function schedulePersistWorkspace() {
  const persist = getPersistApi();
  const api = getUserSettingsApi();
  if (!persist || !api) return;
  persist.debounceSave(
    "workspace.flush",
    () => {
      api.saveWorkspaceSettings(api.snapshotWorkspaceFromState(state), persist);
    },
    400,
  );
}

function hydrateWorkspaceFromStorage() {
  const persist = getPersistApi();
  const api = getUserSettingsApi();
  if (!persist || !api) return;
  api.applyWorkspaceSettings(state, api.loadWorkspaceSettings(persist));
  state.tableSearchHistory = normalizeTableSearchHistory(state.tableSearchHistory);
  if (!state.curveViews.length) state.activeCurveViewId = "";
  state.tableViews = (state.tableViews || []).filter((view) => view && !view.builtin);
  ensureBuiltinTableViews();
  if (
    !state.activeTableViewId ||
    state.activeTableViewId === "整表" ||
    !state.tableViews.some((view) => view.id === state.activeTableViewId)
  ) {
    state.activeTableViewId = builtinTableId(Number.isFinite(state.activeSheet) ? state.activeSheet : 0);
  }
  const activeView = getActiveTableView();
  if (activeView) state.activeSheet = Number(activeView.sheet);
  if (!Number.isFinite(state.dockHighlightSheet)) state.dockHighlightSheet = 0;
}

const BUILTIN_TABLE_ID_PREFIX = "sheet-";

function builtinTableId(sheetIndex) {
  return `${BUILTIN_TABLE_ID_PREFIX}${sheetIndex}`;
}

function ensureBuiltinTableViews() {
  const customs = (state.tableViews || []).filter((view) => view && !view.builtin);
  const builtins = protocolRules.map((rule) => ({
    id: builtinTableId(rule.sheet),
    name: `表${rule.sheet}`,
    sheet: rule.sheet,
    builtin: true,
  }));
  state.tableViews = [...builtins, ...customs];
}

function getActiveTableView() {
  ensureBuiltinTableViews();
  const matched = state.tableViews.find((view) => view.id === state.activeTableViewId);
  if (matched) return matched;
  return (
    state.tableViews.find((view) => view.builtin && Number(view.sheet) === Number(state.activeSheet)) ||
    state.tableViews.find((view) => view.builtin) ||
    null
  );
}

function clearTableSearch({ persist = true } = {}) {
  state.tableSearch = "";
  if (persist) schedulePersistWorkspace();
}

function getSearchHistoryApi() {
  return window.UUSPACE_SEARCH_HISTORY || null;
}

function normalizeTableSearchHistory(list) {
  const api = getSearchHistoryApi();
  return api?.normalizeSearchHistory ? api.normalizeSearchHistory(list) : (list || []).slice(0, 8);
}

function commitTableSearch(term) {
  const value = String(term ?? state.tableSearch ?? "").trim();
  if (!value) return;
  const api = getSearchHistoryApi();
  if (api?.pushSearchHistory) {
    state.tableSearchHistory = api.pushSearchHistory(state.tableSearchHistory, value);
    schedulePersistWorkspace();
  }
}

function updateTableSearchHistoryPanel() {
  const panel = document.getElementById("paramSearchHistoryPanel");
  const input = document.getElementById("paramSearch");
  if (!panel || !input) return;
  const api = getSearchHistoryApi();
  const items = api?.filterSearchHistory
    ? api.filterSearchHistory(state.tableSearchHistory, input.value)
    : state.tableSearchHistory;
  const isOpen = document.activeElement === input;
  const hasItems = items.length > 0;
  panel.classList.toggle("open", isOpen && (hasItems || !!state.tableSearchHistory.length));
  if (!isOpen) {
    panel.innerHTML = "";
    return;
  }
  if (!state.tableSearchHistory.length) {
    panel.innerHTML = `<div class="search-history-empty">暂无搜索历史</div>`;
    return;
  }
  if (!hasItems) {
    panel.innerHTML = `<div class="search-history-empty">无匹配历史</div>`;
    return;
  }
  panel.innerHTML = items
    .map(
      (term) =>
        `<button type="button" class="search-history-item" role="option" data-search-history="${escapeAttr(term)}">${escapeAttr(term)}</button>`,
    )
    .join("");
}

function applyTableSearchValue(value, { commitHistory = true } = {}) {
  const text = String(value ?? "");
  state.tableSearch = text;
  if (commitHistory) commitTableSearch(text);
  else schedulePersistWorkspace();
  updateWaveRailContent();
  const input = document.getElementById("paramSearch");
  if (input) input.value = text;
  restoreInputFocus("paramSearch", text);
  requestAnimationFrame(updateTableSearchHistoryPanel);
}

function bindTableSearchInput() {
  /* 输入逻辑在 bindViewActions 的 stage 委托中处理（避免整页 renderView） */
}

function scheduleTableSearchUpdate(input) {
  clearTimeout(state.searchDebounceTimers.paramSearch);
  state.searchDebounceTimers.paramSearch = setTimeout(() => {
    state.tableSearch = input.value;
    schedulePersistWorkspace();
    updateWaveRailContent();
    updateTableSearchHistoryPanel();
  }, 200);
}

function flushPersistWorkspace() {
  const persist = getPersistApi();
  const api = getUserSettingsApi();
  if (!persist || !api) return;
  persist.flushDebounce?.("workspace.flush");
  api.saveWorkspaceSettings(api.snapshotWorkspaceFromState(state), persist);
}

function switchView(viewId) {
  if (!views.some((view) => view.id === viewId)) return;
  if (state.activeView === viewId) return;
  if (state.activeView === "table" && viewId === "curve" && state.selectedWaveCodes.size) {
    state.pendingCurveCodes = [...new Set([...state.pendingCurveCodes, ...state.selectedWaveCodes])];
  }
  if (viewId !== "curve") {
    stopCurveChartLoop();
    disposeAllCurveCharts();
  }
  if (state.curveAnimationFrame && viewId !== "curve") {
    cancelAnimationFrame(state.curveAnimationFrame);
    state.curveAnimationFrame = null;
  }
  store.set("activeView", viewId);
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }
  state.lastViewRefreshAt = Date.now();
  renderNavigation();
  renderView();
}

function resizeTrendCanvas() {
  document.querySelectorAll(".trend-canvas").forEach((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(300, Math.floor(rect.width * dpr));
    const targetH = Math.max(180, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  });
}

function syncDockRailHandle() {
  const handle = document.getElementById("dockExpandHandle");
  if (!handle) return;
  handle.hidden = !state.dockCollapsed;
}

function setDockCollapsed(collapsed) {
  state.dockCollapsed = !!collapsed;
  document.querySelector(".workspace")?.classList.toggle("workspace--dock-collapsed", state.dockCollapsed);
  const btn = document.getElementById("collapseSummary");
  if (btn) btn.title = state.dockCollapsed ? "展开侧栏" : "隐藏侧栏";
  syncDockRailHandle();
}

function init() {
  hydrateWorkspaceFromStorage();
  ensureBuiltinTableViews();
  setDockCollapsed(state.dockCollapsed);
  const verEl = document.getElementById("appVersion");
  if (verEl) verEl.textContent = `v${APP_VERSION}`;
  renderNavigation();
  renderDock();
  renderTicker();
  renderView();
  bindGlobalActions();
  connectUdpBridge();
  startClock();
  window.addEventListener("beforeunload", flushPersistWorkspace);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistWorkspace();
  });
  store.subscribe(["sheetStats", "sheetLiveValues"], () => {
    if (state.activeView === "table") scheduleUdpViewRefresh();
  });
  window.addEventListener("resize", () => {
    if (state.activeView === "curve") {
      mountCurveCharts();
      return;
    }
    resizeTrendCanvas();
  });
}

function renderNavigation() {
  $(".task-nav").innerHTML = views
    .map((view) => `<button class="task-button ${view.id === state.activeView ? "active" : ""}" data-view="${view.id}">${view.label}</button>`)
    .join("");

  $(".workspace-tabs").innerHTML = views
    .map((view) => `<button class="workspace-tab ${view.id === state.activeView ? "active" : ""}" data-view="${view.id}" role="tab">${view.label}</button>`)
    .join("");

  document.querySelectorAll(".task-nav [data-view], .workspace-tabs [data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.view);
    });
  });
}

function collectTelemetryAlarms() {
  const items = [];
  const seen = new Set();
  protocolRules.forEach((rule) => {
    const liveMap = state.sheetLiveValues[String(rule.sheet)] || {};
    const definitions = getSheetDefinition(rule.sheet);
    definitions.forEach((definition) => {
      const code = definition.code;
      if (!code || seen.has(code)) return;
      const live = liveMap[code];
      const display = getTelemetryDisplayValue(live, code);
      if (display.status !== "告警" && display.status !== "关注") return;
      seen.add(code);
      const timeRaw = live?.time ?? live?.updatedAt ?? live?.lastTime;
      items.push({
        level: display.status === "告警" ? "danger" : "warning",
        source: `Sheet ${rule.sheet} · ${code}`,
        text: `${definition.name || code}：${display.value}${definition.unit ? ` ${definition.unit}` : ""}`,
        time: formatTimeText(timeRaw || Date.now()),
        code,
      });
    });
  });
  getAllTelemetryRows().forEach((row) => {
    if (!row.code || seen.has(row.code)) return;
    if (row.status !== "告警" && row.status !== "关注") return;
    seen.add(row.code);
    items.push({
      level: row.status === "告警" ? "danger" : "warning",
      source: row.group || row.frame || "遥测",
      text: `${row.name || row.code}：${row.value}${row.unit ? ` ${row.unit}` : ""}`,
      time: formatTimeText(Date.now()),
      code: row.code,
    });
  });
  return items;
}

function getAlarmPanelItems() {
  return [...collectTelemetryAlarms(), ...alarms];
}

function renderAlarmListHtml() {
  return getAlarmPanelItems()
    .map(
      (alarm) => `
        <article class="alarm-item ${alarm.level}">
          <header>
            <strong>${alarm.source}</strong>
            <em>${alarm.time}</em>
          </header>
          <div>${alarm.text}</div>
          <span class="tag ${alarm.level === "danger" ? "danger" : "warn"}">${alarm.level === "danger" ? "严重" : "关注"}</span>
        </article>
      `,
    )
    .join("");
}

function updateAlarmPanelInPlace() {
  const list = document.getElementById("alarmList");
  if (!list) return;
  list.innerHTML = renderAlarmListHtml() || `<div class="empty-hint">暂无告警</div>`;
}

function renderDock() {
  const sheetCards = protocolRules
    .map((rule) => {
      const stat = getSheetStat(rule.sheet);
      const count = getSheetDefinition(rule.sheet).length || stat.definitionCount || 0;
      const isActive = Number(rule.sheet) === Number(state.dockHighlightSheet);
      return `
        <button type="button" class="dock-sheet-tab ${isActive ? "active" : ""} ${stat.total > 0 ? "live" : ""}" data-dock-sheet="${rule.sheet}">
          <strong>Sheet ${rule.sheet}</strong>
          <span>端口 ${rule.port}</span>
          <em>${count} 项 · ${stat.total || 0} 包</em>
        </button>
      `;
    })
    .join("");

  $("#summaryList").innerHTML = `<div class="dock-sheet-grid" aria-label="Sheet 0-7 摘要">${sheetCards}</div>`;

  $("#alarmList").innerHTML = renderAlarmListHtml() || `<div class="empty-hint">暂无告警</div>`;

  document.querySelectorAll("[data-dock-sheet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.dockHighlightSheet = Number(btn.dataset.dockSheet);
      document.querySelectorAll("[data-dock-sheet]").forEach((tab) => {
        tab.classList.toggle("active", Number(tab.dataset.dockSheet) === state.dockHighlightSheet);
      });
    });
  });
}

function renderTicker() {
  $("#ticker").innerHTML = statusEvents
    .slice(0, 4)
    .map(
      (event) => `
        <article class="ticker-item">
          <span>${event.time}</span>
          <i class="dot ${event.type === "success" ? "ok" : event.type === "danger" ? "danger" : event.type === "warning" ? "warn" : ""}"></i>
          <strong>${event.text}</strong>
        </article>
      `,
    )
    .join("");
}

function renderView() {
  const renderer = {
    status: renderStatus,
    connection: renderConnection,
    protocol: renderProtocol,
    table: renderTelemetryTable,
    curve: renderCurve,
    command: renderCommandCenter,
  }[state.activeView];

  $("#stage").innerHTML = renderer();
  bindViewActions();
  requestAnimationFrame(() => bindTabScrollers(stage));

  if (state.activeView === "curve") {
    requestAnimationFrame(() => {
      mountCurveCharts();
      requestAnimationFrame(() => {
        flushCurveChartsNow();
        curveChartInstances.forEach((entry) => {
          if (entry.host?.clientWidth > 0 && entry.host?.clientHeight > 0) entry.chart?.resize();
        });
      });
      startCurveChartLoop();
    });
  }
}

function renderStatus() {
  const totalPackets = Number(state.udpBridge.total || 0);
  const activePorts = (state.udpBridge.portStats || []).filter((item) => Number(item.total || 0) > 0).length;
  const warningCount = statusEvents.filter((event) => event.type === "warning" || event.type === "danger").length;
  return `
    <div class="view">
      <section class="view-surface mission-card">
        <div class="mission-id">
          <div>
            <h1>${state.missionSatTitle} 地面综测状态总览</h1>
            <p>连接、遥测、告警和指令状态集中值守，优先暴露需要工程师立刻判断的链路与异常。</p>
          </div>
          <span class="tag ${state.udpBridge.connected ? "ok" : state.udpBridge.available ? "warn" : ""}">${state.udpBridge.connected ? "UDP 在线" : state.udpBridge.available ? "等待数据" : "桥接未启动"}</span>
        </div>
        ${renderPortMatrix()}
        <div class="mission-facts">
          <div class="fact"><span>卫星</span><strong>${state.missionSatTitle}</strong></div>
          <div class="fact"><span>模式</span><strong>在轨测试</strong></div>
          <div class="fact"><span>活跃端口</span><strong>${activePorts}/${protocolRules.length}</strong></div>
          <div class="fact"><span>累计 UDP</span><strong>${totalPackets}</strong></div>
        </div>
      </section>

      <section class="stat-grid">
        <article class="stat-tile ${state.udpBridge.connected ? "ok" : "warn"}"><span>UDP 连接</span><strong>${activePorts}/${protocolRules.length}</strong><div class="delta">端口实时包计数</div></article>
        <article class="stat-tile"><span>当前帧率</span><strong>25fps</strong><div class="delta">Frame ${state.frame}</div></article>
        <article class="stat-tile"><span>最近告警</span><strong>${warningCount}</strong><div class="delta ${warningCount ? "danger-text" : ""}">${warningCount ? "需要复核事件流" : "暂无待处理"}</div></article>
        <article class="stat-tile"><span>遥测参数</span><strong>${getAllTelemetryRows().length}</strong><div class="delta">收藏 ${state.favorites.size} 项</div></article>
      </section>

      <section class="mission-grid">
        <article class="view-surface">
          <div class="view-header">
            <div class="view-title">状态流<small>只保留连接、协议、遥测状态事件</small></div>
            <button class="ghost-button" data-view-shortcut="connection">查看连接</button>
          </div>
          <div class="event-panel-body">${eventRows(statusEvents)}</div>
        </article>
        <article class="view-surface">
          <div class="view-header">
            <div class="view-title">工作区结构<small>根据 MD 文档：任务驱动、顶部切换、Dock 信息面板</small></div>
          </div>
          <div class="event-panel-body">
            ${serviceRow("顶部任务栏", "嵌入 WS / UDP / Frame / UTC 状态", "ok")}
            ${serviceRow("遥测摘要栏", "重点参数常驻左侧 Dock", "ok")}
            ${serviceRow("主工作区", "连接、协议、表格、曲线、指令独立切换", "ok")}
            ${serviceRow("遥测详情", "在表格行内查看当前值、状态和源码", "ok")}
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderConnection() {
  const udp = state.udpBridge;
  const last = udp.lastPacket;
  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">连接管理<small>保留串口 / TCP / UDP 能力，但以值守面板呈现</small></div>
          <div class="header-actions">
            <button class="ghost-button">检测链路</button>
            <button class="primary-button">应用配置</button>
          </div>
        </div>
        <div class="connection-grid">
          ${links.map(linkCard).join("")}
        </div>
      </section>

      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">UDP 接收验证<small>浏览器通过本机桥接服务查看 UDP 数据</small></div>
          <div class="header-actions">
            <span class="tag ${udp.connected ? "ok" : udp.available ? "warn" : ""}">${udp.connected ? "SSE 已连接" : udp.available ? "等待数据" : "未启动桥接服务"}</span>
          </div>
        </div>
          <div class="udp-monitor">
          <div class="udp-stats">
            ${metric("监听端口", udp.udpPorts && udp.udpPorts.length ? `${udp.udpPorts[0]}-${udp.udpPorts[udp.udpPorts.length - 1]}` : "--")}
            ${metric("累计包数", udp.total)}
            ${metric("最近入口", last ? `端口 ${last.listenPort} / Sheet ${last.sheetIndex}` : "--")}
            ${metric("最近长度", last ? `${last.length} byte` : "--")}
          </div>
          <div class="source-block hex-bytes">${renderHexBytes(last ? last.hex : "启动 tools/udp_web_server.py 后，向本机 UDP 7101-7108 发送数据，这里会显示最近包的 HEX。")}</div>
          <div class="port-map">
            ${renderUdpPortStats()}
          </div>
          <div class="udp-history">
            ${udp.history
              .slice(0, 6)
              .map(
                (packet) => `
                  <article class="udp-row">
                    <time>${packet.time.slice(11, 19)}</time>
                    <strong>${packet.sourceIp}:${packet.sourcePort}</strong>
                    <span>Sheet ${packet.sheetIndex} / ${packet.listenPort}</span>
                    <code>${packet.hex}</code>
                  </article>
                `,
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">连接参数<small>面向局域网多工作站，不做传统软件弹窗</small></div>
          <div class="header-actions">
            <button class="ghost-button" data-toggle-connection-config>${state.connectionConfigOpen ? "收起编辑" : "编辑配置"}</button>
          </div>
        </div>
        <div class="config-summary">
          <div class="config-field"><span>正在使用的配置</span><strong>UDP 主用 · 7101-7108 · 192.168.11.166</strong></div>
          <div class="config-field"><span>工作站刷新</span><strong>25fps</strong></div>
          <div class="config-field"><span>串口参数</span><strong>COM3 / 115200 / 8N1</strong></div>
          <div class="config-field"><span>心跳阈值</span><strong>3s</strong></div>
        </div>
        <div class="config-grid ${state.connectionConfigOpen ? "open" : "collapsed"}">
          <label class="config-field"><span>连接类型</span><select class="field"><option>UDP 主用</option><option>TCP 服务端</option><option>串口采集</option></select></label>
          <label class="config-field"><span>本地端口</span><input class="field" value="7101-7108" /></label>
          <label class="config-field"><span>目标地址</span><input class="field" value="192.168.11.166" /></label>
          <label class="config-field"><span>工作站刷新</span><input class="field" value="25fps" /></label>
          <label class="config-field"><span>串口参数</span><input class="field" value="COM3 / 115200 / 8N1" /></label>
          <label class="config-field"><span>心跳阈值</span><input class="field" value="3s" /></label>
        </div>
      </section>
    </div>
  `;
}

function renderProtocol() {
  const selected = protocolRules.find((rule) => rule.id === state.selectedRuleId) || protocolRules[0];
  if (!state.protocolDraftRuleId) state.protocolDraftRuleId = selected.id;
  if (!state.protocolDraftHeader) state.protocolDraftHeader = selected.header;
  const draftHeader = state.protocolDraftRuleId === selected.id ? state.protocolDraftHeader : selected.header;
  const testHex = state.protocolTestHex.trim();
  const matchedRule = testHex ? protocolRules.find((rule) => matchPacketHeader(testHex, rule.header)) : null;
  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">协议配置<small>对应桌面端包头、包长、校验、端口、Sheet、端序规则</small></div>
          <div class="header-actions">
            <button class="ghost-button">从遥测表同步</button>
            <button class="primary-button">保存规则</button>
          </div>
        </div>
        <div class="protocol-grid">
          <aside class="rule-list">
            ${protocolRules
              .map(
                (rule) => `
                  <button class="rule-item ${rule.id === selected.id ? "active" : ""} ${matchedRule && matchedRule.id === rule.id ? "matched" : ""}" data-rule="${rule.id}">
                    <strong>${rule.id}</strong>
                    <span>${rule.header} · ${rule.length} byte · Sheet ${rule.sheet}</span>
                  </button>
                `,
              )
              .join("")}
            <div class="rule-test">
              <h3>测试包头匹配</h3>
              <textarea class="field rule-test-input" data-protocol-test placeholder="粘贴一段 HEX，例如 07 40 AA BB">${escapeAttr(state.protocolTestHex)}</textarea>
              ${matchedRule ? `<div class="rule-test-result ok">匹配到 ${matchedRule.id} · Sheet ${matchedRule.sheet}</div>` : testHex ? `<div class="rule-test-result warn">未匹配到规则</div>` : `<div class="rule-test-result">输入 HEX 后自动匹配规则</div>`}
            </div>
          </aside>
          <section class="protocol-form">
            <div class="config-grid">
              <label class="config-field"><span>启用</span><select class="field"><option>${selected.enabled ? "启用" : "停用"}</option><option>启用</option><option>停用</option></select></label>
              <label class="config-field"><span>包头 HEX</span><input class="field" data-protocol-header value="${escapeAttr(draftHeader)}" /></label>
              <label class="config-field"><span>包长 byte</span><input class="field" value="${selected.length}" /></label>
              <label class="config-field"><span>校验方式</span><select class="field"><option>${selected.checksum}</option><option>关闭</option><option>XOR</option><option>SUM</option><option>None</option></select></label>
              <label class="config-field"><span>监听端口</span><input class="field" value="${selected.port}" /></label>
              <label class="config-field"><span>Sheet 序号</span><input class="field" value="${selected.sheet}" /></label>
              <label class="config-field"><span>协议类型</span><input class="field" value="${selected.type}" /></label>
              <label class="config-field"><span>数值端序</span><select class="field"><option>${selected.endian}</option><option>大端</option><option>小端</option></select></label>
            </div>
            <div class="source-block hex-bytes">${renderHexBytes(`${draftHeader} 00 02 01 7A 22 01 00 0D 22 02 FF EC`, normalizeHexTokens(draftHeader).length)}</div>
            <div class="protocol-preview">
              <div class="kv"><span>示例帧</span><strong>${draftHeader} 00 02 01 7A 22 01 00 0D 22 02 FF EC</strong></div>
              <div class="kv"><span>校验</span><strong>${selected.checksum}</strong></div>
              <div class="kv"><span>目标 Sheet</span><strong>${selected.sheet}</strong></div>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function getRuleBySheet(sheetIndex) {
  return protocolRules.find((rule) => Number(rule.sheet) === Number(sheetIndex)) || { port: "", sheet: sheetIndex };
}

function getSheetDefinition(sheetIndex) {
  return state.sheetDefinitions[String(sheetIndex)] || [];
}

function getSheetStat(sheetIndex) {
  const rule = getRuleBySheet(sheetIndex);
  return (
    state.sheetStats.find((item) => Number(item.sheetIndex) === Number(sheetIndex)) ||
    state.udpBridge.portStats.find((item) => Number(item.sheetIndex) === Number(sheetIndex)) || {
      listenPort: rule.port,
      sheetIndex,
      total: 0,
      lastTime: null,
      updatedCount: 0,
      definitionCount: getSheetDefinition(sheetIndex).length,
    }
  );
}

function renderPortMatrix() {
  return `
    <div class="port-matrix">
      ${protocolRules
        .map((rule) => {
          const stat = getSheetStat(rule.sheet);
          const live = Number(stat.total || 0) > 0;
          return `
            <div class="port-cell ${live ? "live" : "idle"}">
              <span>${rule.port}</span>
              <strong>Sheet ${rule.sheet}</strong>
              <em>${stat.total || 0} 包</em>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHexBytes(input, headerLength = 0) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((byte, index) => {
      const isHex = /^[0-9a-f]{2}$/i.test(byte);
      const tone = isHex && headerLength && index >= headerLength
        ? "faint"
        : isHex
        ? (parseInt(byte, 16) < 0x40 ? "low" : parseInt(byte, 16) < 0x80 ? "mid" : "high")
        : "faint";
      return `<span class="${tone}">${escapeAttr(byte.toUpperCase())}</span>`;
    })
    .join(" ");
}

function renderCommandResult(commandId) {
  const result = state.commandResults[commandId];
  if (!result) return "";
  return `<div class="command-result ${result.ok ? "ok" : "error"}">${result.ok ? "✓" : "×"} ${result.text}</div>`;
}

function matchPacketHeader(hexText, headerText) {
  const packet = normalizeHexTokens(hexText);
  const header = normalizeHexTokens(headerText);
  if (!packet.length || !header.length || packet.length < header.length) return false;
  return header.every((token, index) => packet[index] === token);
}

function normalizeHexTokens(text) {
  return String(text || "")
    .trim()
    .split(/[\s,]+/)
    .map((token) => token.toUpperCase())
    .filter((token) => /^[0-9A-F]{2}$/.test(token));
}

function estimatePortRate(listenPort) {
  const history = state.udpBridge.history || [];
  const now = Date.now();
  const windowMs = 5000;
  const samples = history.filter((packet) => Number(packet.listenPort) === Number(listenPort) && now - Date.parse(packet.time || now) <= windowMs);
  return samples.length / (windowMs / 1000);
}

function isPortStale(item) {
  if (!item || !item.lastTime) return true;
  const elapsed = Date.now() - Date.parse(item.lastTime);
  return !Number.isFinite(elapsed) || elapsed > 4000;
}

function telemetryStatus(value) {
  if (!value) return "正常";
  if (value === "遥测异常" || /异常|告警|超限|错误/.test(value)) return "告警";
  if (/关注|预警|关闭/.test(value)) return "关注";
  return value || "正常";
}

function getParamDecimals(paramOrCode) {
  const code = typeof paramOrCode === "string" ? paramOrCode : paramOrCode?.code;
  const fromState = code != null ? state.telemetry.decimals[code] : undefined;
  if (fromState != null && fromState !== "" && Number.isFinite(Number(fromState))) return Number(fromState);
  return -1;
}

function formatNumericTelemetry(value, decimals = -1) {
  const fn = window.formatTelemetryNumber;
  const resolved = Number.isFinite(Number(decimals)) ? Number(decimals) : -1;
  if (typeof fn === "function") return fn(value, { decimals: resolved });
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(value);
}

function getTelemetryDisplayValue(live, code) {
  const rawStatus = live && live.status != null ? String(live.status).trim() : "";
  const normalizedStatus = rawStatus ? telemetryStatus(rawStatus) : "等待";
  const decimals = getParamDecimals(code);
  if (rawStatus && normalizedStatus !== "正常") {
    return { value: rawStatus, status: normalizedStatus };
  }
  if (live && Number.isFinite(Number(live.value))) {
    return {
      value: formatNumericTelemetry(live.value, decimals),
      status: normalizedStatus === "等待" ? "正常" : normalizedStatus,
    };
  }
  const text = live ? String(live.valueText ?? "").trim() : "";
  if (!text) return { value: "—", status: normalizedStatus === "等待" ? "关注" : normalizedStatus };
  const parsed = Number(text);
  if (Number.isFinite(parsed)) {
    return {
      value: formatNumericTelemetry(parsed, decimals),
      status: normalizedStatus === "等待" ? "正常" : normalizedStatus,
    };
  }
  return { value: text, status: normalizedStatus === "等待" ? "正常" : normalizedStatus };
}

function mapDefinitionToRow(definition, sheetIndex) {
  const live = state.sheetLiveValues[String(sheetIndex)] && state.sheetLiveValues[String(sheetIndex)][definition.code];
  const display = getTelemetryDisplayValue(live, definition.code);
  return {
    index: definition.index,
    serialNo: definition.serialNo,
    waveNo: definition.waveNo,
    bitWidth: definition.bitWidth,
    code: definition.code,
    name: definition.name || definition.code,
    group: `Sheet ${sheetIndex}`,
    frame: `S${sheetIndex}`,
    value: display.value,
    unit: definition.unit || "",
    status: display.status,
    raw: live ? String(live.raw) : "—",
    hex: live ? formatRawHex(live.raw) : "—",
    formula: definition.formula,
    dataType: definition.dataType,
    normalValue: definition.normalValue,
    remark: definition.remark,
    updated: Boolean(live),
    updatedAt: live ? live.updatedAt : "",
  };
}

function getTelemetryRowsForSheet(sheetIndex) {
  const definitions = getSheetDefinition(sheetIndex);
  if (definitions.length) {
    return definitions.map((definition) => mapDefinitionToRow(definition, sheetIndex));
  }
  return parameters.map((param, index) => ({
    index,
    serialNo: index + 1,
    waveNo: param.waveNo || param.frame || "",
    bitWidth: param.bitWidth || "",
    ...param,
  }));
}

function getActiveTelemetryRows() {
  const view = getActiveTableView();
  const sheetIndex = view ? Number(view.sheet) : Number(state.activeSheet);
  state.activeSheet = sheetIndex;
  let rows = getTelemetryRowsForSheet(sheetIndex);
  if (view?.codes?.length) {
    rows = rows.filter((row) => view.codes.includes(row.code));
  }
  return rows;
}

function getFilteredTelemetryRows() {
  return getActiveTelemetryRows().filter((param) => {
    const keyword = state.tableSearch.trim().toLowerCase();
    const matchText =
      !keyword ||
      [param.code, param.name, param.group, param.frame, param.waveNo, param.remark, param.formula]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    if (state.dataFilter === "告警") return matchText && (param.status === "告警" || param.status === "关注");
    if (state.dataFilter === "收藏") return matchText && state.favorites.has(param.code);
    return matchText;
  });
}

function getSelectedTelemetryParam() {
  return getActiveTelemetryRows().find((item) => item.code === state.selectedParamCode) || null;
}

function getSelectedWaveRows() {
  const rowsByCode = new Map(getAllTelemetryRows().map((row) => [row.code, row]));
  return [...state.selectedWaveCodes].map((code) => rowsByCode.get(code)).filter(Boolean);
}

function limitRows(rows, limit) {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

function getAllTelemetryRows() {
  const defStamp = Object.keys(state.sheetDefinitions)
    .map((key) => `${key}:${(state.sheetDefinitions[key] || []).length}`)
    .join("|");
  const cacheKey = `${defStamp}::${state.udpBridge.total}::${parameters.length}`;
  if (state.rowsCacheKey === cacheKey && state.rowsCache.length) {
    return state.rowsCache;
  }
  const rows = [];
  protocolRules.forEach((rule) => rows.push(...getTelemetryRowsForSheet(rule.sheet)));
  state.rowsCache = rows.length ? rows : parameters;
  state.rowsCacheKey = cacheKey;
  return state.rowsCache;
}

function buildTableSearchGroups() {
  const keyword = state.tableSearch.trim().toLowerCase();
  if (!keyword) return [];
  return protocolRules
    .map((rule) => {
      const rows = getTelemetryRowsForSheet(rule.sheet)
        .filter((row) => {
          if (!row.code) return false;
          return [row.code, row.name, row.group, row.frame, row.waveNo, row.remark, row.formula, row.unit]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword));
        })
        .slice(0, 200)
        .map((row) => ({
          code: row.code,
          name: `${row.code} ${row.name}`,
          sheet: rule.sheet,
          port: rule.port,
        }));
      return { name: `Sheet ${rule.sheet} / ${rule.port}`, items: rows };
    })
    .filter((group) => group.items.length);
}

function renderWaveRailSelectedHtml() {
  const rows = getSelectedWaveRows();
  if (!rows.length) {
    return `<div class="empty-hint">在上方搜索并勾选波道，或勾选左侧表格行，再点「添加表格」。</div>`;
  }
  return rows
    .map(
      (param) =>
        `<div class="favorite-item" data-param-card="${escapeAttr(param.code)}"><span>${escapeAttr(param.code)}</span><strong>${escapeAttr(param.name)}</strong></div>`,
    )
    .join("");
}

function renderWaveRailListHtml() {
  const keyword = state.tableSearch.trim();
  const picked = state.selectedWaveCodes;
  if (!keyword) return renderWaveRailSelectedHtml();
  const groups = buildTableSearchGroups();
  const searchBlock = !groups.length
    ? `<div class="empty-hint">未找到匹配「${escapeAttr(keyword)}」的参数</div>`
    : `<div class="channel-groups wave-rail-search-groups auto-hide-scrollbar">
        ${groups
          .map(
            (group) => `
              <div class="channel-group">
                <h4>${group.name}</h4>
                ${group.items
                  .map(
                    (item) => `
                      <label class="check-row" data-wave-search-row="${escapeAttr(item.code)}">
                        <span>${escapeAttr(item.name)}</span>
                        <input type="checkbox" class="wave-check" data-wave-select="${escapeAttr(item.code)}" ${picked.has(item.code) ? "checked" : ""} />
                      </label>
                    `,
                  )
                  .join("")}
              </div>
            `,
          )
          .join("")}
      </div>`;
  return `
    <div class="wave-rail-search-hint">搜索「${escapeAttr(keyword)}」· 可跨 Sheet 勾选</div>
    ${searchBlock}
    <div class="wave-rail-selected-block">
      <h4>已选波道 <small>${picked.size} 项</small></h4>
      ${renderWaveRailSelectedHtml()}
    </div>
  `;
}

function updateWaveRailContent() {
  const list = document.querySelector(".wave-select-rail .favorite-list");
  if (!list) return;
  if (state.tableSearch.trim()) {
    state.waveDrawerOpen = true;
    const rail = document.querySelector(".wave-select-rail");
    rail?.classList.add("open");
    rail?.classList.remove("collapsed");
  }
  list.innerHTML = renderWaveRailListHtml();
  const drawerBtn = document.querySelector("[data-toggle-wave-drawer]");
  if (drawerBtn) {
    drawerBtn.textContent = `${state.waveDrawerOpen ? "收起波道" : "已选波道"} ${state.selectedWaveCodes.size}`;
  }
}

function buildCurveChannelGroups() {
  const keyword = state.curveSearch.trim().toLowerCase();
  const sheetGroups = protocolRules
    .map((rule) => {
      const rows = getTelemetryRowsForSheet(rule.sheet)
        .filter((row) => {
          if (!keyword) return true;
          return [row.code, row.name, row.group, row.waveNo].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
        })
        .filter((row) => row.code)
        .slice(0, keyword ? 160 : 80)
        .map((row) => ({
          code: row.code,
          name: `${row.code} ${row.name}`,
          unit: row.unit || "",
          value: parseNumber(row.value),
          color: colorForCode(row.code),
        }));
      return { name: `Sheet ${rule.sheet} / ${rule.port}`, items: rows };
    })
    .filter((group) => group.items.length);
  return sheetGroups.length ? sheetGroups : telemetryGroups;
}

function parseNumber(value) {
  const num = parseFloat(String(value).replace(/[^\d.+\-eE]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function hasMeaningfulText(value) {
  const text = String(value ?? "").trim();
  return !!text && text !== "—" && text !== "--";
}

function renderParamValueCell(param) {
  return `<div>${formatTelemetryValue(param)}</div>`;
}

function colorForCode(code) {
  const palette = ["#5B7CFA", "#3DD9B4", "#FFB020", "#00C2FF", "#9B8CFF", "#FF6B9A", "#2FD47A", "#FF5A65"];
  let hash = 0;
  String(code || "").split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  });
  return palette[hash % palette.length];
}

function parsePacketTimeMs(packetTime) {
  const t = Date.parse(String(packetTime ?? ""));
  return Number.isFinite(t) ? t : Date.now();
}

function isCurvePlottedCode(code) {
  if (!code) return false;
  return getAllCurveViewCodes().includes(code);
}

function pushCurvePoint(code, value, packetTimeMs) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  if (!isCurvePlottedCode(code)) return;
  const api = getCurveChartApi();
  const sample = { time: parsePacketTimeMs(packetTimeMs), value: numeric };
  const buffer = state.curveBuffers[code] || [];
  const opts = { now: Date.now(), maxPoints: api?.CURVE_MAX_POINTS ?? 1800 };
  state.curveBuffers[code] = api?.appendCurveSampleCoalesced
    ? api.appendCurveSampleCoalesced(buffer, sample, opts)
    : [...buffer, sample].slice(-opts.maxPoints);
  if (state.activeView === "curve") scheduleCurveChartFlush();
}

function seedCurveBuffersForCodes(codes) {
  const rowsByCode = new Map(getAllTelemetryRows().map((row) => [row.code, row]));
  const unique = [...new Set((codes || []).filter(Boolean))];
  unique.forEach((code) => {
    if ((state.curveBuffers[code] || []).length >= 2) return;
    let val = NaN;
    for (const sheet of Object.values(state.sheetLiveValues || {})) {
      const live = sheet[code];
      if (live != null && Number.isFinite(Number(live.value))) {
        val = Number(live.value);
        break;
      }
    }
    if (!Number.isFinite(val)) {
      const row = rowsByCode.get(code);
      val = parseNumber(row?.value);
    }
    if (Number.isFinite(val)) {
      const t = Date.now();
      pushCurvePoint(code, val, t - 10);
      pushCurvePoint(code, val, t);
    }
  });
}

function findCurveChartHost(chartId) {
  if (!chartId) return null;
  try {
    return document.querySelector(`[data-curve-chart="${CSS.escape(String(chartId))}"]`);
  } catch {
    return document.querySelector(`[data-curve-chart="${chartId}"]`);
  }
}

function ensureCurveBufferHasPoints(code) {
  const buf = state.curveBuffers[code] || [];
  if (buf.length >= 2) return;
  seedCurveBuffersForCodes([code]);
}

function ensureCurveChartEntry(chart, echarts, api) {
  const host = findCurveChartHost(chart.id);
  if (!host) return null;
  let entry = curveChartInstances.get(chart.id);
  if (!entry || entry.host !== host) {
    if (entry) disposeCurveChart(chart.id);
    const inst = echarts.init(host, "mission-curve", { renderer: "canvas" });
    entry = { chart: inst, host, legendSelected: entry?.legendSelected || {} };
    inst.on("legendselectchanged", (ev) => {
      entry.legendSelected = { ...(ev.selected || {}) };
    });
    curveChartInstances.set(chart.id, entry);
    bindCurveShiftZoom(host, inst, chart.id);
    bindCurveChartResize(entry);
  }
  return entry;
}

function bindCurveChartResize(entry) {
  if (!entry?.host || !entry.chart || entry.resizeObserver) return;
  entry.resizeObserver = new ResizeObserver(() => {
    const w = entry.host.clientWidth;
    const h = entry.host.clientHeight;
    if (w < 2 || h < 2) return;
    entry.chart.resize();
    const chartId = entry.host.getAttribute("data-curve-chart");
    const view = getActiveCurveView();
    const chart = (view?.charts || []).find((item) => item.id === chartId);
    if (!chart) return;
    const option = buildCurveOptionForChart(chart);
    if (option.legend && entry.legendSelected) {
      option.legend = { ...option.legend, selected: { ...entry.legendSelected } };
    }
    entry.chart.setOption(option, { notMerge: true, lazyUpdate: false });
  });
  entry.resizeObserver.observe(entry.host);
}

function unbindCurveChartResize(entry) {
  if (entry?.resizeObserver) {
    entry.resizeObserver.disconnect();
    entry.resizeObserver = null;
  }
}

function getStagedCurveCodes() {
  return [...new Set([...state.pendingCurveCodes, ...state.selectedWaveCodes, ...state.channels].filter(Boolean))];
}

function getAllCurveViewCodes() {
  return [
    ...new Set(
      state.curveViews
        .flatMap((view) => (normalizeCurveView(view).charts || []).flatMap((chart) => chart.codes || []))
        .filter(Boolean),
    ),
  ];
}

function normalizeCurveView(view) {
  if (!view) return view;
  if (Array.isArray(view.charts)) {
    return {
      ...view,
      layoutColumns: Math.min(10, Math.max(1, Number(view.layoutColumns) || 1)),
      charts: view.charts.map((chart) => ({
        id: chart.id,
        name: chart.name,
        codes: [...new Set((chart.codes || []).filter(Boolean))],
        zoom: chart.zoom,
      })),
    };
  }
  const legacyCodes = [...new Set((view.codes || []).filter(Boolean))];
  return {
    id: view.id,
    name: view.name,
    layoutColumns: Math.min(10, Math.max(1, Number(view.layoutColumns) || 1)),
    charts: legacyCodes.length ? [{ id: `${view.id}-chart-0`, name: "曲线页 1", codes: legacyCodes }] : [],
  };
}

function getCurveViews() {
  state.curveViews = state.curveViews.map(normalizeCurveView);
  return state.curveViews;
}

function getActiveCurveView() {
  const views = getCurveViews();
  return views.find((view) => view.id === state.activeCurveViewId) || views[0] || null;
}

function switchCurveView(viewId) {
  if (!viewId || state.activeCurveViewId === viewId) return;
  const prevId = state.activeCurveViewId;
  state.activeCurveViewId = viewId;
  schedulePersistWorkspace();
  if (prevId) disposeCurveChartsForView(prevId);
  document.querySelectorAll("[data-curve-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.curveView === viewId);
  });
  const stageEl = document.querySelector(".curve-page-stage");
  const view = getActiveCurveView();
  if (stageEl) {
    stageEl.innerHTML = view
      ? renderActiveCurvePage(view)
      : `<article class="view-surface chart-wrap empty-curve-panel"><div class="empty-hint">还没有 Tab 页面。点「新建Tab页面」建空白页，或勾选波道后点「新建曲线页」。</div></article>`;
    requestAnimationFrame(() => {
      mountCurveCharts();
      requestAnimationFrame(() => {
        flushCurveChartsNow();
        curveChartInstances.forEach((entry) => {
          if (entry.host?.clientWidth > 0 && entry.host?.clientHeight > 0) entry.chart?.resize();
        });
      });
      bindTabScrollers(document.querySelector(".curve-page-tabs-scroll") || document);
    });
  }
  const layoutSelect = document.querySelector("[data-curve-layout-select]");
  const active = getActiveCurveView();
  if (layoutSelect) {
    layoutSelect.disabled = !active;
    layoutSelect.value = String(active ? getCurveViewLayoutColumns(active) : 1);
  }
}

function applyCurveLayoutColumns(columns) {
  const tab = getActiveCurveView();
  if (!tab) return;
  const nextColumns = Math.min(10, Math.max(1, Number(columns) || 1));
  tab.layoutColumns = nextColumns;
  state.curveViews = getCurveViews().map((view) => (view.id === tab.id ? { ...tab, layoutColumns: nextColumns } : view));
  const grid = document.querySelector(".curve-page-grid");
  if (grid) {
    grid.className = `curve-page-grid columns-${nextColumns}`;
    requestAnimationFrame(() => {
      curveChartInstances.forEach((entry) => entry.chart?.resize());
    });
  } else {
    renderView();
  }
  schedulePersistWorkspace();
}

function getCurveViewLayoutColumns(view) {
  return Math.min(10, Math.max(1, Number(view?.layoutColumns) || 1));
}

function clearCurveSelections() {
  state.pendingCurveCodes = [];
  state.selectedWaveCodes.clear();
  state.channels.clear();
}

function removeStagedCurveCode(code) {
  state.channels.delete(code);
  state.selectedWaveCodes.delete(code);
  state.pendingCurveCodes = state.pendingCurveCodes.filter((item) => item !== code);
}

function removeCurveCode(viewId, chartId, code) {
  let removedChartId = "";
  state.curveViews = getCurveViews()
    .map((view) => {
      if (view.id !== viewId) return view;
      const charts = (view.charts || [])
        .map((chart) => {
          if (chart.id !== chartId) return chart;
          const codes = (chart.codes || []).filter((item) => item !== code);
          if (!codes.length) removedChartId = chart.id;
          return { ...chart, codes };
        })
        .filter((chart) => (chart.codes || []).length > 0);
      return { ...view, charts };
    });
  if (removedChartId) disposeCurveChart(removedChartId);
}

function removeCurveChart(viewId, chartId) {
  disposeCurveChart(chartId);
  state.curveViews = getCurveViews().map((view) =>
    view.id === viewId ? { ...view, charts: (view.charts || []).filter((chart) => chart.id !== chartId) } : view,
  );
}

function disposeCurveChartsForView(viewId) {
  const view = getCurveViews().find((item) => item.id === viewId);
  (view?.charts || []).forEach((chart) => disposeCurveChart(chart.id));
}

function getCurveSeries(codes = null) {
  const rowsByCode = new Map(getAllTelemetryRows().map((row) => [row.code, row]));
  const flatTelemetry = telemetryGroups.flatMap((group) => group.items);
  const sourceCodes = Array.isArray(codes) ? codes : getAllCurveViewCodes();
  const codeList = [...new Set(sourceCodes.filter(Boolean))];
  if (!codeList.length && !Array.isArray(codes)) codeList.push(...getStagedCurveCodes());
  return codeList.map((code) => {
    const row = rowsByCode.get(code) || flatTelemetry.find((item) => item.code === code) || { code, name: code, value: "—" };
    const buffer = state.curveBuffers[code] || [];
    const lastPoint = buffer.length ? buffer[buffer.length - 1] : null;
    const rawText = String(row.value ?? "").trim();
    const numericFromRow = parseFloat(rawText.replace(/[^\d.+\-eE]/g, ""));
    const rowHasNumericValue = Number.isFinite(numericFromRow);
    const latestValue = lastPoint ? lastPoint.value : (rowHasNumericValue ? numericFromRow : 0);
    const latestUnit = row.unit || "";
    const latestText = buffer.length
      ? `${formatValue(latestValue)}${latestUnit ? ` ${latestUnit}` : ""}`
      : rowHasNumericValue
        ? `${formatValue(latestValue)}${latestUnit ? ` ${latestUnit}` : ""}`
        : hasMeaningfulText(rawText)
          ? rawText
      : "等待数据";
    return {
      code,
      name: row.name || code,
      unit: latestUnit,
      color: row.color || colorForCode(code),
      points: buffer.map((point) => point.value),
      latestValue,
      latestText,
      hasData: buffer.length > 0,
    };
  });
}

function createCurveTabPage() {
  const id = `curve-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const view = { id, name: `Tab页面 ${getCurveViews().length + 1}`, charts: [], layoutColumns: 1 };
  state.curveViews = [...getCurveViews(), view];
  state.activeCurveViewId = id;
  schedulePersistWorkspace();
  return view;
}

/** 在当前 Tab 新建独立曲线画布（不合并到已有画布）；无 Tab 时自动建 Tab */
function addCurveChartFromSelection(codes) {
  const uniqueCodes = [...new Set((codes || []).filter(Boolean))];
  if (!uniqueCodes.length) return null;
  let tab = getActiveCurveView();
  if (!tab) tab = createCurveTabPage();
  const chart = {
    id: `chart-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: `曲线页 ${(tab.charts || []).length + 1}`,
    codes: uniqueCodes,
  };
  tab = { ...tab, charts: [...(tab.charts || []), chart] };
  state.curveViews = getCurveViews().map((view) => (view.id === tab.id ? tab : view));
  state.activeCurveViewId = tab.id;
  seedCurveBuffersForCodes(uniqueCodes);
  schedulePersistWorkspace();
  return { tab, chart };
}

function renderCurveChartPanel(view, chart) {
  const viewId = escapeAttr(view.id);
  const chartId = escapeAttr(chart.id);
  const series = getCurveSeriesForCodes(chart.codes || []);
  return `
    <article class="view-surface chart-wrap curve-chart-panel curve-chart-cell">
      <div class="chart-meta curve-chart-caption">
        <strong>${escapeAttr(chart.name || "曲线页")}</strong>
        <span>${series.length} 通道</span>
        <div class="curve-chart-actions">
          ${series
            .map(
              (item) =>
                `<span class="curve-chip"><i style="background:${item.color}"></i>${escapeAttr(item.code)}<button type="button" data-curve-code-view="${viewId}" data-curve-chart-id="${chartId}" data-remove-curve-code="${escapeAttr(item.code)}" aria-label="移除 ${escapeAttr(item.code)}">×</button></span>`,
            )
            .join("")}
          <button type="button" class="send-mini" data-curve-code-view="${viewId}" data-remove-curve-chart="${chartId}">删除画布</button>
        </div>
      </div>
      <div class="curve-chart-host" data-curve-chart="${chartId}" data-curve-view-id="${viewId}" role="img" aria-label="${escapeAttr(chart.name || "曲线页")}"></div>
    </article>
  `;
}

function renderActiveCurvePage(view) {
  const viewId = escapeAttr(view.id);
  const layoutColumns = getCurveViewLayoutColumns(view);
  const charts = view.charts || [];
  return `
    <article class="view-surface curve-page-surface" data-active-curve-page="${viewId}">
      <div class="curve-page-grid columns-${layoutColumns}">
        ${
          charts.length
            ? charts.map((chart) => renderCurveChartPanel(view, chart)).join("")
            : `<div class="empty-hint curve-page-empty">本 Tab 暂无曲线画布。勾选波道后点「新建曲线页」。</div>`
        }
      </div>
    </article>
  `;
}

function getCurveChartApi() {
  return window.UUSPACE_CURVE || null;
}

function getEchartsLib() {
  return typeof window !== "undefined" ? window.echarts : null;
}

function disposeCurveChart(chartId) {
  const entry = curveChartInstances.get(chartId);
  if (!entry) return;
  unbindCurveChartResize(entry);
  try {
    entry.chart?.dispose();
  } catch {
    /* ignore */
  }
  curveChartInstances.delete(chartId);
}

function disposeAllCurveCharts() {
  [...curveChartInstances.keys()].forEach(disposeCurveChart);
  if (curveChartFlushTimer) {
    clearTimeout(curveChartFlushTimer);
    curveChartFlushTimer = null;
  }
}

function buildCurveOptionForChart(chart, axisZoomOverride) {
  const api = getCurveChartApi();
  const now = Date.now();
  const codes = [...new Set((chart.codes || []).filter(Boolean))];
  const rowsByCode = new Map(getAllTelemetryRows().map((row) => [row.code, row]));
  const series = codes.map((code) => {
    const row = rowsByCode.get(code) || { code, name: code };
    return {
      code,
      name: row.name,
      paramName: row.name,
      color: colorForCode(code),
      samples: state.curveBuffers[code] || [],
    };
  });
  const zoom = axisZoomOverride;
  const axisZoom =
    zoom && [zoom.xMin, zoom.xMax, zoom.yMin, zoom.yMax].some(Number.isFinite)
      ? { xMin: zoom.xMin, xMax: zoom.xMax, yMin: zoom.yMin, yMax: zoom.yMax }
      : undefined;
  if (api?.buildCurveOption) {
    return api.buildCurveOption({
      viewName: chart.name,
      now,
      series,
      axisZoom,
      emptyTitle: "等待遥测数据",
      emptySubtitle: "UDP 到达后以折线绘制；请选数值会变化的波道（开关量、模式字等）观察阶跃。",
    });
  }
  return { series: [] };
}

function mountCurveCharts() {
  const echarts = getEchartsLib();
  const api = getCurveChartApi();
  if (!echarts || !api) {
    if (state.activeView === "curve") requestAnimationFrame(mountCurveCharts);
    return;
  }
  api.registerMissionCurveTheme?.(echarts, colorForCode);

  const activeView = getActiveCurveView();
  const liveChartIds = new Set();
  if (activeView) {
    (activeView.charts || []).forEach((chart) => {
      liveChartIds.add(chart.id);
      (chart.codes || []).forEach((code) => ensureCurveBufferHasPoints(code));
      ensureCurveChartEntry(chart, echarts, api);
    });
  }
  [...curveChartInstances.keys()].forEach((chartId) => {
    if (!liveChartIds.has(chartId)) disposeCurveChart(chartId);
  });
  flushCurveChartsNow();
}

let curveZoomModalEl = null;
let curveZoomModalChart = null;
let curveZoomModalState = null;

function ensureCurveZoomModalDom() {
  if (curveZoomModalEl) return curveZoomModalEl;
  const root = document.createElement("div");
  root.className = "curve-zoom-modal";
  root.id = "curveZoomModal";
  root.innerHTML = `
    <div class="curve-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="curveZoomModalTitle">
      <header class="curve-zoom-header">
        <h3 id="curveZoomModalTitle">区域放大</h3>
        <div class="curve-zoom-actions">
          <button type="button" class="ghost-button" data-curve-zoom-reset>复原视口</button>
          <button type="button" class="ghost-button" data-curve-zoom-close>关闭</button>
        </div>
      </header>
      <div class="curve-zoom-chart-host" data-curve-zoom-chart></div>
    </div>
  `;
  root.addEventListener("click", (ev) => {
    if (ev.target === root) closeCurveZoomModal();
  });
  root.querySelector("[data-curve-zoom-close]")?.addEventListener("click", () => closeCurveZoomModal());
  root.querySelector("[data-curve-zoom-reset]")?.addEventListener("click", () => resetCurveZoomModal());
  document.body.appendChild(root);
  curveZoomModalEl = root;
  return root;
}

function flushCurveZoomModalChart() {
  if (!curveZoomModalChart || !curveZoomModalState?.chart) return;
  const option = buildCurveOptionForChart(curveZoomModalState.chart, curveZoomModalState.axisZoom);
  if (!curveZoomModalState.hasRendered) {
    curveZoomModalChart.setOption(option, { notMerge: true });
    curveZoomModalState.hasRendered = true;
  } else {
    curveZoomModalChart.setOption(
      { series: option.series, xAxis: option.xAxis, yAxis: option.yAxis, tooltip: option.tooltip },
      { notMerge: false, lazyUpdate: true },
    );
  }
  curveZoomModalChart.resize();
}

function openCurveZoomModal(chartId, axisZoom) {
  const view = getActiveCurveView();
  const chart = (view?.charts || []).find((item) => item.id === chartId);
  if (!chart) return;
  const root = ensureCurveZoomModalDom();
  const title = root.querySelector("#curveZoomModalTitle");
  if (title) title.textContent = chart.name || "区域放大";
  root.classList.add("open");
  if (curveZoomModalState?.flushTimer) clearInterval(curveZoomModalState.flushTimer);
  if (curveZoomModalChart) {
    try {
      curveZoomModalChart.dispose();
    } catch {
      /* ignore */
    }
  }
  curveZoomModalState = {
    chartId,
    chart,
    axisZoom: { ...axisZoom },
    hasRendered: false,
    flushTimer: setInterval(() => {
      if (root.classList.contains("open")) flushCurveZoomModalChart();
    }, getCurveChartApi()?.CURVE_FLUSH_INTERVAL_MS || 50),
  };
  const host = root.querySelector("[data-curve-zoom-chart]");
  const echarts = getEchartsLib();
  if (!host || !echarts) return;
  curveZoomModalChart = echarts.init(host, "mission-curve", { renderer: "canvas" });
  flushCurveZoomModalChart();
}

function resetCurveZoomModal() {
  if (!curveZoomModalState) return;
  curveZoomModalState.axisZoom = null;
  curveZoomModalState.hasRendered = false;
  flushCurveZoomModalChart();
}

function closeCurveZoomModal() {
  if (curveZoomModalState?.flushTimer) {
    clearInterval(curveZoomModalState.flushTimer);
  }
  if (curveZoomModalChart) {
    try {
      curveZoomModalChart.dispose();
    } catch {
      /* ignore */
    }
  }
  curveZoomModalChart = null;
  curveZoomModalState = null;
  curveZoomModalEl?.classList.remove("open");
}

function bindCurveShiftZoom(host, chart, chartId) {
  if (!host || !chart || host.dataset.shiftZoomBound === "1") return;
  host.dataset.shiftZoomBound = "1";
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  let drag = null;
  let overlay = null;

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "curve-shift-zoom-rect";
    overlay.setAttribute("aria-hidden", "true");
    host.appendChild(overlay);
    return overlay;
  };

  const paintOverlay = () => {
    if (!drag || !overlay) return;
    const left = Math.min(drag.x0, drag.x1);
    const top = Math.min(drag.y0, drag.y1);
    const width = Math.abs(drag.x1 - drag.x0);
    const height = Math.abs(drag.y1 - drag.y0);
    overlay.style.display = width > 2 && height > 2 ? "block" : "none";
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  };

  const onMove = (e) => {
    if (!drag) return;
    const rect = host.getBoundingClientRect();
    drag.x1 = e.clientX - rect.left;
    drag.y1 = e.clientY - rect.top;
    paintOverlay();
  };

  const onUp = () => {
    if (!drag) return;
    const { x0, y0, x1, y1 } = drag;
    drag = null;
    if (overlay) overlay.style.display = "none";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (Math.abs(x1 - x0) < 8 || Math.abs(y1 - y0) < 8) return;

    const px0 = Math.min(x0, x1);
    const px1 = Math.max(x0, x1);
    const py0 = Math.min(y0, y1);
    const py1 = Math.max(y0, y1);
    const a = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [px0, py1]);
    const b = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [px1, py0]);
    if (!Array.isArray(a) || !Array.isArray(b)) return;
    const xMin = Math.min(Number(a[0]), Number(b[0]));
    const xMax = Math.max(Number(a[0]), Number(b[0]));
    const yMin = Math.min(Number(a[1]), Number(b[1]));
    const yMax = Math.max(Number(a[1]), Number(b[1]));
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return;
    openCurveZoomModal(chartId, { xMin, xMax, yMin, yMax });
  };

  host.addEventListener("mousedown", (e) => {
    if (!e.ctrlKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = host.getBoundingClientRect();
    drag = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, x1: e.clientX - rect.left, y1: e.clientY - rect.top };
    ensureOverlay();
    paintOverlay();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

/** 与 git 197247d 一致：每次 flush 全量 setOption + resize，避免增量 merge 丢数据 */
function flushCurveChartsNow() {
  if (state.activeView !== "curve") return;
  const echarts = getEchartsLib();
  const api = getCurveChartApi();
  if (!echarts || !api) return;
  const activeView = getActiveCurveView();
  if (!activeView) return;
  (activeView.charts || []).forEach((chart) => {
    (chart.codes || []).forEach((code) => ensureCurveBufferHasPoints(code));
    const entry = ensureCurveChartEntry(chart, echarts, api);
    if (!entry?.chart) return;
    const option = buildCurveOptionForChart(chart);
    if (option.legend && entry.legendSelected) {
      option.legend = { ...option.legend, selected: { ...entry.legendSelected } };
    }
    entry.chart.setOption(option, { notMerge: true, lazyUpdate: false });
    const w = entry.host?.clientWidth || 0;
    const h = entry.host?.clientHeight || 0;
    if (w > 1 && h > 1) entry.chart.resize();
  });
}

function scheduleCurveChartFlush() {
  if (state.activeView !== "curve") return;
  const delay = getCurveChartApi()?.CURVE_FLUSH_INTERVAL_MS || 50;
  if (curveChartFlushTimer) return;
  curveChartFlushTimer = setTimeout(() => {
    curveChartFlushTimer = null;
    flushCurveChartsNow();
  }, delay);
}

function startCurveChartLoop() {
  stopCurveChartLoop();
  const delay = Math.max(50, getCurveChartApi()?.CURVE_FLUSH_INTERVAL_MS || 50);
  curveChartFlushInterval = setInterval(() => {
    if (state.activeView !== "curve") {
      stopCurveChartLoop();
      return;
    }
    flushCurveChartsNow();
    if (curveZoomModalEl?.classList.contains("open")) flushCurveZoomModalChart();
  }, delay);
}

function stopCurveChartLoop() {
  if (curveChartFlushInterval) {
    clearInterval(curveChartFlushInterval);
    curveChartFlushInterval = null;
  }
}

function getCurveSeriesForCodes(codes) {
  return getCurveSeries(codes || []);
}

function syntheticPoints(seriesIndex) {
  return Array.from({ length: 80 }, (_, i) => {
    const t = (i + state.chartTick * 0.35) / 7;
    const wave = Math.sin(t + seriesIndex * 0.8) * 0.18 + Math.cos(t * 0.43 + seriesIndex) * 0.1;
    const bump = Math.exp(-Math.pow(i - 48 - seriesIndex * 3, 2) / 120) * 0.32;
    return 0.52 + wave + bump * (seriesIndex % 2 ? -0.7 : 1);
  });
}

function normalizePoints(points, minValue = null, maxValue = null) {
  if (!points.length) return [];
  if (points.length === 1) return Array.from({ length: 80 }, () => 0.5);
  const min = Number.isFinite(minValue) ? minValue : Math.min(...points);
  const max = Number.isFinite(maxValue) ? maxValue : Math.max(...points);
  const span = max - min || Math.max(Math.abs(max), 1);
  const normalized = points.map((value) => 0.18 + ((value - min) / span) * 0.64);
  if (normalized.length >= 80) return normalized.slice(-80);
  const padded = Array.from({ length: 80 - normalized.length }, () => normalized[0]);
  return [...padded, ...normalized];
}

function renderTelemetryTable() {
  const activeRows = getActiveTelemetryRows();
  const sourceRows = activeRows.length ? activeRows : (state.liveTelemetry.length ? state.liveTelemetry : parameters);
  const rows = sourceRows.filter((param) => {
    if (state.dataFilter === "告警") return param.status === "告警" || param.status === "关注";
    if (state.dataFilter === "收藏") return state.favorites.has(param.code);
    return true;
  });
  const sheetStat = getSheetStat(state.activeSheet);
  const selectedView = getActiveTableView();
  const customTableViews = state.tableViews.filter((view) => !view.builtin);
  const selectedCodesCount = state.selectedWaveCodes.size;

  return `
    <div class="view table-view">
      <section class="view-surface table-surface">
        <div class="view-header">
          <div class="view-title">遥测表格<small>Sheet 0-7 在左侧「遥测摘要」；主区通过表0-表7切换</small></div>
          <div class="header-actions">
            <button class="ghost-button" data-add-table>添加表格</button>
            <button class="ghost-button" data-refresh-defs>刷新定义</button>
          </div>
        </div>
        <div class="table-status-line">
          <span class="tag ${sheetStat.total > 0 ? "ok" : "warn"}">${sheetStat.total > 0 ? "正在刷新" : "等待 UDP"}</span>
          <span>端口 ${getRuleBySheet(state.activeSheet).port || "--"} · Sheet ${state.activeSheet}</span>
          <span>定义 ${getSheetDefinition(state.activeSheet).length || sheetStat.definitionCount || sourceRows.length} 项</span>
          <span>本 Sheet 包数 ${sheetStat.total || 0}</span>
          <span>最近更新 ${formatTimeText(sheetStat.lastTime)}</span>
          ${selectedView ? `<span>当前表格：${selectedView.name}</span>` : ""}
        </div>
        <div class="data-toolbar">
          <div class="search-history-wrap">
            <input class="search-box" id="paramSearch" value="${escapeAttr(state.tableSearch)}" placeholder="搜索参数、代号、分组、路序（跨 Sheet 勾选）" autocomplete="off" aria-expanded="false" aria-controls="paramSearchHistoryPanel" />
            <div class="search-history-panel" id="paramSearchHistoryPanel" role="listbox" aria-label="最近搜索（最多 8 条）"></div>
          </div>
          <div class="segmented" aria-label="参数筛选">
            ${["全部", "告警", "收藏"].map((filter) => `<button class="segment ${state.dataFilter === filter ? "active" : ""}" data-data-filter="${filter}">${filter}</button>`).join("")}
          </div>
          ${renderTabScrollerHtml(
            [
              ...state.tableViews
                .filter((view) => view.builtin)
                .map(
                  (view) =>
                    `<button type="button" class="segment ${state.activeTableViewId === view.id ? "active" : ""}" data-table-view="${view.id}">${view.name}</button>`,
                ),
              ...customTableViews.map(
                (view) =>
                  `<button type="button" class="segment ${state.activeTableViewId === view.id ? "active" : ""}" data-table-view="${view.id}">${view.name}</button>`,
              ),
            ].join(""),
            { extraClass: "table-tab-scroller", segmentClass: "table-view-tabs", ariaLabel: "表格切换" },
          )}
          ${selectedView && !selectedView.builtin ? `<input class="inline-name-input" data-rename-table="${selectedView.id}" value="${escapeAttr(selectedView.name)}" aria-label="修改表格名称" />` : ""}
          ${selectedView && !selectedView.builtin ? `<button type="button" class="ghost-button" data-remove-table-view="${selectedView.id}">删除表格</button>` : ""}
          <button class="ghost-button" data-toggle-wave-drawer>${state.waveDrawerOpen ? "收起波道" : "已选波道"} ${selectedCodesCount}</button>
        </div>
        <div class="data-grid">
          <aside class="favorite-rail wave-select-rail ${state.waveDrawerOpen ? "open" : "collapsed"}">
            <h3>已选波道</h3>
            <div class="favorite-list">${renderWaveRailListHtml()}</div>
          </aside>
          <section class="table-wrap">
            <h3 class="table-wrap-title">${
              selectedView
                ? `${escapeAttr(selectedView.name)} <small>${rows.length} 行</small>`
                : `表${state.activeSheet} <small>${rows.length} 行</small>`
            }</h3>
            <div class="table-scroll auto-hide-scrollbar" aria-label="遥测参数列表">
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
                        <td data-param-value>
                          ${renderParamValueCell(param)}
                        </td>
                        <td data-param-hex>${param.hex || param.raw}</td>
                        <td>${param.unit || ""}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderCurve() {
  const channelRows = buildCurveChannelGroups();
  const stagedCodes = getStagedCurveCodes();
  const stagedCodeSet = new Set(stagedCodes);
  const stagedChannels = getCurveSeriesForCodes(stagedCodes);
  const curveViews = getCurveViews();
  const plottedCodes = getAllCurveViewCodes();
  const activeCurveView = getActiveCurveView();
  const layoutOptions = Array.from({ length: 10 }, (_, index) => index + 1);
  const activeLayout = activeCurveView ? getCurveViewLayoutColumns(activeCurveView) : 1;
  return `
    <div class="view split-grid curve-view ${state.curveChannelPanelCollapsed ? "curve-channel-collapsed" : ""}">
      <section class="view-surface channel-picker">
        <div class="view-header compact-head">
          <div class="view-title">曲线通道<small>${activeCurveView ? `当前 Tab：${activeCurveView.name || "未命名"}` : "勾选波道后点「新建曲线页」绘制"}</small></div>
          <div class="header-actions">
            <button class="primary-button" data-add-curve title="根据所选波道在当前 Tab 绘制曲线">新建曲线页</button>
          </div>
        </div>
        <div class="selected-channel-list">
          <h3>待添加波道</h3>
          ${stagedChannels.length
            ? stagedChannels
                .map(
                  (item) => `
                    <div class="selected-channel">
                      <span style="background:${item.color}"></span>
                      <strong>${item.code}</strong>
                      <em>${item.latestText}</em>
                      <button class="send-mini" data-remove-channel="${item.code}">删除</button>
                    </div>
                  `,
                )
                .join("")
            : `<div class="empty-hint">还没有待添加波道。可以从遥测表格勾选后切到这里，也可以在下方通道列表直接勾选。</div>`}
        </div>
        <input class="search-box" id="channelSearch" value="${escapeAttr(state.curveSearch)}" placeholder="搜索通道、代号、Sheet" />
        <div class="channel-groups">
          ${channelRows
            .map(
              (group) => `
                <div class="channel-group">
                  <h3>${group.name}</h3>
                  ${group.items
                    .map(
                      (item) => `
                        <label class="check-row" data-channel-row="${item.code}">
                          <span>${item.name}</span>
                          <input type="checkbox" data-channel="${item.code}" ${stagedCodeSet.has(item.code) ? "checked" : ""} />
                        </label>
                      `,
                    )
                    .join("")}
                </div>
              `,
            )
            .join("")}
        </div>
      </section>

      <section class="trend-stack">
        <div class="curve-workbar">
          <div class="curve-page-toolbar">
            <div class="view-title curve-page-toolbar-title">曲线 Tab<small>${curveViews.length} 个 Tab · ${plottedCodes.length} 个通道 · Ctrl+拖框放大（弹窗实时）</small></div>
            <div class="curve-page-tabs-scroll">
              ${renderTabScrollerHtml(
                curveViews
                  .map(
                    (view) =>
                      `<button type="button" class="segment ${view.id === state.activeCurveViewId ? "active" : ""}" data-curve-view="${escapeAttr(view.id)}">${escapeAttr(view.name)}</button>`,
                  )
                  .join(""),
                { segmentClass: "curve-page-tabs", ariaLabel: "曲线 Tab 切换" },
              )}
            </div>
            ${
              activeCurveView
                ? `<input class="inline-name-input curve-page-rename" data-rename-curve="${escapeAttr(activeCurveView.id)}" value="${escapeAttr(activeCurveView.name)}" aria-label="修改 Tab 页面标题" />`
                : ""
            }
          </div>
          <div class="header-actions curve-workbar-actions">
            <button type="button" class="ghost-button" data-toggle-curve-channel-panel>${state.curveChannelPanelCollapsed ? "显示通道栏" : "隐藏通道栏"}</button>
            <button class="ghost-button" data-create-curve-view title="新建空白 Tab 页面，不添加波道">新建Tab页面</button>
            <button class="ghost-button" data-clear-curves>清空曲线</button>
            ${
              activeCurveView
                ? `<button type="button" class="send-mini" data-remove-curve-view="${escapeAttr(activeCurveView.id)}">删除本 Tab</button>`
                : ""
            }
            <label class="curve-layout-select">
              分列
              <select data-curve-layout-select ${activeCurveView ? "" : "disabled"} aria-label="当前 Tab 分列数（最多 10 列）">
                ${layoutOptions
                  .map((count) => `<option value="${count}" ${activeLayout === count ? "selected" : ""}>${count} 列</option>`)
                  .join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="curve-page-stage">
          ${
            activeCurveView
              ? renderActiveCurvePage(activeCurveView)
              : `<article class="view-surface chart-wrap empty-curve-panel"><div class="empty-hint">还没有 Tab 页面。点「新建Tab页面」建空白页，或勾选波道后点「新建曲线页」。</div></article>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderCommandCenter() {
  const categories = ["全部", ...new Set(commands.map((command) => command.category || "星上指令"))];
  const filtered = commands.filter((command) => {
    const keyword = state.commandFilter.trim().toLowerCase();
    const matchCategory = state.commandCategory === "全部" || command.category === state.commandCategory;
    const matchText =
      !keyword ||
      command.id.toLowerCase().includes(keyword) ||
      command.name.toLowerCase().includes(keyword) ||
      command.category.toLowerCase().includes(keyword) ||
      command.node.toLowerCase().includes(keyword);
    return matchCategory && matchText;
  });

  const selected = commands.find((c) => c.id === state.selectedCommandId) || null;
  return `
    <div class="view split-grid command-split">
      <section class="view-surface command-list-pane">
        <div class="view-header">
          <div class="view-title">指令控制<small>列表选指令 · 右侧查看详情与源码</small></div>
          <div class="header-actions">
            <button class="ghost-button" data-import-commands>导入指令表</button>
            <button class="primary-button" data-send-selected>发送选中</button>
          </div>
        </div>
        <div class="command-toolbar">
          <input class="search-box" id="commandSearch" value="${escapeAttr(state.commandFilter)}" placeholder="搜索 K2001、飞轮、节点、上注" />
          <div class="segmented">
            ${categories.map((category) => `<button class="segment ${state.commandCategory === category ? "active" : ""}" data-command-category="${category}">${category}</button>`).join("")}
          </div>
        </div>
        <div class="command-list" role="list">
          ${filtered.length
            ? filtered
                .map(
                  (command) => `
                <article class="command-list-card ${command.id === state.selectedCommandId ? "selected" : ""}" data-command-card="${escapeAttr(command.id)}" role="listitem">
                  <span class="command-list-code">${escapeAttr(command.id)}</span>
                  <span class="command-list-name" title="${escapeAttr(command.name)}">${escapeAttr(command.name)}</span>
                  <span class="command-list-category tag accent">${escapeAttr(command.category)}</span>
                  <button type="button" class="send-mini ${state.pendingCommandId === command.id ? "pending" : ""}" data-send="${escapeAttr(command.id)}">${state.pendingCommandId === command.id ? "确认" : "发送"}</button>
                </article>
              `,
                )
                .join("")
            : `<div class="empty-hint command-list-empty">没有匹配的指令，请调整搜索或分类筛选。</div>`}
        </div>
      </section>

      <section class="view-surface command-detail">
        <div class="view-header">
          <div class="view-title">指令详情<small>选中卡片可在此查看完整字段与源码</small></div>
        </div>
        <div class="command-detail-body">
          ${selected ? `
            <div class="detail-actions"><button class="primary-button" data-send="${selected.id}">立即发送</button></div>
            ${renderCommandResult(selected.id)}
            <h3 class="command-detail-heading"><span class="command-detail-code">${selected.id}</span><span class="command-detail-name">${selected.name}</span></h3>
            <div class="kv"><span>类别</span><strong>${selected.category}</strong></div>
            <div class="kv"><span>节点</span><strong>${selected.node} · ${selected.target}:${selected.port}</strong></div>
            <div class="kv"><span>类型</span><strong>${selected.type}</strong></div>
            <div class="command-detail-block"><strong>说明</strong><p class="command-detail-desc">${selected.desc || "-"}</p></div>
            <div class="command-detail-block"><strong>指令包（HEX）</strong><pre class="command-detail-hex">${selected.packet}</pre></div>
          ` : `<div class="empty-hint">请从左侧列表选择一条指令，查看详情与源码。</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderTabScrollerHtml(segmentsHtml, options = {}) {
  const extraClass = options.extraClass ? ` ${options.extraClass}` : "";
  const segmentClass = options.segmentClass ? ` ${options.segmentClass}` : "";
  const aria = options.ariaLabel ? ` aria-label="${escapeAttr(options.ariaLabel)}"` : "";
  return `
    <div class="tab-scroller${extraClass}" data-tab-scroller>
      <button type="button" class="tab-scroller-arrow" data-tab-scroll="prev" aria-label="向前">‹</button>
      <div class="tab-scroller-viewport">
        <div class="segmented${segmentClass}"${aria}>${segmentsHtml}</div>
      </div>
      <button type="button" class="tab-scroller-arrow" data-tab-scroll="next" aria-label="向后">›</button>
    </div>
  `;
}

function bindTabScrollers(root) {
  const scope = root && root.querySelectorAll ? root : document.getElementById("stage") || document;
  scope.querySelectorAll("[data-tab-scroller]").forEach((scroller) => {
    if (scroller.dataset.tabScrollerBound === "1") return;
    scroller.dataset.tabScrollerBound = "1";
    const viewport = scroller.querySelector(".tab-scroller-viewport");
    if (!viewport) return;
    const prevBtn = scroller.querySelector('[data-tab-scroll="prev"]');
    const nextBtn = scroller.querySelector('[data-tab-scroll="next"]');
    const step = () => Math.max(140, Math.floor(viewport.clientWidth * 0.65));

    const update = () => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      const overflow = maxScroll > 4;
      scroller.classList.toggle("tab-scroller-overflow", overflow);
      if (prevBtn) prevBtn.disabled = !overflow || viewport.scrollLeft <= 1;
      if (nextBtn) nextBtn.disabled = !overflow || viewport.scrollLeft >= maxScroll - 1;
    };

    prevBtn?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      viewport.scrollBy({ left: -step(), behavior: "smooth" });
    });
    nextBtn?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      viewport.scrollBy({ left: step(), behavior: "smooth" });
    });
    viewport.addEventListener("scroll", update, { passive: true });
    viewport.addEventListener(
      "wheel",
      (ev) => {
        if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
        ev.preventDefault();
        viewport.scrollLeft += ev.deltaY;
      },
      { passive: false },
    );
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => update());
      ro.observe(viewport);
      scroller._tabScrollerRo = ro;
    }
    requestAnimationFrame(update);
  });
}

function bindViewActions() {
  const stage = $("#stage");
  if (!stage) return;
  if (stage.dataset.uuspaceBound === "true") return;
  stage.dataset.uuspaceBound = "true";

  bindTableSearchInput();
  const liveFilters = {
    commandSearch: createLiveFilter("commandSearch", "article[data-command-card]", "commandFilter", 300),
    channelSearch: createLiveFilter("channelSearch", "[data-channel-row]", "curveSearch", 300),
  };

  stage.addEventListener("click", (ev) => {
    if (
      ev.target.closest &&
      (ev.target.closest("[data-wave-select]") ||
        ev.target.closest("[data-wave-cell]") ||
        ev.target.closest("[data-wave-search-row]"))
    ) {
      return; // let checkbox cell change handler manage selection, avoid re-render before change event
    }
    const btn = ev.target.closest && ev.target.closest("[data-table-view],[data-remove-table-view],[data-add-table],[data-add-curve],[data-refresh-defs],[data-create-curve-view],[data-clear-curves],[data-command-card],[data-send-selected],[data-send],[data-import-commands],[data-command-category],[data-view-shortcut],[data-rule],[data-data-filter],[data-param-row],[data-param-card],[data-remove-channel],[data-remove-curve-code],[data-remove-curve-chart],[data-remove-curve-view],[data-search-history],[data-fav],[data-toggle-wave-drawer],[data-toggle-curve-channel-panel],[data-toggle-connection-config],[data-rename-table],[data-rename-curve],[data-curve-view]");
    if (!btn) return;
    if (btn.dataset.searchHistory !== undefined) {
      applyTableSearchValue(btn.dataset.searchHistory, { commitHistory: true });
      return;
    }
    if (btn.dataset.viewShortcut) return switchView(btn.dataset.viewShortcut);
    if (btn.dataset.rule) {
      state.selectedRuleId = btn.dataset.rule;
      return renderView();
    }
    if (btn.dataset.dataFilter) {
      state.dataFilter = btn.dataset.dataFilter;
      return renderView();
    }
    if (btn.dataset.tableView !== undefined) {
      state.activeTableViewId = btn.dataset.tableView;
      const view = getActiveTableView();
      if (view) state.activeSheet = Number(view.sheet);
      if (view?.builtin) restoreWholeTableView();
      else {
        const rows = getActiveTelemetryRows();
        if (rows[0]) state.selectedParamCode = rows[0].code;
      }
      schedulePersistWorkspace();
      return renderView();
    }
    if (btn.dataset.removeTableView) {
      const removeId = btn.dataset.removeTableView;
      state.tableViews = state.tableViews.filter((view) => view.builtin || view.id !== removeId);
      state.activeTableViewId = builtinTableId(state.activeSheet);
      restoreWholeTableView();
      clearTableSearch();
      schedulePersistWorkspace();
      appendStatusEvent("已删除自定义表格");
      return renderView();
    }
    if (btn.dataset.addTable !== undefined) {
      const rows = getSelectedWaveRows();
      if (!rows.length) return appendStatusEvent("请先选择波道", "勾选表格左侧的波道后再添加表格");
      const customCount = state.tableViews.filter((view) => !view.builtin).length;
      const id = `table-${Date.now()}`;
      state.tableViews.push({
        id,
        name: `表格${customCount + 1}`,
        sheet: state.activeSheet,
        codes: rows.map((r) => r.code),
      });
      state.activeTableViewId = builtinTableId(state.activeSheet);
      clearTableSearch();
      restoreWholeTableView();
      schedulePersistWorkspace();
      appendStatusEvent(`已添加自定义表格`, `${rows.length} 个参数 · 已保存到 Tab，当前显示${getActiveTableView()?.name || "表"}`);
      return renderView();
    }
    if (btn.dataset.addCurve !== undefined) {
      if (state.activeView !== "curve") {
        state.pendingCurveCodes = getSelectedWaveRows().map((row) => row.code);
        if (!state.pendingCurveCodes.length) return appendStatusEvent("请先选择波道", "勾选表格左侧波道后再到曲线页点「新建曲线页」");
        state.selectedWaveCodes.clear();
        appendStatusEvent("波道已准备到曲线页", state.pendingCurveCodes.join(", "));
        return switchView("curve");
      }
      const codes = getStagedCurveCodes();
      if (!codes.length) return appendStatusEvent("请先选择波道", "在左侧勾选波道后再点「新建曲线页」");
      const result = addCurveChartFromSelection(codes);
      appendStatusEvent(
        result ? `已新建曲线画布「${result.chart.name}」` : "未绘制曲线",
        `${result?.tab?.name || ""} · ${codes.join(", ")}`,
      );
      clearCurveSelections();
      renderView();
      requestAnimationFrame(() => {
        mountCurveCharts();
        flushCurveChartsNow();
      });
      return;
    }
    if (btn.dataset.createCurveView !== undefined) {
      const view = createCurveTabPage();
      appendStatusEvent("已新建 Tab 页面", view.name);
      return renderView();
    }
    if (btn.dataset.clearCurves !== undefined) {
      disposeAllCurveCharts();
      state.curveViews = [];
      state.activeCurveViewId = "";
      clearCurveSelections();
      state.curveBuffers = {};
      schedulePersistWorkspace();
      appendStatusEvent("曲线通道已清空");
      return renderView();
    }
    if (btn.dataset.commandCard) {
      state.selectedCommandId = btn.dataset.commandCard;
      return renderView();
    }
    if (btn.dataset.paramRow || btn.dataset.paramCard) {
      selectTelemetryParam(btn.dataset.paramRow || btn.dataset.paramCard);
      return;
    }
    if (btn.dataset.removeChannel) {
      removeStagedCurveCode(btn.dataset.removeChannel);
      return renderView();
    }
    if (btn.dataset.removeCurveCode) {
      const viewId = btn.dataset.curveCodeView;
      const chartId = btn.dataset.curveChartId;
      const code = btn.dataset.removeCurveCode;
      if (!viewId || !chartId || !code) return;
      state.activeCurveViewId = viewId;
      removeCurveCode(viewId, chartId, code);
      schedulePersistWorkspace();
      appendStatusEvent("已移除曲线通道", code);
      return renderView();
    }
    if (btn.dataset.removeCurveChart) {
      const viewId = btn.dataset.curveCodeView;
      const chartId = btn.dataset.removeCurveChart;
      if (!viewId || !chartId) return;
      state.activeCurveViewId = viewId;
      removeCurveChart(viewId, chartId);
      schedulePersistWorkspace();
      appendStatusEvent("已删除曲线画布");
      return renderView();
    }
    if (btn.dataset.removeCurveView) {
      const removedId = btn.dataset.removeCurveView;
      disposeCurveChartsForView(removedId);
      state.curveViews = getCurveViews().filter((view) => view.id !== removedId);
      if (state.activeCurveViewId === removedId) {
        state.activeCurveViewId = state.curveViews[0] ? state.curveViews[0].id : "";
      }
      schedulePersistWorkspace();
      appendStatusEvent("已删除 Tab 页面");
      return renderView();
    }
    if (btn.dataset.curveView) {
      switchCurveView(btn.dataset.curveView);
      return;
    }
    if (btn.dataset.toggleCurveChannelPanel !== undefined) {
      state.curveChannelPanelCollapsed = !state.curveChannelPanelCollapsed;
      const root = document.querySelector(".view.curve-view");
      if (root) root.classList.toggle("curve-channel-collapsed", state.curveChannelPanelCollapsed);
      document.querySelectorAll("[data-toggle-curve-channel-panel]").forEach((el) => {
        el.textContent = state.curveChannelPanelCollapsed ? "显示通道栏" : "隐藏通道栏";
      });
      return;
    }
    if (btn.dataset.renameTable !== undefined) return;
    if (btn.dataset.renameCurve !== undefined) return;
    if (btn.dataset.fav) {
      ev.stopPropagation();
      const code = btn.dataset.fav;
      if (state.favorites.has(code)) state.favorites.delete(code);
      else state.favorites.add(code);
      return renderView();
    }
    if (btn.dataset.toggleWaveDrawer !== undefined) {
      state.waveDrawerOpen = !state.waveDrawerOpen;
      return renderView();
    }
    if (btn.dataset.toggleConnectionConfig !== undefined) {
      state.connectionConfigOpen = !state.connectionConfigOpen;
      return renderView();
    }
    if (btn.dataset.sendSelected !== undefined) {
      ev.stopPropagation();
      if (!state.selectedCommandId) {
        appendStatusEvent("请选择要发送的指令", "当前没有选中指令卡片");
        return;
      }
      requestCommandSend(state.selectedCommandId);
      return;
    }
    if (btn.dataset.send) {
      ev.stopPropagation();
      state.selectedCommandId = btn.dataset.send;
      requestCommandSend(btn.dataset.send);
      return;
    }
    if (btn.dataset.importCommands !== undefined) {
      if (window.UUSPACE_LOAD_COMMANDS) return window.UUSPACE_LOAD_COMMANDS(true);
      appendStatusEvent("指令导入脚本未加载", "请确认 realtime.js 已随 Docker 镜像发布");
      return;
    }
    if (btn.dataset.refreshDefs !== undefined) {
      return loadTelemetryDefinitions(true);
    }
    if (btn.dataset.commandCategory) {
      state.commandCategory = btn.dataset.commandCategory;
      return renderView();
    }
  });

  function requestCommandSend(commandId) {
    if (state.pendingCommandId !== commandId) {
      state.pendingCommandId = commandId;
      appendStatusEvent("请再次确认发送", commandId);
      renderView();
      return;
    }
    state.pendingCommandId = "";
    sendCommand(commandId);
  }

  async function sendCommand(commandId) {
    const command = commands.find((item) => item.id === commandId);
    if (!command) {
      appendStatusEvent("指令发送失败", `未找到 ${commandId}`);
      markCommandResult(commandId, false, "未找到");
      return;
    }
    state.selectedCommandId = commandId;
    renderView();
    const payload = {
      id: command.id,
      target: command.target,
      port: Number(command.port) || 0,
      data: String(command.packet || "").replace(/\s+/g, ""),
    };
    if (!payload.target || !payload.port || !payload.data) {
      appendStatusEvent("指令发送失败", `${command.id} 缺少目标地址、端口或报文内容`);
      markCommandResult(command.id, false, "参数缺失");
      return;
    }
    try {
      const response = await fetch("/api/command/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        appendStatusEvent("指令发送失败", body.error || response.statusText || "网络错误");
        markCommandResult(command.id, false, "发送失败");
        return;
      }
      appendStatusEvent("指令发送成功", `${command.id} -> ${command.target}:${command.port}`);
      markCommandResult(command.id, true, "已发送");
    } catch (error) {
      appendStatusEvent("指令发送失败", String(error));
      markCommandResult(command.id, false, "网络错误");
    }
  }

  function markCommandResult(commandId, ok, text) {
    state.commandResults = { ...state.commandResults, [commandId]: { ok, text } };
    renderView();
    setTimeout(() => {
      const current = state.commandResults[commandId];
      if (!current || current.text !== text) return;
      const next = { ...state.commandResults };
      delete next[commandId];
      state.commandResults = next;
      if (state.activeView === "command") renderView();
    }, 1500);
  }

  // delegated change/input handlers
  stage.addEventListener("compositionstart", (ev) => {
    if (ev.target?.id === "paramSearch") {
      state.isComposing = true;
      clearTimeout(state.searchDebounceTimers.paramSearch);
      return;
    }
    const filter = liveFilters[ev.target && ev.target.id];
    if (filter) {
      state.isComposing = true;
      filter.compositionStart();
    }
  });
  stage.addEventListener("compositionend", (ev) => {
    if (ev.target?.id === "paramSearch") {
      state.isComposing = false;
      scheduleTableSearchUpdate(ev.target);
      return;
    }
    const filter = liveFilters[ev.target && ev.target.id];
    if (filter) {
      state.isComposing = false;
      filter.compositionEnd(ev.target);
    }
  });

  stage.addEventListener("mousedown", (ev) => {
    const historyItem = ev.target.closest && ev.target.closest("[data-search-history]");
    if (historyItem) {
      ev.preventDefault();
      applyTableSearchValue(historyItem.dataset.searchHistory, { commitHistory: true });
      return;
    }
    const cell = ev.target.closest && ev.target.closest("[data-wave-cell]");
    if (!cell) return;
    const row = cell.closest("tr[data-param-row]");
    if (!row) return;
    const code = row.dataset.paramRow;
    if (!code) return;
    if (ev.shiftKey && state.lastWaveSelectCode) {
      ev.preventDefault();
      const order = getVisibleWaveCodesInOrder();
      const from = order.indexOf(state.lastWaveSelectCode);
      const to = order.indexOf(code);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (let i = start; i <= end; i += 1) state.selectedWaveCodes.add(order[i]);
        state.lastWaveSelectCode = code;
        updateWaveSelectionInPlace();
      }
      return;
    }
    if (!(ev.ctrlKey || ev.metaKey)) {
      state.lastWaveSelectCode = code;
    }
  });

  stage.addEventListener("focusin", (ev) => {
    if (ev.target?.id === "paramSearch") {
      ev.target.setAttribute("aria-expanded", "true");
      updateTableSearchHistoryPanel();
    }
  });

  stage.addEventListener("focusout", (ev) => {
    if (ev.target?.id !== "paramSearch") return;
    const panel = document.getElementById("paramSearchHistoryPanel");
    if (panel && ev.relatedTarget && panel.contains(ev.relatedTarget)) return;
    const value = ev.target.value;
    setTimeout(() => {
      if (document.activeElement?.id !== "paramSearch") {
        commitTableSearch(value);
        document.getElementById("paramSearch")?.setAttribute("aria-expanded", "false");
        updateTableSearchHistoryPanel();
      }
    }, 120);
  });

  stage.addEventListener("keydown", (ev) => {
    if (ev.target?.id === "paramSearch" && ev.key === "Enter") {
      ev.preventDefault();
      applyTableSearchValue(ev.target.value, { commitHistory: true });
    }
  });

  stage.addEventListener("change", (ev) => {
    const tgt = ev.target;
    if (tgt.matches && tgt.matches("[data-wave-select]")) {
      if (ev.shiftKey) return;
      const code = tgt.dataset.waveSelect;
      if (tgt.checked) state.selectedWaveCodes.add(code);
      else state.selectedWaveCodes.delete(code);
      state.lastWaveSelectCode = code;
      return updateWaveSelectionInPlace();
    }
    if (tgt.matches && tgt.matches("[data-curve-layout-select]")) {
      applyCurveLayoutColumns(Number(tgt.value));
      return;
    }
    if (tgt.matches && tgt.matches("[data-channel]")) {
      if (tgt.checked) state.channels.add(tgt.dataset.channel);
      else removeStagedCurveCode(tgt.dataset.channel);
      return renderView();
    }
  });

  stage.addEventListener("input", (ev) => {
    const tgt = ev.target;
    if (tgt && tgt.dataset && tgt.dataset.protocolTest !== undefined) {
      state.protocolTestHex = tgt.value;
      renderView();
      restoreInputFocusBySelector("[data-protocol-test]", state.protocolTestHex);
      return;
    }
    if (tgt && tgt.dataset && tgt.dataset.protocolHeader !== undefined) {
      state.protocolDraftRuleId = state.selectedRuleId;
      state.protocolDraftHeader = tgt.value;
      renderView();
      restoreInputFocusBySelector("[data-protocol-header]", state.protocolDraftHeader);
      return;
    }
    if (tgt && tgt.dataset && tgt.dataset.renameTable !== undefined) {
      const view = state.tableViews.find((item) => item.id === tgt.dataset.renameTable);
      if (view) {
        view.name = tgt.value.trim() || `表格${state.tableViews.indexOf(view) + 1}`;
        scheduleRenameRender(`table-${view.id}`, `[data-rename-table="${view.id}"]`, tgt.value);
        state.renameDebounceTimers[`table-persist-${view.id}`] = setTimeout(() => schedulePersistWorkspace(), 400);
      }
      return;
    }
    if (tgt && tgt.dataset && tgt.dataset.renameCurve !== undefined) {
      const view = getCurveViews().find((item) => item.id === tgt.dataset.renameCurve);
      if (view) {
        view.name = tgt.value.trim() || `Tab页面 ${getCurveViews().indexOf(view) + 1}`;
        clearTimeout(state.renameDebounceTimers[`curve-${view.id}`]);
        state.renameDebounceTimers[`curve-${view.id}`] = setTimeout(() => {
          updateCurveViewTabsInPlace();
          schedulePersistWorkspace();
        }, 300);
        updateCurveViewTabsInPlace();
      }
      return;
    }
    if (tgt?.id === "paramSearch") {
      if (!state.isComposing) scheduleTableSearchUpdate(tgt);
      return;
    }
    const filter = liveFilters[tgt && tgt.id];
    if (filter) filter.input(tgt);
  });
}

function bindGlobalActions() {
  $("#collapseSummary").addEventListener("click", () => {
    setDockCollapsed(!state.dockCollapsed);
  });
  const dockExpand = document.getElementById("dockExpandHandle");
  dockExpand?.addEventListener("click", () => {
    setDockCollapsed(false);
  });
  $("#ackAllBtn").addEventListener("click", () => appendStatusEvent("告警面板已确认"));
}

function eventRows(rows) {
  return rows
    .map(
      (event) => `
        <article class="event-row ${event.type}">
          <time>${event.time.slice(0, 5)}</time>
          <div class="event-icon ${event.type === "danger" ? "danger" : event.type === "warning" ? "warning" : ""}">${eventIcon(event.type)}</div>
          <p>${event.text}</p>
          <span class="tag ${event.type === "danger" ? "danger" : event.type === "warning" ? "warn" : event.type === "success" ? "ok" : ""}">${event.type === "success" ? "正常" : event.type === "warning" ? "关注" : event.type === "danger" ? "严重" : "信息"}</span>
        </article>
      `,
    )
    .join("");
}

function serviceRow(name, detail, status) {
  return `
    <article class="event-row">
      <time>${status.toUpperCase()}</time>
      <i class="dot ${status === "ok" ? "ok" : status === "warn" ? "warn" : "danger"}"></i>
      <p>${name}</p>
      <span class="tag ${status === "ok" ? "ok" : status === "warn" ? "warn" : "danger"}">${detail}</span>
    </article>
  `;
}

function linkCard(link) {
  return `
    <article class="link-card">
      <header>
        <div>
          <strong>${link.name}</strong>
          <span>${link.mode}</span>
        </div>
        <span class="tag ${link.status === "ok" ? "ok" : "warn"}">${link.status === "ok" ? "在线" : "待机"}</span>
      </header>
      <div class="link-metrics">
        ${metric("本地", link.local)}
        ${metric("远端", link.remote)}
        ${metric("速率", link.rate)}
        ${metric("丢包", link.loss)}
      </div>
    </article>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderUdpPortStats() {
  const stats = state.udpBridge.portStats && state.udpBridge.portStats.length
    ? state.udpBridge.portStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastPacket: null,
      }));

  return stats
    .map(
      (item) => {
        const stale = isPortStale(item);
        const rate = estimatePortRate(item.listenPort);
        return `
        <article class="port-pill ${item.total > 0 ? "active" : ""} ${stale ? "warn" : ""}">
          <strong>${item.listenPort}</strong>
          <span>Sheet ${item.sheetIndex}</span>
          <em>${item.total} 包</em>
          <em>${rate.toFixed(1)} 包/秒</em>
        </article>
      `;
      },
    )
    .join("");
}

function valueCards() {
  const seriesList = getCurveSeries();
  if (seriesList.length) {
    return seriesList
      .slice(0, 8)
      .map(
        (item) => `
          <article class="value-card" data-param-card="${item.code}">
            <span>${item.code}</span>
            <strong style="color:${item.color}">${item.latestText}</strong>
            <div class="mini-bar"><span style="width:72%; background:var(--teal)"></span></div>
          </article>
        `,
      )
      .join("");
  }
  return `<div class="empty-hint">还没有选择曲线通道。</div>`;
}

function drawTrendChart() {
  if (state.activeView !== "curve") {
    state.curveAnimationFrame = null;
    return;
  }
  if (state.curveAnimationFrame) {
    cancelAnimationFrame(state.curveAnimationFrame);
    state.curveAnimationFrame = null;
  }
  resizeTrendCanvas();
  const viewsById = new Map(getCurveViews().map((view) => [view.id, view]));
  document.querySelectorAll(".trend-canvas").forEach((canvas) => {
    const view = viewsById.get(canvas.dataset.curveCanvas);
    drawCurveCanvas(canvas, view);
  });
  state.chartTick += 1;
  if (state.activeView === "curve") {
    state.curveAnimationFrame = requestAnimationFrame(drawTrendChart);
  } else {
    state.curveAnimationFrame = null;
  }
}

function drawCurveCanvas(canvas, view) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const top = 40;
  const left = 52;
  const right = 28;
  const bottom = 38;
  const chartW = w - left - right;
  const chartH = h - top - bottom;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07090d";
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(37,46,66,.72)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const y = top + (chartH / 6) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 10; i += 1) {
    const x = left + (chartW / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, h - bottom);
    ctx.stroke();
  }

  ctx.fillStyle = "#76839b";
  ctx.font = "18px Microsoft YaHei, Segoe UI, sans-serif";
  ctx.fillText(view ? view.name : "实时遥测曲线", left, 24);
  ctx.font = "12px Consolas, monospace";
  ctx.fillText("T-60s", left, h - 12);
  ctx.fillText("NOW", w - right - 34, h - 12);

  const seriesList = view ? getCurveSeriesForCodes(view.codes) : [];
  if (!seriesList.length) {
    ctx.fillStyle = "#76839b";
    ctx.font = "20px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("未选择曲线通道", left + 24, top + 90);
    ctx.font = "13px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("请为这个曲线页面添加波道。", left + 24, top + 122);
    return;
  }

  const drawableSeries = seriesList.filter((item) => item.points && item.points.length);
  if (!drawableSeries.length) {
    ctx.fillStyle = "#76839b";
    ctx.font = "20px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("等待 UDP 数据刷新曲线", left + 24, top + 90);
    ctx.font = "13px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("已选通道会在收到遥测后显示真实数值。", left + 24, top + 122);
    return;
  }

  const allPoints = drawableSeries.flatMap((item) => item.points);
  const globalMin = Math.min(...allPoints);
  const globalMax = Math.max(...allPoints);
  ctx.fillStyle = "#76839b";
  ctx.font = "12px Consolas, monospace";
  ctx.fillText(`Y轴范围: ${formatValue(globalMin)} — ${formatValue(globalMax)}`, left + 6, top + 16);

  drawableSeries
    .forEach((item, seriesIndex) => {
      const points = normalizePoints(item.points, globalMin, globalMax);
      if (!points.length) {
        return;
      }
      const coords = points.map((value, i) => ({
        x: left + (chartW / (points.length - 1)) * i,
        y: top + chartH - clamp(value, 0.12, 0.88) * chartH,
      }));

      const gradient = ctx.createLinearGradient(0, top, 0, h - bottom);
      gradient.addColorStop(0, hexToRgba(item.color, 0.35));
      gradient.addColorStop(1, hexToRgba(item.color, 0));
      ctx.beginPath();
      coords.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.lineTo(coords[coords.length - 1].x, h - bottom);
      ctx.lineTo(coords[0].x, h - bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      coords.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const last = coords[coords.length - 1];
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fill();

      const label = `${item.code} ${item.latestText}`;
      ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
      const labelWidth = ctx.measureText(label).width;
      const labelX = Math.max(left + 8, Math.min(last.x + 8, w - right - labelWidth - 10));
      const labelY = Math.max(top + 16, last.y - 18);
      ctx.fillStyle = "rgba(7, 9, 13, 0.72)";
      roundRect(ctx, labelX - 6, labelY - 14, labelWidth + 12, 20, 5);
      ctx.fill();
      ctx.fillStyle = item.color;
      ctx.fillText(label, labelX, labelY);
    });

}

function appendStatusEvent(text, detail) {
  const time = new Date().toTimeString().slice(0, 8);
  statusEvents.unshift({ time, type: "success", text, detail: detail != null && detail !== "" ? detail : "本地 UI 状态事件" });
  renderTicker();
}

function appendUdpStatusEvent(packet) {
  if (state.activeView !== "status" && state.activeView !== "connection") {
    state.suppressedUdpEvents += 1;
    return;
  }
  const now = Date.now();
  if (now - state.lastUdpEventAt < 1000) {
    state.suppressedUdpEvents += 1;
    return;
  }
  const extra = state.suppressedUdpEvents ? `，合并 ${state.suppressedUdpEvents} 包` : "";
  state.lastUdpEventAt = now;
  state.suppressedUdpEvents = 0;
  appendStatusEvent(
    `端口 ${packet.listenPort} / Sheet ${packet.sheetIndex} 收到 UDP ${packet.length} byte${extra}`,
    `${packet.sourceIp}:${packet.sourcePort} · ${packet.hex}`,
  );
}

function filterRows(selector, keyword, visibleDisplay) {
  const k = keyword.trim().toLowerCase();
  document.querySelectorAll(selector).forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(k) ? visibleDisplay : "none";
  });
}

function getDefaultDisplayForRow(row) {
  if (row.tagName === "TR") return "";
  const display = window.getComputedStyle(row).display;
  return display && display !== "none" ? display : "";
}

function restoreInputFocus(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.focus();
  const position = String(value || input.value).length;
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(position, position);
  }
}

function restoreInputFocusBySelector(selector, value) {
  const input = document.querySelector(selector);
  if (!input) return;
  input.focus();
  const position = String(value || input.value).length;
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(position, position);
  }
}

function scheduleRenameRender(key, selector, value, delay = 500) {
  clearTimeout(state.renameDebounceTimers[key]);
  state.renameDebounceTimers[key] = setTimeout(() => {
    renderNavigation();
    renderView();
    restoreInputFocusBySelector(selector, value);
  }, delay);
}

function createLiveFilter(inputId, rowSelector, stateKey, renderDelay = 300) {
  let composing = false;
  const applyFilter = (value) => {
    const keyword = String(value || "").trim().toLowerCase();
    document.querySelectorAll(rowSelector).forEach((row) => {
      row.style.display = !keyword || row.textContent.toLowerCase().includes(keyword)
        ? getDefaultDisplayForRow(row)
        : "none";
    });
  };
  const scheduleRender = (input) => {
    clearTimeout(state.searchDebounceTimers[inputId]);
    const value = input.value;
    state.searchDebounceTimers[inputId] = setTimeout(() => {
      state[stateKey] = value;
      if (stateKey === "tableSearch") schedulePersistWorkspace();
      renderView();
      restoreInputFocus(inputId, value);
    }, renderDelay);
  };
  return {
    compositionStart() {
      composing = true;
      clearTimeout(state.searchDebounceTimers[inputId]);
    },
    compositionEnd(input) {
      composing = false;
      applyFilter(input.value);
      scheduleRender(input);
    },
    input(input) {
      if (composing || state.isComposing) return;
      applyFilter(input.value);
      if (inputId === "paramSearch") updateTableSearchHistoryPanel();
      scheduleRender(input);
    },
  };
}

function eventIcon(type) {
  if (type === "success") return "✓";
  if (type === "warning") return "!";
  if (type === "danger") return "×";
  return "i";
}

function kv(key, value) {
  return `<div class="kv"><span>${key}</span><strong>${value}</strong></div>`;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTimeText(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 19) || String(value);
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatValue(value) {
  return Math.abs(value) < 1 ? Number(value).toFixed(3) : Number(value).toFixed(1);
}

function formatTelemetryValue(param) {
  const code = param?.code;
  const live = code ? state.sheetLiveValues[String(state.activeSheet)]?.[code] : null;
  const definition = code
    ? getSheetDefinition(state.activeSheet).find((item) => item.code === code)
    : null;
  if (live) return getTelemetryDisplayValue(live, code).value;
  const raw = String(param.value ?? "").trim();
  if (!raw || raw === "—") return "—";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  return formatNumericTelemetry(parsed, getParamDecimals(code ?? param));
}

function restoreWholeTableView() {
  state.selectedWaveCodes.clear();
  const view = getActiveTableView();
  const sheet = view ? Number(view.sheet) : Number(state.activeSheet);
  if (view?.builtin) {
    state.activeSheet = sheet;
    state.activeTableViewId = builtinTableId(sheet);
  }
  const rows = getTelemetryRowsForSheet(sheet);
  if (rows[0]) state.selectedParamCode = rows[0].code;
  requestAnimationFrame(() => {
    const scroll = document.querySelector(".table-scroll");
    if (scroll) scroll.scrollTop = 0;
  });
}

function selectTelemetryParam(code) {
  if (!code || state.selectedParamCode === code) return;
  state.selectedParamCode = code;
  updateTelemetryRowSelectionInPlace();
}

function updateTelemetryRowSelectionInPlace() {
  document.querySelectorAll("tr[data-param-row]").forEach((row) => {
    row.classList.toggle("selected-row", row.dataset.paramRow === state.selectedParamCode);
  });
  document.querySelectorAll("[data-param-card]").forEach((card) => {
    card.classList.toggle("selected-card", card.dataset.paramCard === state.selectedParamCode);
  });
}

function getVisibleWaveCodesInOrder() {
  return [...document.querySelectorAll("tr[data-param-row]")]
    .filter((row) => row.style.display !== "none")
    .map((row) => row.dataset.paramRow)
    .filter(Boolean);
}

function updateWaveSelectionInPlace() {
  const count = state.selectedWaveCodes.size;
  document.querySelectorAll("[data-wave-select]").forEach((input) => {
    const code = input.dataset.waveSelect;
    if (!code) return;
    input.checked = state.selectedWaveCodes.has(code);
  });
  const drawerBtn = document.querySelector("[data-toggle-wave-drawer]");
  if (drawerBtn) {
    drawerBtn.textContent = `${state.waveDrawerOpen ? "收起波道" : "已选波道"} ${count}`;
  }
  updateWaveRailContent();
}

function updateCurveViewTabsInPlace() {
  document.querySelectorAll("button[data-curve-view]").forEach((btn) => {
    const view = getCurveViews().find((item) => item.id === btn.dataset.curveView);
    if (!view) return;
    btn.classList.toggle("active", state.activeCurveViewId === view.id);
    btn.textContent = view.name;
  });
  const renameInput = document.querySelector("[data-rename-curve]");
  const activeView = getActiveCurveView();
  if (renameInput && activeView && renameInput.dataset.renameCurve === activeView.id) {
    renameInput.value = activeView.name;
  }
}

function formatRawHex(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString(16).toUpperCase();
  }
  const text = String(value).trim();
  if (!text) return "—";
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric.toString(16).toUpperCase() : text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function startClock() {
  setInterval(() => {
    $("#utcClock").textContent = new Date().toISOString().slice(11, 19);
    state.frame += 25;
    $("#frameCounter").textContent = state.frame.toString();
  }, 1000);
}

function connectUdpBridge() {
  if (!window.location.protocol.startsWith("http")) {
    return;
  }

  fetch("/api/udp/status", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("UDP bridge unavailable");
      return response.json();
    })
    .then((snapshot) => {
      state.udpBridge.available = true;
      state.udpBridge.udpPort = snapshot.udpPort;
      state.udpBridge.udpPorts = snapshot.udpPorts || (snapshot.udpPort ? [snapshot.udpPort] : []);
      state.udpBridge.portStats = snapshot.portStats || [];
      state.udpBridge.parser = snapshot.parser || state.udpBridge.parser;
      state.udpBridge.total = snapshot.total || 0;
      state.udpBridge.lastPacket = snapshot.lastPacket || null;
      state.udpBridge.history = snapshot.history || [];
      state.sheetStats = snapshot.sheetStats || [];
      state.sheetLiveValues = snapshot.latestValues || {};
      syncPacketValues(snapshot.lastPacket);
      refreshUdpViews();
      loadTelemetryDefinitions(false);
      openUdpEventSource();
    })
    .catch(() => {
      state.udpBridge.available = false;
      refreshUdpViews();
    });
}

function openUdpEventSource() {
  if (!window.EventSource) return;

  const source = new EventSource("/api/udp/events");
  source.addEventListener("open", () => {
    state.udpBridge.connected = true;
    refreshUdpViews();
  });
  source.addEventListener("udp", (event) => {
    const packet = JSON.parse(event.data);
    state.udpBridge.available = true;
    state.udpBridge.connected = true;
    state.udpBridge.total = packet.total;
    state.udpBridge.lastPacket = packet;
    state.udpBridge.portStats = updatePortStats(state.udpBridge.portStats, packet);
    syncPacketValues(packet);
    if (packet.parsed && packet.parsed.values) {
      state.liveTelemetry = packet.parsed.values.map((item) => ({
        code: item.code,
        name: item.name,
        group: `Sheet ${packet.sheetIndex}`,
        frame: `S${packet.sheetIndex}`,
        value: item.valueText,
        unit: item.unit || "",
        status: item.status === "遥测异常" ? "告警" : item.status ? "正常" : "正常",
        raw: String(item.raw),
        waveNo: item.waveNo,
        formula: item.formula,
      }));
      if (!state.selectedParamCode && state.liveTelemetry[0]) {
        state.selectedParamCode = state.liveTelemetry[0].code;
      }
    }
    state.udpBridge.history = [packet, ...state.udpBridge.history.filter((item) => item.total !== packet.total)].slice(0, 12);
    appendUdpStatusEvent(packet);
    refreshUdpViews();
  });
  source.addEventListener("error", () => {
    state.udpBridge.connected = false;
    refreshUdpViews();
  });
}

function updatePortStats(portStats, packet) {
  const stats = portStats && portStats.length
    ? portStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastPacket: null,
      }));

  return stats.map((item) => {
    if (Number(item.listenPort) !== Number(packet.listenPort)) return item;
    return {
      ...item,
      total: Number(item.total || 0) + 1,
      lastPacket: packet,
      lastTime: packet.time,
      updatedCount: packet.updatedCount || (packet.parsed && packet.parsed.parsedCount) || 0,
    };
  });
}

function refreshUdpViews() {
  if (state.activeView === "curve") {
    scheduleCurveChartFlush();
    return;
  }
  if (!["connection", "status", "table"].includes(state.activeView)) {
    return;
  }
  scheduleUdpViewRefresh();
}

function scheduleUdpViewRefresh() {
  if (!["connection", "status", "table"].includes(state.activeView)) {
    return;
  }
  const now = Date.now();
  const elapsed = now - state.lastViewRefreshAt;
  if (elapsed >= 250) {
    state.lastViewRefreshAt = now;
    updateUdpViewInPlace();
    return;
  }
  if (state.refreshTimer) return;
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    state.lastViewRefreshAt = Date.now();
    if (["connection", "status", "table"].includes(state.activeView)) {
      updateUdpViewInPlace();
    }
  }, 250 - elapsed);
}

function updateUdpViewInPlace() {
  const now = Date.now();
  if (now - lastAlarmPanelUpdateAt >= 1000) {
    lastAlarmPanelUpdateAt = now;
    updateAlarmPanelInPlace();
  }
  if (state.activeView === "table") {
    updateSheetStatusLine();
    updateTableRowsInPlace();
    updateSheetTabsInPlace();
    return;
  }
  renderView();
}

function updateSheetStatusLine() {
  const line = $(".table-status-line");
  if (!line) return;
  const activeRows = getActiveTelemetryRows();
  const sourceRows = activeRows.length ? activeRows : (state.liveTelemetry.length ? state.liveTelemetry : parameters);
  const sheetStat = getSheetStat(state.activeSheet);
  const selectedView = state.tableViews.find((view) => view.id === state.activeTableViewId);
  line.innerHTML = `
    <span class="tag ${sheetStat.total > 0 ? "ok" : "warn"}">${sheetStat.total > 0 ? "正在刷新" : "等待 UDP"}</span>
    <span>端口 ${getRuleBySheet(state.activeSheet).port || "--"} · Sheet ${state.activeSheet}</span>
    <span>定义 ${getSheetDefinition(state.activeSheet).length || sheetStat.definitionCount || sourceRows.length} 项</span>
    <span>本 Sheet 包数 ${sheetStat.total || 0}</span>
    <span>最近更新 ${formatTimeText(sheetStat.lastTime)}</span>
    ${selectedView ? `<span>当前表格：${selectedView.name}</span>` : ""}
  `;
}

function updateSheetTabsInPlace() {
  document.querySelectorAll(".dock-sheet-tab[data-dock-sheet]").forEach((tab) => {
    const stat = getSheetStat(tab.dataset.dockSheet);
    const count = getSheetDefinition(tab.dataset.dockSheet).length || stat.definitionCount || 0;
    tab.classList.toggle("live", Number(stat.total || 0) > 0);
    tab.classList.toggle("active", Number(tab.dataset.dockSheet) === Number(state.dockHighlightSheet));
    const meta = tab.querySelector("em");
    if (meta) meta.textContent = `${count} 项 · ${stat.total || 0} 包`;
  });
}

function updateTableRowsInPlace() {
  const liveValues = state.sheetLiveValues[String(state.activeSheet)] || {};
  const definitions = getSheetDefinition(state.activeSheet);
  const defByCode = new Map(definitions.map((item) => [item.code, item]));
  document.querySelectorAll("tr[data-param-row]").forEach((row) => {
    const live = liveValues[row.dataset.paramRow];
    if (!live) return;
    const display = getTelemetryDisplayValue(live, row.dataset.paramRow);
    const valueText = display.value;
    const hexText = formatRawHex(live.raw ?? live.hex);
    updateValueCell(row.querySelector("[data-param-value]"), row.dataset.paramRow, valueText);
    updateCellText(row.querySelector("[data-param-hex]"), hexText);
  });
}

function updateValueCell(cell, code, value) {
  if (!cell) return;
  const text = String(value ?? "—");
  const textTarget = cell.querySelector("div") || cell;
  if (textTarget.textContent.trim() === text) return;
  textTarget.textContent = text;
  cell.classList.add("fresh-cell");
  clearTimeout(cell._freshTimer);
  cell._freshTimer = setTimeout(() => {
    cell.classList.remove("fresh-cell");
  }, 800);
}

function updateCellText(cell, value) {
  if (!cell) return;
  const text = String(value ?? "—");
  if (cell.textContent.trim() === text) return;
  const target = cell.querySelector("div") || cell;
  target.textContent = text;
  cell.classList.add("fresh-cell");
  clearTimeout(cell._freshTimer);
  cell._freshTimer = setTimeout(() => {
    cell.classList.remove("fresh-cell");
  }, 800);
}

function syncPacketValues(packet) {
  if (!packet || packet.sheetIndex == null) return;
  store.set("sheetStats", updateSheetStats(state.sheetStats, packet));
  if (!packet.parsed || !packet.parsed.values) return;
  const sheetKey = String(packet.sheetIndex);
  const nextValues = {};
  const packetMs = parsePacketTimeMs(packet.time);
  packet.parsed.values.forEach((item) => {
    nextValues[item.code] = { ...item, updatedAt: packet.time };
    pushCurvePoint(item.code, Number(item.value), packetMs);
  });
  store.set("sheetLiveValues", { ...state.sheetLiveValues, [sheetKey]: nextValues });
}

function updateSheetStats(sheetStats, packet) {
  const stats = sheetStats && sheetStats.length
    ? sheetStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastTime: null,
        updatedCount: 0,
        definitionCount: getSheetDefinition(rule.sheet).length,
      }));

  return stats.map((item) => {
    if (Number(item.sheetIndex) !== Number(packet.sheetIndex)) return item;
    return {
      ...item,
      listenPort: packet.listenPort,
      total: Number(item.total || 0) + 1,
      lastTime: packet.time,
      updatedCount: packet.updatedCount || (packet.parsed && packet.parsed.parsedCount) || 0,
      definitionCount: getSheetDefinition(packet.sheetIndex).length || item.definitionCount || 0,
    };
  });
}

function loadTelemetryDefinitions(showEvent) {
  if (!window.location.protocol.startsWith("http")) return Promise.resolve();
  return fetch("/api/telemetry/definitions", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("definitions unavailable");
      return response.json();
    })
    .then((payload) => {
      const next = {};
      (payload.sheets || []).forEach((sheet) => {
        next[String(sheet.sheetIndex)] = sheet.items || [];
      });
      state.sheetDefinitions = next;
      if (!getSheetDefinition(state.activeSheet).length && payload.sheets && payload.sheets[0]) {
        state.activeSheet = Number(payload.sheets[0].sheetIndex);
      }
      if (showEvent) appendStatusEvent("遥测大表定义已刷新", payload.meterFile || "");
      if (state.activeView === "table" || state.activeView === "curve" || state.activeView === "status") {
        renderView();
      }
    })
    .catch(() => {
      if (showEvent) appendStatusEvent("遥测定义接口不可用", "请确认 tools/udp_web_server.py 正在运行");
    });
}

/** 在浏览器控制台执行 UUSPACE_API.debugCurve() 查看曲线诊断信息 */
function debugCurveDiagnostics() {
  const view = getActiveCurveView();
  const chart = (view?.charts || [])[0];
  const code = chart?.codes?.[0];
  const host = chart?.id ? findCurveChartHost(chart.id) : null;
  const rect = host?.getBoundingClientRect?.();
  const entry = chart?.id ? curveChartInstances.get(chart.id) : null;
  const buffer = code ? state.curveBuffers[code] || [] : [];
  const report = {
    echartsLoaded: !!getEchartsLib(),
    curveApiLoaded: !!getCurveChartApi(),
    activeView: state.activeView,
    udpConnected: !!state.udpBridge?.connected,
    udpTotal: state.udpBridge?.total ?? 0,
    curveTab: view?.name ?? null,
    chartId: chart?.id ?? null,
    firstCode: code ?? null,
    hostFound: !!host,
    hostSize: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    chartInstance: !!entry?.chart,
    bufferPointCount: buffer.length,
    bufferLast3: buffer.slice(-3),
    plottedCodes: getAllCurveViewCodes(),
  };
  console.table(report);
  if (!report.echartsLoaded) console.warn("[曲线] ECharts 未加载，检查 index.html 中 echarts.min.js");
  if (!report.curveApiLoaded) console.warn("[曲线] UUSPACE_CURVE 未就绪，检查模块脚本是否报错");
  if (report.hostFound && report.hostSize?.h < 10) console.warn("[曲线] 图表容器高度为 0，多为布局问题");
  if (code && report.bufferPointCount === 0) console.warn("[曲线] 缓冲无数据，确认 UDP 在收包且代号匹配");
  return report;
}

window.UUSPACE_API = {
  state,
  parameters,
  commands,
  protocolRules,
  links,
  summaryItems,
  telemetryGroups,
  renderView,
  renderNavigation,
  renderDock,
  renderTicker,
  appendStatusEvent,
  connectUdpBridge,
  debugCurve: debugCurveDiagnostics,
  flushCurveChartsNow,
  mountCurveCharts,
};

function bootApp() {
  if (!getPersistApi() || !getUserSettingsApi() || typeof window.formatTelemetryNumber !== "function") {
    requestAnimationFrame(bootApp);
    return;
  }
  init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}
