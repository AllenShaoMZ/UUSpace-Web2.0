import { describe, expect, it } from "vitest";
import {
  TELEMETRY_COLUMNS,
  TELEMETRY_MIN_COLUMN_WIDTH,
  createDefaultTelemetryColumns,
  mergeTelemetryColumns,
  getVisibleTelemetryColumns,
  isTelemetryColumnVisible,
  resolveTelemetryColumnWidth,
  clampTelemetryColumnWidth,
  getTelemetryColumnMinWidth,
  computeTelemetryColumnAutoWidth,
  TELEMETRY_COLUMN_CELL_PADDING_X,
  TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH,
} from "../../modules/telemetry/telemetry-columns.js";

describe("telemetry columns", () => {
  it("defines all M1 column keys with defaults from design", () => {
    expect(TELEMETRY_COLUMNS.map((col) => col.key)).toEqual([
      "select",
      "code",
      "name",
      "value",
      "hex",
      "unit",
      "index",
      "formula",
      "status",
      "binary",
      "wave",
    ]);
    const byKey = Object.fromEntries(TELEMETRY_COLUMNS.map((col) => [col.key, col]));
    expect(byKey.select).toMatchObject({ title: "选择", hideable: false, defaultVisible: true });
    expect(byKey.hex).toMatchObject({ hideable: true, defaultVisible: true });
    expect(byKey.status).toMatchObject({ hideable: true, defaultVisible: false });
  });

  it("createDefaultTelemetryColumns matches defaultVisible flags", () => {
    const defaults = createDefaultTelemetryColumns();
    TELEMETRY_COLUMNS.forEach((col) => {
      expect(defaults[col.key]).toEqual({ visible: col.defaultVisible });
    });
  });

  it("mergeTelemetryColumns keeps saved visibility and forces non-hideable columns visible", () => {
    const merged = mergeTelemetryColumns({
      hex: { visible: false },
      code: { visible: false },
      formula: { visible: true },
    });
    expect(merged.hex.visible).toBe(false);
    expect(merged.formula.visible).toBe(true);
    expect(merged.code.visible).toBe(true);
    expect(merged.select.visible).toBe(true);
    expect(merged.value.visible).toBe(true);
  });

  it("mergeTelemetryColumns adds missing keys from defaults", () => {
    const merged = mergeTelemetryColumns({ hex: { visible: false } });
    expect(merged.wave).toEqual({ visible: false });
    expect(merged.index).toEqual({ visible: false });
  });

  it("default visible columns follow legacy Web table order", () => {
    const keys = getVisibleTelemetryColumns(createDefaultTelemetryColumns()).map((col) => col.key);
    expect(keys).toEqual(["select", "code", "name", "value", "hex", "unit"]);
  });

  it("getVisibleTelemetryColumns respects merged state", () => {
    const columns = mergeTelemetryColumns({ hex: { visible: true }, formula: { visible: false } });
    const keys = getVisibleTelemetryColumns(columns).map((col) => col.key);
    expect(keys).toContain("hex");
    expect(keys).not.toContain("formula");
    expect(keys).toContain("code");
  });

  it("isTelemetryColumnVisible ignores hideable=false overrides", () => {
    const columns = mergeTelemetryColumns({ code: { visible: false }, value: { visible: false } });
    expect(isTelemetryColumnVisible("code", columns)).toBe(true);
    expect(isTelemetryColumnVisible("value", columns)).toBe(true);
  });

  it("hideable columns respect saved visibility", () => {
    const columns = mergeTelemetryColumns({ hex: { visible: false }, index: { visible: true } });
    expect(isTelemetryColumnVisible("hex", columns)).toBe(false);
    expect(isTelemetryColumnVisible("index", columns)).toBe(true);
  });

  it("mergeTelemetryColumns preserves saved column widths", () => {
    const merged = mergeTelemetryColumns({
      code: { visible: true, width: 200 },
      unit: { visible: true, width: 96 },
    });
    expect(merged.code.width).toBe(200);
    expect(merged.unit.width).toBe(96);
  });

  it("mergeTelemetryColumns clamps width below column minimum", () => {
    const merged = mergeTelemetryColumns({ code: { visible: true, width: 10 } });
    expect(merged.code.width).toBe(120);
  });

  it("resolveTelemetryColumnWidth uses default minWidth when width not saved", () => {
    const codeCol = TELEMETRY_COLUMNS.find((col) => col.key === "code");
    expect(resolveTelemetryColumnWidth(codeCol, createDefaultTelemetryColumns())).toBe(120);
  });

  it("clampTelemetryColumnWidth enforces global minimum 48px", () => {
    const unitCol = TELEMETRY_COLUMNS.find((col) => col.key === "unit");
    expect(TELEMETRY_MIN_COLUMN_WIDTH).toBe(48);
    expect(getTelemetryColumnMinWidth(unitCol)).toBe(72);
    expect(clampTelemetryColumnWidth(30, unitCol)).toBe(72);
    expect(clampTelemetryColumnWidth(80, unitCol)).toBe(80);
  });

  it("computeTelemetryColumnAutoWidth adds padding and clamps to column minimum", () => {
    const unitCol = TELEMETRY_COLUMNS.find((col) => col.key === "unit");
    expect(TELEMETRY_COLUMN_CELL_PADDING_X).toBe(20);
    expect(TELEMETRY_COLUMN_RESIZE_HANDLE_WIDTH).toBe(8);
    expect(computeTelemetryColumnAutoWidth(40, unitCol)).toBe(72);
    expect(computeTelemetryColumnAutoWidth(50, unitCol)).toBe(78);
    expect(computeTelemetryColumnAutoWidth(0, unitCol)).toBe(72);
  });
});
