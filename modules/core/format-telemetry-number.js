/**
 * 遥测数值显示（MC）— 供 M1 表格、M2 曲线 tooltip 复用。
 * @param {unknown} value
 * @param {{ decimals?: number }} [options] decimals: -1 自动约 8 位有效数字；0–12 固定小数位
 * @returns {string}
 */
export function formatTelemetryNumber(value, { decimals = -1 } = {}) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  const abs = Math.abs(n);
  if (abs > 1e8 || (n !== 0 && abs < 1e-4)) {
    return n.toExponential(3);
  }

  if (decimals === -1) {
    return String(parseFloat(n.toPrecision(8)));
  }

  const places = Math.max(0, Math.min(12, Math.trunc(decimals)));
  return n.toFixed(places);
}
