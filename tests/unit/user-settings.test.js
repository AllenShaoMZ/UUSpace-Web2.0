import { describe, expect, it } from "vitest";
import { createPersistenceService } from "../../modules/core/persistence-service.js";
import {
  applyWorkspaceSettings,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  snapshotWorkspaceFromState,
} from "../../modules/core/user-settings.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe("user-settings", () => {
  it("round-trips workspace snapshot through persistence", () => {
    const persist = createPersistenceService(createMemoryStorage());
    const state = {
      tableViews: [{ id: "t1", name: "表1", sheet: 0, codes: ["A"] }],
      activeTableViewId: "t1",
      tableSearch: "温度",
      tableSearchHistory: ["温度", "电压"],
      activeSheet: 2,
      curveViews: [{ id: "c1", name: "Tab1", charts: [], layoutColumns: 2 }],
      activeCurveViewId: "c1",
      curveWindowMs: 7_200_000,
      monitorWorkspace: {
        tabs: [
          {
            id: "mws-1",
            name: "综测1",
            layoutColumns: 2,
            tableViews: [{ id: "mt1", name: "表A", sheet: 0, codes: ["X"] }],
            activeTableViewId: "mt1",
            curveViews: [{ id: "mc1", name: "曲线区", charts: [{ id: "ch1", name: "页1", codes: ["X"] }], layoutColumns: 1 }],
            activeCurveViewId: "mc1",
            tableSearch: "test",
          },
        ],
        activeTabId: "mws-1",
        tableSearchHistory: ["abc"],
      },
      activeView: "monitor",
      dockCollapsed: true,
      dataFilter: "告警",
      telemetry: { columns: { visible: ["code"] }, decimals: { A: 2 } },
      favorites: new Set(["A", "B"]),
      waveDrawerOpen: true,
    };
    saveWorkspaceSettings(snapshotWorkspaceFromState(state), persist);
    const loaded = loadWorkspaceSettings(persist);
    expect(loaded.tableViews).toHaveLength(1);
    expect(loaded.activeTableViewId).toBe("t1");
    expect(loaded.tableSearch).toBe("温度");
    expect(loaded.tableSearchHistory).toEqual(["温度", "电压"]);
    expect(loaded.activeSheet).toBe(2);
    expect(loaded.curveViews[0].layoutColumns).toBe(2);
    expect(loaded.curveWindowMs).toBe(7_200_000);
    expect(loaded.activeView).toBe("monitor");
    expect(loaded.dockCollapsed).toBe(true);
    expect(loaded.dataFilter).toBe("告警");
    expect(loaded.monitorWorkspace.tabs).toHaveLength(1);
    const panels = loaded.monitorWorkspace.tabs[0].panels;
    const tablePanel = panels.find((p) => p.kind === "table");
    const curvePanel = panels.find((p) => p.kind === "curve");
    expect(tablePanel.codes).toEqual(["X"]);
    expect(curvePanel.charts[0].codes).toEqual(["X"]);
    const next = {
      tableViews: [],
      activeTableViewId: "",
      tableSearch: "",
      tableSearchHistory: [],
      activeSheet: 0,
      curveViews: [],
      activeCurveViewId: "",
      curveWindowMs: 60_000,
      monitorWorkspace: { tabs: [], activeTabId: "", tableSearchHistory: [] },
      telemetry: { columns: {}, decimals: {} },
      favorites: new Set(),
      waveDrawerOpen: false,
    };
    applyWorkspaceSettings(next, loaded);
    expect(next.tableSearch).toBe("温度");
    expect(next.tableSearchHistory).toEqual(["温度", "电压"]);
    expect(next.favorites.has("A")).toBe(true);
    expect(next.waveDrawerOpen).toBe(true);
    expect(next.curveWindowMs).toBe(7_200_000);
    expect(next.activeView).toBe("monitor");
    expect(next.monitorWorkspace.tabs).toHaveLength(1);
  });
});
