import { normalizeMonitorWorkspaceSnapshot } from "../monitor/monitor-workspace.js";

/** @typedef {{ id: string, name: string, layoutColumns: number, tableViews: object[], activeTableViewId: string, curveViews: object[], activeCurveViewId: string, tableSearch: string }} MonitorWorkspaceTabSnapshot */
/** @typedef {{ tabs: MonitorWorkspaceTabSnapshot[], activeTabId: string, tableSearchHistory: string[] }} MonitorWorkspaceSnapshot */

/** @typedef {{ tableViews: object[], activeTableViewId: string, tableSearch: string, tableSearchHistory: string[], activeSheet: number, curveViews: object[], activeCurveViewId: string, curveWindowMs: number, monitorWorkspace: MonitorWorkspaceSnapshot, telemetry: { columns: object, decimals: object }, favorites: string[], waveDrawerOpen: boolean, activeView: string, dockCollapsed: boolean, curveChannelPanelCollapsed: boolean, dataFilter: string, dockHighlightSheet: number, selectedParamCode: string, commandCategory: string, commandFilter: string, selectedCommandId: string, connectionConfigOpen: boolean }} WorkspaceSnapshot */

const VALID_VIEWS = new Set([
  "status",
  "protocol",
  "monitor",
  "table",
  "curve",
  "command",
  "connection",
]);

function cloneJson(value, fallback = null) {
  if (value == null) return cloneJson(fallback, null);
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
}

/**
 * @param {{ load: (ns: string, fb?: unknown) => unknown }} persist
 * @returns {Partial<WorkspaceSnapshot>}
 */
export function loadWorkspaceSettings(persist) {
  if (!persist?.load) return {};
  const tableViews = persist.load("telemetry.tableViews", []);
  const curveViews = persist.load("curve.views", []);
  const favorites = persist.load("command.favorites", null);
  return {
    tableViews: Array.isArray(tableViews) ? tableViews : [],
    activeTableViewId: String(persist.load("telemetry.activeTableViewId", "") || ""),
    tableSearch: String(persist.load("telemetry.tableSearch", "") || ""),
    tableSearchHistory: (() => {
      const raw = persist.load("telemetry.tableSearchHistory", []);
      return Array.isArray(raw) ? raw : [];
    })(),
    activeSheet: Number(persist.load("telemetry.activeSheet", 0)) || 0,
    curveViews: Array.isArray(curveViews) ? curveViews : [],
    activeCurveViewId: String(persist.load("curve.activeViewId", "") || ""),
    curveWindowMs: Number(persist.load("curve.windowMs", 0)) || 0,
    monitorWorkspace: persist.load("monitor.workspace", null) || null,
    telemetry: {
      columns: persist.load("telemetry.columns", {}) || {},
      decimals: persist.load("telemetry.decimals", {}) || {},
    },
    favorites: Array.isArray(favorites) ? favorites : null,
    waveDrawerOpen: !!persist.load("telemetry.waveDrawerOpen", false),
    activeView: String(persist.load("ui.activeView", "") || ""),
    dockCollapsed: !!persist.load("ui.dockCollapsed", false),
    curveChannelPanelCollapsed: !!persist.load("ui.curveChannelPanelCollapsed", false),
    dataFilter: String(persist.load("ui.dataFilter", "") || ""),
    dockHighlightSheet: Number(persist.load("ui.dockHighlightSheet", 0)) || 0,
    selectedParamCode: String(persist.load("telemetry.selectedParamCode", "") || ""),
    commandCategory: String(persist.load("command.category", "") || ""),
    commandFilter: String(persist.load("command.filter", "") || ""),
    selectedCommandId: String(persist.load("command.selectedCommandId", "") || ""),
    connectionConfigOpen: !!persist.load("ui.connectionConfigOpen", false),
  };
}

/**
 * @param {WorkspaceSnapshot} snapshot
 * @param {{ save: (ns: string, data: unknown) => void, debounceSave: (ns: string, data: unknown | (() => unknown), delay?: number) => void }} persist
 */
export function saveWorkspaceSettings(snapshot, persist) {
  if (!persist?.save) return;
  persist.save("telemetry.tableViews", snapshot.tableViews || []);
  persist.save("telemetry.activeTableViewId", snapshot.activeTableViewId || "");
  persist.save("telemetry.tableSearch", snapshot.tableSearch || "");
  persist.save("telemetry.tableSearchHistory", snapshot.tableSearchHistory || []);
  persist.save("telemetry.activeSheet", snapshot.activeSheet ?? 0);
  persist.save("telemetry.selectedParamCode", snapshot.selectedParamCode || "");
  persist.save("curve.views", snapshot.curveViews || []);
  persist.save("curve.activeViewId", snapshot.activeCurveViewId || "");
  persist.save("curve.windowMs", snapshot.curveWindowMs ?? 0);
  persist.save("monitor.workspace", snapshot.monitorWorkspace || { tabs: [], activeTabId: "", tableSearchHistory: [] });
  persist.save("telemetry.columns", snapshot.telemetry?.columns || {});
  persist.save("telemetry.decimals", snapshot.telemetry?.decimals || {});
  persist.save("command.favorites", snapshot.favorites || []);
  persist.save("telemetry.waveDrawerOpen", !!snapshot.waveDrawerOpen);
  persist.save("ui.activeView", snapshot.activeView || "status");
  persist.save("ui.dockCollapsed", !!snapshot.dockCollapsed);
  persist.save("ui.curveChannelPanelCollapsed", !!snapshot.curveChannelPanelCollapsed);
  persist.save("ui.dataFilter", snapshot.dataFilter || "全部");
  persist.save("ui.dockHighlightSheet", snapshot.dockHighlightSheet ?? 0);
  persist.save("command.category", snapshot.commandCategory || "全部");
  persist.save("command.filter", snapshot.commandFilter || "");
  persist.save("command.selectedCommandId", snapshot.selectedCommandId || "");
  persist.save("ui.connectionConfigOpen", !!snapshot.connectionConfigOpen);
}

/**
 * @param {object} state app state
 * @returns {WorkspaceSnapshot}
 */
export function snapshotWorkspaceFromState(state) {
  return {
    tableViews: cloneJson(state.tableViews, []),
    activeTableViewId: state.activeTableViewId || "",
    tableSearch: state.tableSearch || "",
    tableSearchHistory: cloneJson(state.tableSearchHistory, []),
    activeSheet: state.activeSheet ?? 0,
    curveViews: cloneJson(state.curveViews, []),
    activeCurveViewId: state.activeCurveViewId || "",
    curveWindowMs: state.curveWindowMs ?? 0,
    monitorWorkspace: normalizeMonitorWorkspaceSnapshot(cloneJson(state.monitorWorkspace, { tabs: [], activeTabId: "", tableSearchHistory: [] })),
    telemetry: {
      columns: cloneJson(state.telemetry?.columns, {}),
      decimals: cloneJson(state.telemetry?.decimals, {}),
    },
    favorites: [...(state.favorites || [])],
    waveDrawerOpen: !!state.waveDrawerOpen,
    activeView: state.activeView || "status",
    dockCollapsed: !!state.dockCollapsed,
    curveChannelPanelCollapsed: !!state.curveChannelPanelCollapsed,
    dataFilter: state.dataFilter || "全部",
    dockHighlightSheet: state.dockHighlightSheet ?? 0,
    selectedParamCode: state.selectedParamCode || "",
    commandCategory: state.commandCategory || "全部",
    commandFilter: state.commandFilter || "",
    selectedCommandId: state.selectedCommandId || "",
    connectionConfigOpen: !!state.connectionConfigOpen,
  };
}

/**
 * @param {object} state
 * @param {Partial<WorkspaceSnapshot>} saved
 */
export function applyWorkspaceSettings(state, saved) {
  if (!saved || typeof saved !== "object") return;
  if (Array.isArray(saved.tableViews)) state.tableViews = saved.tableViews;
  if (typeof saved.activeTableViewId === "string") state.activeTableViewId = saved.activeTableViewId;
  if (typeof saved.tableSearch === "string") state.tableSearch = saved.tableSearch;
  if (Array.isArray(saved.tableSearchHistory)) {
    state.tableSearchHistory = saved.tableSearchHistory
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (Number.isFinite(saved.activeSheet)) state.activeSheet = saved.activeSheet;
  if (Array.isArray(saved.curveViews)) state.curveViews = saved.curveViews;
  if (typeof saved.activeCurveViewId === "string") state.activeCurveViewId = saved.activeCurveViewId;
  if (Number.isFinite(saved.curveWindowMs) && saved.curveWindowMs > 0) state.curveWindowMs = saved.curveWindowMs;
  if (saved.monitorWorkspace && typeof saved.monitorWorkspace === "object") {
    state.monitorWorkspace = normalizeMonitorWorkspaceSnapshot(cloneJson(saved.monitorWorkspace));
  }
  if (saved.telemetry && typeof saved.telemetry === "object") {
    state.telemetry = {
      columns: saved.telemetry.columns || {},
      decimals: saved.telemetry.decimals || {},
    };
  }
  if (Array.isArray(saved.favorites)) {
    state.favorites = new Set(saved.favorites.filter(Boolean));
  }
  if (typeof saved.waveDrawerOpen === "boolean") state.waveDrawerOpen = saved.waveDrawerOpen;
  if (typeof saved.activeView === "string" && VALID_VIEWS.has(saved.activeView)) {
    state.activeView = saved.activeView;
  }
  if (typeof saved.dockCollapsed === "boolean") state.dockCollapsed = saved.dockCollapsed;
  if (typeof saved.curveChannelPanelCollapsed === "boolean") {
    state.curveChannelPanelCollapsed = saved.curveChannelPanelCollapsed;
  }
  if (typeof saved.dataFilter === "string" && saved.dataFilter) state.dataFilter = saved.dataFilter;
  if (Number.isFinite(saved.dockHighlightSheet)) state.dockHighlightSheet = saved.dockHighlightSheet;
  if (typeof saved.selectedParamCode === "string" && saved.selectedParamCode) {
    state.selectedParamCode = saved.selectedParamCode;
  }
  if (typeof saved.commandCategory === "string" && saved.commandCategory) {
    state.commandCategory = saved.commandCategory;
  }
  if (typeof saved.commandFilter === "string") state.commandFilter = saved.commandFilter;
  if (typeof saved.selectedCommandId === "string" && saved.selectedCommandId) {
    state.selectedCommandId = saved.selectedCommandId;
  }
  if (typeof saved.connectionConfigOpen === "boolean") {
    state.connectionConfigOpen = saved.connectionConfigOpen;
  }
}
