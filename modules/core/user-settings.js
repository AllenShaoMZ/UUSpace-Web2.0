/** @typedef {{ tableViews: object[], activeTableViewId: string, tableSearch: string, tableSearchHistory: string[], activeSheet: number, curveViews: object[], activeCurveViewId: string, telemetry: { columns: object, decimals: object }, favorites: string[], waveDrawerOpen: boolean }} WorkspaceSnapshot */

/**
 * @param {{ load: (ns: string, fb?: unknown) => unknown }} persist
 * @returns {Partial<WorkspaceSnapshot>}
 */
export function loadWorkspaceSettings(persist) {
  if (!persist?.load) return {};
  const tableViews = persist.load("telemetry.tableViews", []);
  const curveViews = persist.load("curve.views", []);
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
    telemetry: {
      columns: persist.load("telemetry.columns", {}) || {},
      decimals: persist.load("telemetry.decimals", {}) || {},
    },
    favorites: persist.load("command.favorites", null),
    waveDrawerOpen: !!persist.load("telemetry.waveDrawerOpen", false),
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
  persist.save("curve.views", snapshot.curveViews || []);
  persist.save("curve.activeViewId", snapshot.activeCurveViewId || "");
  persist.save("telemetry.columns", snapshot.telemetry?.columns || {});
  persist.save("telemetry.decimals", snapshot.telemetry?.decimals || {});
  persist.save("command.favorites", snapshot.favorites || []);
  persist.save("telemetry.waveDrawerOpen", !!snapshot.waveDrawerOpen);
}

/**
 * @param {object} state app state
 * @returns {WorkspaceSnapshot}
 */
export function snapshotWorkspaceFromState(state) {
  return {
    tableViews: state.tableViews || [],
    activeTableViewId: state.activeTableViewId || "",
    tableSearch: state.tableSearch || "",
    tableSearchHistory: state.tableSearchHistory || [],
    activeSheet: state.activeSheet ?? 0,
    curveViews: state.curveViews || [],
    activeCurveViewId: state.activeCurveViewId || "",
    telemetry: {
      columns: state.telemetry?.columns || {},
      decimals: state.telemetry?.decimals || {},
    },
    favorites: [...(state.favorites || [])],
    waveDrawerOpen: !!state.waveDrawerOpen,
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
  if (saved.telemetry && typeof saved.telemetry === "object") {
    state.telemetry = {
      columns: saved.telemetry.columns || {},
      decimals: saved.telemetry.decimals || {},
    };
  }
  if (Array.isArray(saved.favorites) && saved.favorites.length) {
    state.favorites = new Set(saved.favorites);
  }
  if (typeof saved.waveDrawerOpen === "boolean") state.waveDrawerOpen = saved.waveDrawerOpen;
}
