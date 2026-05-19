/**
 * 遥测数值显示（MC）— 供 M1 表格、M2 曲线 tooltip 复用。
 * @param {unknown} value
 * @param {{ decimals?: number }} [options] decimals: -1 自动 5 位有效数字（从首个非 0 数字起）；0–12 固定小数位
 * @returns {string}
 */

const AUTO_SIG_FIGS = 5;

/**
 * 按有效数字格式化：小数从第一个非 0 位起保留有效位，避免 0.000x 显示成 0。
 * @param {number} n
 * @param {number} sigFigs
 */
export function formatSignificantDigits(n, sigFigs = AUTO_SIG_FIGS) {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "—";
  const abs = Math.abs(n);
  if (abs >= 1e8) return n.toExponential(3);

  const order = Math.floor(Math.log10(abs));
  const decPlaces = Math.max(0, sigFigs - 1 - order);
  const rounded = Number.parseFloat(n.toPrecision(sigFigs));
  if (decPlaces === 0) return String(rounded);
  return rounded.toFixed(decPlaces);
}

export function formatTelemetryNumber(value, { decimals = -1 } = {}) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  if (decimals === -1) {
    return formatSignificantDigits(n, AUTO_SIG_FIGS);
  }

  const abs = Math.abs(n);
  if (abs > 1e8 || (n !== 0 && abs < 1e-4)) {
    return n.toExponential(3);
  }

  const places = Math.max(0, Math.min(12, Math.trunc(decimals)));
  return n.toFixed(places);
}
