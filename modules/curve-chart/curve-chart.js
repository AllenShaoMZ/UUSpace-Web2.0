/** @typedef {{ time: number, value: number, seed?: boolean }} CurveSample */

/** 相邻两点时间差超过该阈值时插入断点，避免 SSE 断流后折线直连 */
export const CURVE_LINE_GAP_BREAK_MS = 5 * 60 * 1000;

/**
 * 绘图用数据：去掉占位种子点，按时间升序；大时间空档插入 null 断线。
 * @param {CurveSample[]} samples
 * @param {{ gapBreakMs?: number }} [options]
 */
export function prepareCurveSeriesData(samples, options = {}) {
  const gapMs = options.gapBreakMs ?? CURVE_LINE_GAP_BREAK_MS;
  const points = (samples || [])
    .filter((s) => s && !s.seed && Number.isFinite(s.time) && Number.isFinite(s.value))
    .sort((a, b) => a.time - b.time);
  const data = [];
  let prevTime = null;
  for (const s of points) {
    if (prevTime != null && s.time - prevTime > gapMs) {
      data.push([prevTime + 1, null]);
    }
    data.push([s.time, s.value]);
    prevTime = s.time;
  }
  return data;
}

/** 单通道缓冲上限（约 2h @100ms/点，对齐桌面 FifoCapacity） */
export const CURVE_MAX_POINTS = 72_000;
/** 默认 X 轴可见时间窗：7200s（2h），对齐桌面 WaveSetConfigure */
export const CURVE_WINDOW_MS = 7_200_000;
/** 缓冲保留时长上限：24h */
export const CURVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 可选显示时长（秒） */
export const CURVE_WINDOW_OPTIONS = [
  { seconds: 60, label: "1 分钟" },
  { seconds: 600, label: "10 分钟" },
  { seconds: 3600, label: "1 小时" },
  { seconds: 7200, label: "2 小时" },
  { seconds: 86_400, label: "24 小时" },
];

/**
 * @param {number} ms
 */
export function normalizeCurveWindowMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 1000) return CURVE_WINDOW_MS;
  return Math.min(Math.max(n, 1000), CURVE_MAX_AGE_MS);
}

/**
 * @param {number} windowMs
 */
export function resolveCurveMaxPoints(windowMs) {
  const wm = normalizeCurveWindowMs(windowMs);
  if (wm >= CURVE_MAX_AGE_MS - 1000) return 86_400;
  const estimated = Math.ceil(wm / 100);
  return Math.min(CURVE_MAX_POINTS, Math.max(1800, estimated));
}

/**
 * 按索引均匀抽稀（兼容旧逻辑 / 测试）。
 * @param {CurveSample[]} buffer
 * @param {number} maxPoints
 */
export function decimateCurveBuffer(buffer, maxPoints) {
  const sorted = (buffer || [])
    .filter((p) => p && Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
  if (sorted.length <= maxPoints) return sorted;
  if (maxPoints < 2) return sorted.slice(-1);

  const result = [sorted[0]];
  const inner = sorted.slice(1, -1);
  const innerCount = maxPoints - 2;
  const step = inner.length / innerCount;
  for (let i = 0; i < innerCount; i += 1) {
    const idx = Math.min(inner.length - 1, Math.floor((i + 0.5) * step));
    result.push(inner[idx]);
  }
  result.push(sorted[sorted.length - 1]);
  return result;
}

/**
 * 按时间轴分桶抽稀：每桶保留 min/max（尖峰不丢），适配 24h 长窗。
 * @param {CurveSample[]} buffer
 * @param {number} maxPoints
 */
export function decimateCurveBufferByTime(buffer, maxPoints) {
  const sorted = (buffer || [])
    .filter((p) => p && Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
  if (sorted.length <= maxPoints) return sorted;
  if (maxPoints < 2) return sorted.slice(-1);

  const t0 = sorted[0].time;
  const t1 = sorted[sorted.length - 1].time;
  const span = Math.max(t1 - t0, 1);
  const bucketCount = maxPoints;
  const bucketSize = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, () => []);

  for (const p of sorted) {
    let idx = Math.floor((p.time - t0) / bucketSize);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].push(p);
  }

  const result = [];
  for (const inBucket of buckets) {
    if (!inBucket.length) continue;
    if (inBucket.length === 1) {
      result.push(inBucket[0]);
      continue;
    }
    let min = inBucket[0];
    let max = inBucket[0];
    for (const p of inBucket) {
      if (p.value < min.value) min = p;
      if (p.value > max.value) max = p;
    }
    if (min.time <= max.time) {
      result.push(min);
      if (max !== min) result.push(max);
    } else {
      result.push(max);
      result.push(min);
    }
  }

  const deduped = [];
  let lastTime = -Infinity;
  for (const p of result.sort((a, b) => a.time - b.time)) {
    if (p.time === lastTime) continue;
    deduped.push(p);
    lastTime = p.time;
  }
  if (deduped.length && deduped[0].time !== sorted[0].time) deduped.unshift(sorted[0]);
  if (deduped.length && deduped.at(-1).time !== sorted.at(-1).time) deduped.push(sorted.at(-1));
  if (deduped.length <= maxPoints) return deduped;
  return decimateCurveBuffer(deduped, maxPoints);
}
/** 实时刷新间隔（约 20Hz），与 UDP 入站合并后仍尽量逐点可见 */
export const CURVE_FLUSH_INTERVAL_MS = 50;
/** 与页面 panel 融合，不用独立纯黑底 */
export const CURVE_BG = "transparent";
/** X 轴右端留白（相对显示窗比例），最新点不贴边，便于观察实时绘制 */
export const CURVE_TIME_AXIS_RIGHT_PAD_RATIO = 0.06;
/** 右留白下限 30s */
export const CURVE_TIME_AXIS_RIGHT_PAD_MIN_MS = 30_000;

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
  if (next.length > maxPoints) next = decimateCurveBufferByTime(next, maxPoints);
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
 * 时间轴右端留白（毫秒）：最新采样点右侧留出空带，体现「实时向前绘制」。
 * @param {number} windowMs
 */
export function computeCurveTimeAxisRightPad(windowMs = CURVE_WINDOW_MS) {
  const wm = normalizeCurveWindowMs(windowMs);
  return Math.max(Math.round(wm * CURVE_TIME_AXIS_RIGHT_PAD_RATIO), CURVE_TIME_AXIS_RIGHT_PAD_MIN_MS);
}

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

/**
 * X 轴范围：右端固定留白；历史不足一窗时左端贴最早数据（避免 2h 窗下左侧大块空白）。
 * @param {Array<{ samples?: CurveSample[] }>} series
 * @param {number} now
 * @param {number} windowMs
 */
export function computeCurveTimeAxis(series, now, windowMs = CURVE_WINDOW_MS) {
  const wm = normalizeCurveWindowMs(windowMs);
  const rightPad = computeCurveTimeAxisRightPad(wm);
  const axisMax = now + rightPad;
  const times = (series || [])
    .flatMap((item) => (item.samples || []).map((s) => s.time))
    .filter((t) => Number.isFinite(t));
  if (!times.length) {
    return { min: axisMax - wm, max: axisMax };
  }
  const dataMin = Math.min(...times);
  const span = Math.max(now - dataMin, 1000);
  if (span >= wm * 0.92) {
    return { min: axisMax - wm, max: axisMax };
  }
  const displaySpan = Math.min(wm, Math.max(span * 1.08, 1000));
  const leftPad = displaySpan * 0.04;
  return { min: Math.max(0, dataMin - leftPad), max: axisMax };
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
  const series = (params.series || []).map((item) => ({
    ...item,
    samples: (item.samples || []).filter((s) => !s?.seed),
  }));
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
      data: prepareCurveSeriesData(item.samples),
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
