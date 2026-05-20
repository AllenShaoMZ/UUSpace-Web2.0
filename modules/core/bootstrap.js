/**
 * 轻量启动：先暴露持久化/设置等，让 app.js 尽快渲染；曲线/综测等大模块异步加载。
 */
import { APP_VERSION } from "./app-version.js";
import { formatTelemetryNumber } from "./format-telemetry-number.js";
import { createPersistenceService } from "./persistence-service.js";
import {
  applyWorkspaceSettings,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  snapshotWorkspaceFromState,
} from "./user-settings.js";
import {
  TABLE_SEARCH_HISTORY_MAX,
  filterSearchHistory,
  normalizeSearchHistory,
  pushSearchHistory,
} from "./search-history.js";

window.formatTelemetryNumber = formatTelemetryNumber;
window.UUSPACE_PERSIST = createPersistenceService();
window.UUSPACE_USER_SETTINGS = {
  loadWorkspaceSettings,
  applyWorkspaceSettings,
  snapshotWorkspaceFromState,
  saveWorkspaceSettings,
};
window.UUSPACE_APP_VERSION = APP_VERSION;
window.UUSPACE_SEARCH_HISTORY = {
  TABLE_SEARCH_HISTORY_MAX,
  filterSearchHistory,
  normalizeSearchHistory,
  pushSearchHistory,
};

const verEl = document.getElementById("appVersion");
if (verEl) verEl.textContent = `v${APP_VERSION}`;

window.UUSPACE_BOOTSTRAP_READY = true;
window.dispatchEvent(new Event("uuspace:bootstrap"));

Promise.all([
  import("../curve-chart/curve-chart.js"),
  import("../telemetry/telemetry-columns.js"),
  import("../monitor/monitor-workspace.js"),
])
  .then(([curveMod, telemMod, monitorMod]) => {
    window.UUSPACE_CURVE = {
      CURVE_FLUSH_INTERVAL_MS: curveMod.CURVE_FLUSH_INTERVAL_MS,
      CURVE_MAX_AGE_MS: curveMod.CURVE_MAX_AGE_MS,
      CURVE_MAX_POINTS: curveMod.CURVE_MAX_POINTS,
      CURVE_WINDOW_MS: curveMod.CURVE_WINDOW_MS,
      CURVE_WINDOW_OPTIONS: curveMod.CURVE_WINDOW_OPTIONS,
      appendCurveSample: curveMod.appendCurveSample,
      appendCurveSampleCoalesced: curveMod.appendCurveSampleCoalesced,
      buildCurveOption: curveMod.buildCurveOption,
      decimateCurveBuffer: curveMod.decimateCurveBuffer,
      formatCurveSeriesLabel: curveMod.formatCurveSeriesLabel,
      normalizeCurveWindowMs: curveMod.normalizeCurveWindowMs,
      registerMissionCurveTheme: curveMod.registerMissionCurveTheme,
      resolveCurveMaxPoints: curveMod.resolveCurveMaxPoints,
      trimCurveBuffer: curveMod.trimCurveBuffer,
    };
    window.UUSPACE_TELEMETRY_COLUMNS = {
      TELEMETRY_COLUMNS: telemMod.TELEMETRY_COLUMNS,
      TELEMETRY_MIN_COLUMN_WIDTH: telemMod.TELEMETRY_MIN_COLUMN_WIDTH,
      createDefaultTelemetryColumns: telemMod.createDefaultTelemetryColumns,
      mergeTelemetryColumns: telemMod.mergeTelemetryColumns,
      getVisibleTelemetryColumns: telemMod.getVisibleTelemetryColumns,
      isTelemetryColumnVisible: telemMod.isTelemetryColumnVisible,
      resolveTelemetryColumnWidth: telemMod.resolveTelemetryColumnWidth,
      clampTelemetryColumnWidth: telemMod.clampTelemetryColumnWidth,
      getTelemetryColumnMinWidth: telemMod.getTelemetryColumnMinWidth,
      computeTelemetryColumnAutoWidth: telemMod.computeTelemetryColumnAutoWidth,
      TELEMETRY_COLUMN_CELL_PADDING_X: telemMod.TELEMETRY_COLUMN_CELL_PADDING_X,
      TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH: telemMod.TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH,
    };
    window.__createMonitorWorkspaceApi = monitorMod.createMonitorWorkspaceApi;
    window.UUSPACE_MODULES_READY = true;
    window.dispatchEvent(new Event("uuspace:modules-ready"));
  })
  .catch((err) => {
    console.error("[UUSPACE] 扩展模块加载失败", err);
    window.UUSPACE_MODULES_READY = false;
  });
