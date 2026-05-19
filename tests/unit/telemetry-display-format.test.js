import { describe, expect, it } from "vitest";
import { formatTelemetryNumber } from "../../modules/core/format-telemetry-number.js";

/**
 * Mirrors app.js formatTelemetryValue numeric branch (MC formatTelemetryNumber).
 */
function formatTelemetryValueDisplay(raw, decimals = -1) {
  const text = String(raw ?? "").trim();
  if (!text || text === "—") return "—";
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return text;
  return formatTelemetryNumber(parsed, { decimals });
}

/** Mirrors app.js getParamDecimals — only persisted per-code overrides apply. */
function getDisplayDecimals(code, stateDecimals = {}) {
  const fromState = stateDecimals[code];
  if (fromState != null && fromState !== "") return Number(fromState);
  return -1;
}

function formatWithParamDecimals(raw, code, stateDecimals = {}, definitionDecimals = 2) {
  void definitionDecimals;
  const decimals = getDisplayDecimals(code, stateDecimals);
  return formatTelemetryValueDisplay(raw, decimals);
}

describe("telemetry value display (M1 current value column)", () => {
  it("formats large numbers as scientific notation; small decimals stay decimal", () => {
    expect(formatTelemetryValueDisplay(1e9)).toBe("1.000e+9");
    expect(formatTelemetryValueDisplay(-1e-5)).toBe("-0.000010000");
    expect(formatTelemetryValueDisplay(123456789)).toBe("1.235e+8");
  });

  it("re-formats pre-rendered scientific strings consistently", () => {
    expect(formatTelemetryValueDisplay("1.000e+9")).toBe("1.000e+9");
    expect(formatTelemetryValueDisplay("-1.000e-5")).toBe("-0.000010000");
  });

  it("shows small magnitudes with ~5 sig figs by default (not 0.00)", () => {
    expect(formatTelemetryValueDisplay(0.00045)).toBe("0.00045000");
    expect(formatWithParamDecimals(0.00045, "K2001")).toBe("0.00045000");
  });

  it("ignores definition-table fixed decimals unless user overrides in state", () => {
    expect(formatWithParamDecimals(0.00045, "K2001", {}, 2)).toBe("0.00045000");
    expect(formatWithParamDecimals(1.2345, "K2001", { K2001: 2 }, 2)).toBe("1.23");
    expect(formatWithParamDecimals(1.23456789, "K2001", { K2001: -1 }, 2)).toBe("1.2346");
  });

  it("passes fixed decimal places when configured", () => {
    expect(formatTelemetryValueDisplay(1.2345, 2)).toBe("1.23");
    expect(formatTelemetryValueDisplay(1e9, 2)).toBe("1.000e+9");
  });
});
