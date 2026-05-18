import { describe, expect, it } from "vitest";
import { formatTelemetryNumber } from "../../modules/core/format-telemetry-number.js";

describe("formatTelemetryNumber", () => {
  it("returns em dash for empty or non-finite", () => {
    expect(formatTelemetryNumber(null)).toBe("—");
    expect(formatTelemetryNumber("")).toBe("—");
    expect(formatTelemetryNumber("abc")).toBe("—");
    expect(formatTelemetryNumber(Number.NaN)).toBe("—");
  });

  it("uses scientific notation when |v| > 1e8 or 0 < |v| < 1e-4", () => {
    expect(formatTelemetryNumber(1e9)).toBe("1.000e+9");
    expect(formatTelemetryNumber(-1e-5)).toBe("-1.000e-5");
    expect(formatTelemetryNumber(1.23e8)).toBe("1.230e+8");
  });

  it("uses ~8 significant digits when decimals is -1", () => {
    expect(formatTelemetryNumber(1.23456789, { decimals: -1 })).toBe("1.2345679");
    expect(formatTelemetryNumber(0.5, { decimals: -1 })).toBe("0.5");
    expect(formatTelemetryNumber(0, { decimals: -1 })).toBe("0");
  });

  it("uses fixed decimal places for 0–12", () => {
    expect(formatTelemetryNumber(1.2345, { decimals: 2 })).toBe("1.23");
    expect(formatTelemetryNumber(1.2, { decimals: 0 })).toBe("1");
    expect(formatTelemetryNumber(1.2345, { decimals: 12 })).toBe("1.234500000000");
  });

  it("scientific notation takes precedence over decimals mode", () => {
    expect(formatTelemetryNumber(1e9, { decimals: 2 })).toBe("1.000e+9");
  });
});
