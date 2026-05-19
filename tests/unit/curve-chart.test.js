import { describe, expect, it } from "vitest";
import {
  CURVE_MAX_POINTS,
  CURVE_MAX_AGE_MS,
  CURVE_WINDOW_MS,
  appendCurveSample,
  appendCurveSampleCoalesced,
  buildCurveOption,
  computeCurveTimeAxis,
  computeCurveYAxis,
  decimateCurveBuffer,
  normalizeCurveWindowMs,
  resolveCurveAxisNow,
  resolveCurveMaxPoints,
  formatCurveAxisTooltip,
  formatCurveSeriesLabel,
  trimCurveBuffer,
} from "../../modules/curve-chart/curve-chart.js";

describe("curve-chart buffer", () => {
  it("keeps at most CURVE_MAX_POINTS samples", () => {
    const now = 1_700_000_000_000;
    const buffer = Array.from({ length: CURVE_MAX_POINTS + 50 }, (_, i) => ({
      time: now - (CURVE_MAX_POINTS + 50 - i) * 10,
      value: i,
    }));
    const trimmed = trimCurveBuffer(buffer, { now });
    expect(trimmed.length).toBe(CURVE_MAX_POINTS);
    expect(trimmed[0].value).toBe(0);
    expect(trimmed.at(-1).value).toBe(CURVE_MAX_POINTS + 49);
  });

  it("appendCurveSample trims after push", () => {
    const now = Date.now();
    let buffer = [];
    for (let i = 0; i < 5; i += 1) {
      buffer = appendCurveSample(buffer, { time: now - (4 - i) * 1000, value: i }, { now });
    }
    expect(buffer).toHaveLength(5);
    expect(buffer.at(-1).value).toBe(4);
  });

  it("appendCurveSampleCoalesced skips duplicate value at same protocol time", () => {
    const now = Date.now();
    const t = now - 2000;
    let buffer = appendCurveSampleCoalesced([], { time: t, value: 1 }, { now });
    buffer = appendCurveSampleCoalesced(buffer, { time: t, value: 1 }, { now });
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toEqual({ time: t, value: 1 });
  });

  it("appendCurveSampleCoalesced adds step point when value changes at same protocol time", () => {
    const now = Date.now();
    const t = now - 2000;
    let buffer = appendCurveSampleCoalesced([], { time: t, value: 1 }, { now });
    buffer = appendCurveSampleCoalesced(buffer, { time: t, value: 9 }, { now });
    expect(buffer).toHaveLength(2);
    expect(buffer[0]).toEqual({ time: t, value: 1 });
    expect(buffer[1]).toEqual({ time: t + 1, value: 9 });
  });

  it("appendCurveSampleCoalesced bumps time when protocol time goes backward", () => {
    const now = Date.now();
    const t = now - 2000;
    let buffer = appendCurveSampleCoalesced([], { time: t, value: 1 }, { now });
    buffer = appendCurveSampleCoalesced(buffer, { time: t - 100, value: 2 }, { now });
    expect(buffer).toHaveLength(2);
    expect(buffer[1].time).toBe(t + 1);
    expect(buffer[1].value).toBe(2);
  });
});

describe("resolveCurveAxisNow", () => {
  it("uses latest sample time when ahead of wall clock", () => {
    const now = 1_700_000_000_000;
    const axisNow = resolveCurveAxisNow([{ samples: [{ time: now + 5000, value: 1 }] }], now);
    expect(axisNow).toBe(now + 5000);
  });
});

describe("computeCurveTimeAxis", () => {
  it("shrinks window when data span is shorter than configured window", () => {
    const now = 1_700_000_060_000;
    const { min, max } = computeCurveTimeAxis(
      [{ samples: [{ time: now - 20_000, value: 1 }, { time: now - 5_000, value: 2 }] }],
      now,
      CURVE_WINDOW_MS,
    );
    expect(max).toBe(now);
    expect(min).toBeGreaterThan(now - CURVE_WINDOW_MS);
    expect(min).toBeLessThanOrEqual(now - 20_000);
  });

  it("uses full 2h window when data span is long enough", () => {
    const now = 1_700_000_060_000;
    const { min, max } = computeCurveTimeAxis(
      [{ samples: [{ time: now - 7_000_000, value: 1 }, { time: now - 1_000, value: 2 }] }],
      now,
      CURVE_WINDOW_MS,
    );
    expect(max).toBe(now);
    expect(min).toBe(now - CURVE_WINDOW_MS);
  });
});

describe("curve window config", () => {
  it("defaults window to 7200s", () => {
    expect(CURVE_WINDOW_MS).toBe(7_200_000);
    expect(normalizeCurveWindowMs(0)).toBe(7_200_000);
    expect(normalizeCurveWindowMs(60_000)).toBe(60_000);
  });

  it("caps window at buffer max age", () => {
    expect(normalizeCurveWindowMs(CURVE_MAX_AGE_MS + 1)).toBe(CURVE_MAX_AGE_MS);
  });

  it("resolveCurveMaxPoints scales with window", () => {
    expect(resolveCurveMaxPoints(60_000)).toBe(1800);
    expect(resolveCurveMaxPoints(7_200_000)).toBe(72_000);
  });

  it("decimateCurveBuffer keeps endpoints", () => {
    const buffer = Array.from({ length: 100 }, (_, i) => ({ time: i, value: i }));
    const out = decimateCurveBuffer(buffer, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ time: 0, value: 0 });
    expect(out.at(-1)).toEqual({ time: 99, value: 99 });
  });
});

describe("computeCurveYAxis", () => {
  it("uses data span padding for large-magnitude signals with small ripple", () => {
    const now = Date.now();
    const xMin = now - 60_000;
    const xMax = now;
    const { min, max } = computeCurveYAxis(
      [
        {
          samples: [
            { time: now - 30_000, value: 1000 },
            { time: now - 10_000, value: 1000.05 },
            { time: now - 1_000, value: 1000.1 },
          ],
        },
      ],
      xMin,
      xMax,
    );
    expect(max - min).toBeLessThan(1);
    expect(min).toBeGreaterThan(999.9);
    expect(max).toBeLessThan(1000.2);
  });

  it("ignores samples outside visible X window when computing range", () => {
    const now = Date.now();
    const xMin = now - 10_000;
    const xMax = now;
    const { min, max } = computeCurveYAxis(
      [
        {
          samples: [
            { time: now - 50_000, value: 0 },
            { time: now - 5_000, value: 10 },
            { time: now - 1_000, value: 12 },
          ],
        },
      ],
      xMin,
      xMax,
    );
    expect(min).toBeGreaterThan(9);
    expect(max).toBeLessThan(13);
  });
});

describe("formatCurveSeriesLabel", () => {
  it("joins code and name with hyphen", () => {
    expect(formatCurveSeriesLabel("T001", "温度")).toBe("T001-温度");
  });

  it("returns code only when name matches or is empty", () => {
    expect(formatCurveSeriesLabel("T001", "T001")).toBe("T001");
    expect(formatCurveSeriesLabel("T001", "")).toBe("T001");
  });

  it("does not duplicate code when name is already prefixed", () => {
    expect(formatCurveSeriesLabel("T001", "T001-温度")).toBe("T001-温度");
  });
});

describe("buildCurveOption", () => {
  it("builds time-axis option with one series per channel", () => {
    const now = 1_700_000_000_000;
    const option = buildCurveOption({
      viewName: "测试页",
      now,
      windowMs: 60_000,
      series: [
        {
          code: "CH-A",
          name: "通道A",
          color: "#5B7CFA",
          samples: [
            { time: now - 58_000, value: 1 },
            { time: now - 10_000, value: 2 },
          ],
        },
        {
          code: "CH-B",
          color: "#3DD9B4",
          samples: [{ time: now - 5_000, value: 3 }],
        },
      ],
    });
    expect(option.xAxis.max).toBe(now);
    expect(option.xAxis.min).toBe(now - 60_000);
    expect(option.series).toHaveLength(2);
    expect(option.series[0].name).toBe("CH-A-通道A");
    expect(option.series[1].name).toBe("CH-B");
    expect(option.series[1].data[0]).toEqual([now - 5_000, 3]);
    expect(option.backgroundColor).toBe("transparent");
    expect(option.tooltip.formatter).toBe(formatCurveAxisTooltip);
    expect(option.series[0].areaStyle).toBeUndefined();
    expect(option.series[0].smooth).toBe(false);
    expect(option.series[0].step).toBe(false);
    expect(option.series[0].showSymbol).toBe(false);
    expect(option.series[0].sampling).toBe("none");
  });

  it("shows empty-state copy for blank page", () => {
    const option = buildCurveOption({
      series: [],
      emptyTitle: "空白页面",
      emptySubtitle: "在左侧勾选波道后点击「添加曲线」。",
    });
    expect(option.graphic).toHaveLength(2);
    expect(option.graphic[0].style.text).toBe("空白页面");
    expect(option.graphic[1].style.text).toBe("在左侧勾选波道后点击「添加曲线」。");
  });
});

describe("formatCurveAxisTooltip", () => {
  it("keeps one value per series when params repeat", () => {
    const html = formatCurveAxisTooltip([
      { seriesId: "CH-A", seriesName: "CH-A", marker: "●", value: [1, 10], axisValueLabel: "12:00" },
      { seriesId: "CH-A", seriesName: "CH-A", marker: "●", value: [2, 11], axisValueLabel: "12:00" },
      { seriesId: "CH-B", seriesName: "CH-B", marker: "●", value: [3, 20], axisValueLabel: "12:00" },
    ]);
    expect(html).toContain("12:00");
    expect(html.match(/CH-A/g)).toHaveLength(1);
    expect(html.match(/CH-B/g)).toHaveLength(1);
    expect(html).toContain("CH-A: 10");
    expect(html).toContain("CH-B: 20");
  });
});
