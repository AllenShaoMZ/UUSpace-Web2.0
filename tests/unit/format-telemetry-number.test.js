import { describe, expect, it } from "vitest";
import { formatTelemetryNumber, formatSignificantDigits } from "../../modules/core/format-telemetry-number.js";

describe("formatTelemetryNumber", () => {
  it("returns em dash for empty or non-finite", () => {
    expect(formatTelemetryNumber(null)).toBe("—");
    expect(formatTelemetryNumber("")).toBe("—");
    expect(formatTelemetryNumber("abc")).toBe("—");
    expect(formatTelemetryNumber(Number.NaN)).toBe("—");
  });

  it("uses scientific notation when |v| > 1e8", () => {
    expect(formatTelemetryNumber(1e9)).toBe("1.000e+9");
    expect(formatTelemetryNumber(-1e-5)).toBe("-0.000010000");
    expect(formatTelemetryNumber(1.23e8)).toBe("1.230e+8");
    expect(formatTelemetryNumber("1e9")).toBe("1.000e+9");
    expect(formatTelemetryNumber(100_000_001)).toBe("1.000e+8");
    expect(formatTelemetryNumber(123456789)).toBe("1.235e+8");
  });

  it("shows small decimals from first non-zero digit (auto mode)", () => {
    expect(formatTelemetryNumber(0.00045, { decimals: -1 })).toBe("0.00045000");
    expect(formatTelemetryNumber(0.00003, { decimals: -1 })).toBe("0.000030000");
    expect(formatTelemetryNumber(0.00012, { decimals: -1 })).toBe("0.00012000");
    expect(formatSignificantDigits(0.00045, 5)).toBe("0.00045000");
  });

  it("uses ~5 significant digits when decimals is -1", () => {
    expect(formatTelemetryNumber(1.23456789, { decimals: -1 })).toBe("1.2346");
    expect(formatTelemetryNumber(0.5, { decimals: -1 })).toBe("0.50000");
    expect(formatTelemetryNumber(0, { decimals: -1 })).toBe("0");
  });

  it("uses fixed decimal places for 0–12", () => {
    expect(formatTelemetryNumber(1.2345, { decimals: 2 })).toBe("1.23");
    expect(formatTelemetryNumber(1.2, { decimals: 0 })).toBe("1");
    expect(formatTelemetryNumber(1.2345, { decimals: 12 })).toBe("1.234500000000");
    expect(formatTelemetryNumber(0.00045, { decimals: 2 })).toBe("0.00");
  });

  it("scientific notation takes precedence over decimals mode for huge values", () => {
    expect(formatTelemetryNumber(1e9, { decimals: 2 })).toBe("1.000e+9");
  });
});
