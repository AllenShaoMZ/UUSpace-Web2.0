/** @typedef {{ time: number, value: number }} CurveSample */

export const CURVE_MAX_POINTS = 1800;
export const CURVE_WINDOW_MS = 60_000;
export const CURVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 实时刷新间隔（约 20Hz），与 UDP 入站合并后仍尽量逐点可见 */
export const CURVE_FLUSH_INTERVAL_MS = 50;
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
 * 追加采样点；与桌面 SciChart 一致：同一协议时间戳只保留最后一个 Y。
 * 若时间回退则 +1ms 保证单调，避免 ECharts 时间轴乱序。
 * @param {CurveSample[]} buffer
 * @param {CurveSample} sample
 * @param {{ now?: number, maxPoints?: number, maxAgeMs?: number }} [options]
 */
export function appendCurveSampleCoalesced(buffer, sample, options = {}) {
  const buf = buffer || [];
  const time = Number(sample?.time);
  const value = Number(sample?.value);
  if (!Number.isFinite(time) || !Number.isFinite(value)) return trimCurveBuffer(buf, options);
  const last = buf.length ? buf[buf.length - 1] : null;
  if (last && last.time === time) {
    if (last.value === value) return trimCurveBuffer(buf, { ...options, now: Date.now() });
    return appendCurveSample(buf, { time: last.time + 1, value }, { ...options, now: Date.now() });
  }
  const nextTime = last && time < last.time ? last.time + 1 : time;
  return appendCurveSample(buf, { time: nextTime, value }, { ...options, now: Date.now() });
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
/** 时间轴右端：取「当前时刻」与最新采样时刻的较大值，避免数据落在可视窗外 */
export function resolveCurveAxisNow(series, fallbackNow = Date.now()) {
  const times = (series || [])
    .flatMap((item) => (item.samples || []).map((s) => s.time))
    .filter((t) => Number.isFinite(t));
  if (!times.length) return fallbackNow;
  return Math.max(fallbackNow, ...times);
}

/**
 * 取当前 X 可视窗内的采样值；窗内无点则回退全缓冲。
 * @param {Array<{ samples?: CurveSample[] }>} series
 * @param {number} xMin
 * @param {number} xMax
 */
export function collectVisibleCurveValues(series, xMin, xMax) {
  const xmin = Number(xMin);
  const xmax = Number(xMax);
  const useWindow = Number.isFinite(xmin) && Number.isFinite(xmax);
  const inWindow = [];
  const all = [];
  for (const item of series || []) {
    for (const s of item.samples || []) {
      if (!Number.isFinite(s?.value) || !Number.isFinite(s?.time)) continue;
      all.push(s.value);
      if (!useWindow || (s.time >= xmin && s.time <= xmax)) inWindow.push(s.value);
    }
  }
  return inWindow.length ? inWindow : all;
}

/**
 * Y 轴范围：仅按可见窗内 min/max + 8% 跨度 padding（对齐旧 Web/桌面，不用 |yMax| 百分比）。
 * @param {Array<{ samples?: CurveSample[] }>} series
 * @param {number} xMin
 * @param {number} xMax
 * @param {{ padRatio?: number }} [options]
 */
export function computeCurveYAxisRange(series, xMin, xMax, options = {}) {
  const padRatio = options.padRatio ?? 0.08;
  const values = collectVisibleCurveValues(series, xMin, xMax);
  if (!values.length) return { min: 0, max: 1 };
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const span = yMax - yMin;
  if (span < 1e-12) {
    const c = yMin;
    const eps = Math.max(Math.abs(c) * 1e-4, 1e-6);
    return { min: c - eps, max: c + eps };
  }
  const pad = span * padRatio;
  return { min: yMin - pad, max: yMax + pad };
}

/**
 * 按当前 X 轴可见时间窗内的采样计算 Y 轴范围（8% 跨度 padding，避免 |yMax|*2% 压扁小幅波动）。
 * @param {Array<{ samples?: CurveSample[] }>} series
 * @param {number} xMin
 * @param {number} xMax
 */
export function computeCurveYAxis(series, xMin, xMax) {
  const inWindow = (s) => Number.isFinite(s?.time) && s.time >= xMin && s.time <= xMax;
  let values = (series || [])
    .flatMap((item) => (item.samples || []).filter(inWindow).map((s) => s.value))
    .filter(Number.isFinite);
  if (!values.length) {
    values = (series || [])
      .flatMap((item) => (item.samples || []).map((s) => s.value))
      .filter(Number.isFinite);
  }
  if (!values.length) return { min: 0, max: 1 };

  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const span = yMax - yMin;
  const center = (yMin + yMax) / 2;
  const pad =
    span > 1e-12
      ? span * 0.08
      : Math.max(Math.abs(center) * 1e-4, 1e-6);
  return { min: yMin - pad, max: yMax + pad };
}

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
 * @param {{ viewName?: string, emptyTitle?: string, emptySubtitle?: string, series: Array<{ code: string, name?: string, paramName?: string, color: string, samples: CurveSample[] }>, now?: number, windowMs?: number, backgroundColor?: string, axisZoom?: { xMin?: number, xMax?: number, yMin?: number, yMax?: number } }} params
 */
export function buildCurveOption(params) {
  const series = params.series || [];
  const now = resolveCurveAxisNow(series, Number(params.now) || Date.now());
  const windowMs = params.windowMs ?? CURVE_WINDOW_MS;
  const backgroundColor = params.backgroundColor ?? CURVE_BG;
  const timeAxis = computeCurveTimeAxis(series, now, windowMs);
  const axisZoom = params.axisZoom;
  const xMin = Number.isFinite(axisZoom?.xMin) ? axisZoom.xMin : timeAxis.min;
  const xMax = Number.isFinite(axisZoom?.xMax) ? axisZoom.xMax : timeAxis.max;
  const yAxisRange = computeCurveYAxis(series, xMin, xMax);
  const yAxisMin = Number.isFinite(axisZoom?.yMin) ? axisZoom.yMin : yAxisRange.min;
  const yAxisMax = Number.isFinite(axisZoom?.yMax) ? axisZoom.yMax : yAxisRange.max;

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
        show: true,
        triggerTooltip: true,
        lineStyle: { type: "dashed", color: "rgba(154, 168, 191, 0.85)", width: 1 },
        label: { show: false },
      },
      triggerOn: "mousemove|click",
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
      min: xMin,
      max: xMax,
      axisLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b", fontFamily: "Consolas, monospace", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      min: yAxisMin,
      max: yAxisMax,
      scale: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(37,46,66,.72)" } },
      axisLabel: { color: "#76839b", fontFamily: "Consolas, monospace", fontSize: 11 },
    },
    series: series.map((item) => {
      const pointCount = (item.samples || []).length;
      return {
      id: item.code,
      name: formatCurveSeriesLabel(item.code, item.name || item.paramName),
      type: "line",
      showSymbol: false,
      smooth: false,
      step: false,
      sampling: "none",
      connectNulls: false,
      lineStyle: { color: item.color, width: 1.5, type: "solid" },
      itemStyle: { color: item.color },
      data: (item.samples || []).map((sample) => [sample.time, sample.value]),
    };
    }),
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
    line: { smooth: false, step: false },
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
