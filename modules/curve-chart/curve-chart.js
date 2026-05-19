/** @typedef {{ time: number, value: number }} CurveSample */

export const CURVE_MAX_POINTS = 1800;
export const CURVE_WINDOW_MS = 60_000;
export const CURVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 实时刷新间隔（约 6.7Hz），减轻 setOption 与图例交互争用 */
export const CURVE_FLUSH_INTERVAL_MS = 150;
/** 与页面 panel 融合，不用独立纯黑底 */
export const CURVE_BG = "transparent";

/**
 * Trim timestamped curve buffer: cap point count and drop samples older than maxAge.
 * @param {CurveSample[]} buffer
 * @param {{ now?: number, maxPoints?: number, maxAgeMs?: number }} [options]
 * @returns {CurveSample[]}
 */
export function trimCurveBuffer(buffer, options = {}) {
  const now = Number(options.now) || Date.now();
  const maxPoints = options.maxPoints ?? CURVE_MAX_POINTS;
  const maxAgeMs = options.maxAgeMs ?? CURVE_MAX_AGE_MS;
  const minTime = now - maxAgeMs;
  let next = (buffer || []).filter((point) => point && Number.isFinite(point.time) && point.time >= minTime);
  if (next.length > maxPoints) next = next.slice(-maxPoints);
  return next;
}

/**
 * Append one sample and return trimmed buffer (immutable).
 * @param {CurveSample[]} buffer
 * @param {CurveSample} sample
 * @param {{ now?: number, maxPoints?: number, maxAgeMs?: number }} [options]
 */
export function appendCurveSample(buffer, sample, options = {}) {
  const now = Number(options.now) || sample.time || Date.now();
  return trimCurveBuffer([...(buffer || []), sample], { ...options, now });
}

/**
 * Axis tooltip: one row per series (dedupe stale merged series).
 * @param {unknown} params ECharts tooltip params (array for axis trigger)
 * @returns {string}
 */
/**
 * 时间轴范围：数据不足 60s 时跟随实际数据，避免左侧大块空白。
 * @param {Array<{ samples?: CurveSample[] }>} series
 * @param {number} now
 * @param {number} windowMs
 */
export function computeCurveTimeAxis(series, now, windowMs = CURVE_WINDOW_MS) {
  const times = (series || [])
    .flatMap((item) => (item.samples || []).map((s) => s.time))
    .filter((t) => Number.isFinite(t));
  const axisMax = now;
  if (!times.length) {
    return { min: now - windowMs, max: axisMax };
  }
  const dataMin = Math.min(...times);
  const span = Math.max(axisMax - dataMin, 1000);
  const displaySpan = Math.min(windowMs, Math.max(span * 1.08, 1000));
  return { min: Math.max(0, axisMax - displaySpan), max: axisMax };
}

/**
 * 图例/序列显示名：代号-名称（名称与代号相同时仅显示代号）
 * @param {string} code
 * @param {string} [name]
 */
export function formatCurveSeriesLabel(code, name) {
  const c = String(code ?? "").trim();
  const n = String(name ?? "").trim();
  if (!c) return n || "—";
  if (!n || n === c) return c;
  if (n.startsWith(`${c}-`)) return n;
  return `${c}-${n}`;
}

export function formatCurveAxisTooltip(params) {
  const list = Array.isArray(params) ? params : params ? [params] : [];
  if (!list.length) return "";
  const seen = new Set();
  const rows = [];
  for (const item of list) {
    const key = String(item.seriesId ?? item.seriesName ?? item.seriesIndex ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const raw = item.value;
    const value = Array.isArray(raw) ? raw[1] : raw;
    const text = value == null || value === "" ? "—" : value;
    rows.push(`${item.marker || ""}${item.seriesName}: ${text}`);
  }
  if (!rows.length) return "";
  const axisLabel = list[0]?.axisValueLabel ?? list[0]?.name ?? "";
  return axisLabel ? `${axisLabel}<br/>${rows.join("<br/>")}` : rows.join("<br/>");
}

/**
 * @param {{ viewName?: string, emptyTitle?: string, emptySubtitle?: string, series: Array<{ code: string, name?: string, paramName?: string, color: string, samples: CurveSample[] }>, now?: number, windowMs?: number, backgroundColor?: string }} params
 */
export function buildCurveOption(params) {
  const now = Number(params.now) || Date.now();
  const windowMs = params.windowMs ?? CURVE_WINDOW_MS;
  const backgroundColor = params.backgroundColor ?? CURVE_BG;
  const series = params.series || [];
  const values = series.flatMap((item) => (item.samples || []).map((s) => s.value)).filter(Number.isFinite);
  const yMin = values.length ? Math.min(...values) : 0;
  const yMax = values.length ? Math.max(...values) : 1;
  const yPad = Math.max((yMax - yMin) * 0.08, Math.abs(yMax) * 0.02, 0.5);
  const timeAxis = computeCurveTimeAxis(series, now, windowMs);

  return {
    backgroundColor,
    animation: false,
    grid: { left: 52, right: 28, top: 36, bottom: 38, containLabel: false },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: "rgba(23, 29, 41, 0.96)",
      borderColor: "rgba(37, 46, 66, 0.85)",
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: "#e8edf7", fontSize: 12 },
      extraCssText: "box-shadow: 0 8px 24px rgba(0,0,0,.35); border-radius: 6px;",
      axisPointer: {
        type: "line",
        animation: false,
        snap: true,
        lineStyle: { type: "dashed", color: "rgba(154, 168, 191, 0.75)", width: 1 },
        label: { show: false },
      },
      formatter: formatCurveAxisTooltip,
    },
    legend: series.length
      ? {
          type: "scroll",
          top: 8,
          right: 12,
          left: "auto",
          orient: "horizontal",
          selectedMode: true,
          animation: false,
          textStyle: { color: "#9aa8bf", fontSize: 11 },
          inactiveColor: "#4a5568",
          itemWidth: 12,
          itemHeight: 10,
          itemGap: 14,
        }
      : undefined,
    xAxis: {
      type: "time",
      min: timeAxis.min,
      max: timeAxis.max,
      axisLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b", fontFamily: "Consolas, monospace", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: yMin - yPad,
      max: yMax + yPad,
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b", fontFamily: "Consolas, monospace", fontSize: 11 },
    },
    series: series.map((item) => ({
      id: item.code,
      name: formatCurveSeriesLabel(item.code, item.name || item.paramName),
      type: "line",
      showSymbol: false,
      smooth: 0.22,
      lineStyle: { color: item.color, width: 2 },
      itemStyle: { color: item.color },
      areaStyle: {
        origin: "auto",
        opacity: 0.22,
        color: hexToRgba(item.color, 0.22),
      },
      data: (item.samples || []).map((sample) => [sample.time, sample.value]),
    })),
    graphic: series.length
      ? undefined
      : [
          {
            type: "text",
            left: 76,
            top: 90,
            style: {
              text: params.emptyTitle ?? "未选择曲线通道",
              fill: "#76839b",
              font: "20px Microsoft YaHei, Segoe UI, sans-serif",
            },
          },
          {
            type: "text",
            left: 76,
            top: 122,
            style: {
              text: params.emptySubtitle ?? "请为这个曲线页面添加波道。",
              fill: "#76839b",
              font: "13px Microsoft YaHei, Segoe UI, sans-serif",
            },
          },
        ],
    title: undefined,
  };
}

/**
 * @param {typeof import('echarts')} echarts
 * @param {(code: string) => string} colorForCode
 */
export function registerMissionCurveTheme(echarts, colorForCode) {
  if (!echarts || echarts.__uuspaceMissionCurveTheme) return;
  echarts.registerTheme("mission-curve", {
    color: [
      "#5B7CFA",
      "#3DD9B4",
      "#FFB020",
      "#00C2FF",
      "#9B8CFF",
      "#FF6B9A",
      "#2FD47A",
      "#FF5A65",
    ],
    backgroundColor: "transparent",
    textStyle: { color: "#76839b" },
    title: { textStyle: { color: "#76839b" } },
    line: { smooth: true },
    timeAxis: {
      axisLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      splitLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b" },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      splitLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b" },
    },
  });
  echarts.__uuspaceMissionCurveTheme = true;
  echarts.__uuspaceColorForCode = colorForCode;
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return `rgba(91,124,250,${alpha})`;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
