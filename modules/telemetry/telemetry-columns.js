/**
 * M1 遥测表格列模型（全局 state.telemetry.columns，所有 Sheet 共用）。
 * 数组顺序 = 表头从左到右的显示顺序（与改版前 Web 表一致的核心列在前）。
 * @typedef {{ key: string, title: string, defaultVisible: boolean, hideable: boolean, minWidth?: number }} TelemetryColumnDef
 * @typedef {{ visible: boolean, width?: number }} TelemetryColumnState
 */

/** 列宽拖动全局下限（详细设计 T-02） */
export const TELEMETRY_MIN_COLUMN_WIDTH = 48;

/** 单元格左右 padding（与 .param-table th,td 的 0 10px 一致） */
export const TELEMETRY_COLUMN_CELL_PADDING_X = 20;

/** 表头 resize handle 占用宽度 */
export const TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH = 8;

/** @type {TelemetryColumnDef[]} */
export const TELEMETRY_COLUMNS = [
  { key: "select", title: "选择", defaultVisible: true, hideable: false, minWidth: 54 },
  { key: "code", title: "参数代号", defaultVisible: true, hideable: false, minWidth: 120 },
  { key: "name", title: "参数名称", defaultVisible: true, hideable: false, minWidth: 140 },
  { key: "value", title: "当前值", defaultVisible: true, hideable: false, minWidth: 120 },
  { key: "hex", title: "十六进制", defaultVisible: true, hideable: true, minWidth: 120 },
  { key: "unit", title: "单位", defaultVisible: true, hideable: true, minWidth: 72 },
  { key: "index", title: "序号", defaultVisible: false, hideable: true, minWidth: 56 },
  { key: "formula", title: "公式", defaultVisible: false, hideable: true, minWidth: 160 },
  { key: "status", title: "状态", defaultVisible: false, hideable: true, minWidth: 72 },
  { key: "binary", title: "二进制", defaultVisible: false, hideable: true, minWidth: 160 },
  { key: "wave", title: "路序", defaultVisible: false, hideable: true, minWidth: 72 },
];

const columnByKey = new Map(TELEMETRY_COLUMNS.map((col) => [col.key, col]));

/** @returns {Record<string, TelemetryColumnState>} */
export function createDefaultTelemetryColumns() {
  /** @type {Record<string, TelemetryColumnState>} */
  const columns = {};
  TELEMETRY_COLUMNS.forEach((col) => {
    columns[col.key] = { visible: col.defaultVisible };
  });
  return columns;
}

/**
 * @param {TelemetryColumnDef} col
 */
export function getTelemetryColumnMinWidth(col) {
  return Math.max(TELEMETRY_MIN_COLUMN_WIDTH, col.minWidth || TELEMETRY_MIN_COLUMN_WIDTH);
}

/**
 * @param {number} width
 * @param {TelemetryColumnDef} col
 */
export function clampTelemetryColumnWidth(width, col) {
  const min = getTelemetryColumnMinWidth(col);
  if (!Number.isFinite(width)) return min;
  return Math.max(min, Math.round(width));
}

/**
 * 由列内容最大 scrollWidth（px）推算自动列宽。
 * @param {number} contentWidthPx thead/tbody 单元格内容最大宽度
 * @param {TelemetryColumnDef} col
 */
export function computeTelemetryColumnAutoWidth(contentWidthPx, col) {
  if (!Number.isFinite(contentWidthPx) || contentWidthPx <= 0) {
    return getTelemetryColumnMinWidth(col);
  }
  const total =
    contentWidthPx + TELEMETRY_COLUMN_CELL_PADDING_X + TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH;
  return clampTelemetryColumnWidth(total, col);
}

/**
 * @param {TelemetryColumnDef} col
 * @param {Record<string, TelemetryColumnState>} columnsState
 */
export function resolveTelemetryColumnWidth(col, columnsState) {
  const entry = columnsState?.[col.key];
  const saved = entry?.width;
  const fallback = col.minWidth || TELEMETRY_MIN_COLUMN_WIDTH;
  if (typeof saved === "number" && saved > 0) return clampTelemetryColumnWidth(saved, col);
  return fallback;
}

/**
 * 合并持久化列配置：保留用户显隐与列宽，补齐新列默认；不可隐藏列强制 visible。
 * @param {unknown} saved
 * @param {Record<string, TelemetryColumnState>} [base]
 */
export function mergeTelemetryColumns(saved, base = createDefaultTelemetryColumns()) {
  const merged = { ...base };
  TELEMETRY_COLUMNS.forEach((col) => {
    const entry = saved && typeof saved === "object" && !Array.isArray(saved) ? saved[col.key] : null;
    const visible =
      entry && typeof entry.visible === "boolean" ? entry.visible : merged[col.key]?.visible ?? col.defaultVisible;
    /** @type {TelemetryColumnState} */
    const next = { visible: col.hideable ? visible : true };
    const savedWidth = entry?.width;
    if (typeof savedWidth === "number" && savedWidth > 0) {
      next.width = clampTelemetryColumnWidth(savedWidth, col);
    } else if (typeof merged[col.key]?.width === "number" && merged[col.key].width > 0) {
      next.width = clampTelemetryColumnWidth(merged[col.key].width, col);
    }
    merged[col.key] = next;
  });
  return merged;
}

/**
 * @param {Record<string, { visible: boolean }>} columnsState
 * @returns {TelemetryColumnDef[]}
 */
export function getVisibleTelemetryColumns(columnsState) {
  return TELEMETRY_COLUMNS.filter((col) => isTelemetryColumnVisible(col.key, columnsState));
}

/**
 * @param {string} key
 * @param {Record<string, { visible: boolean }>} columnsState
 */
export function isTelemetryColumnVisible(key, columnsState) {
  const col = columnByKey.get(key);
  if (!col) return false;
  if (!col.hideable) return true;
  return columnsState?.[key]?.visible ?? col.defaultVisible;
}
