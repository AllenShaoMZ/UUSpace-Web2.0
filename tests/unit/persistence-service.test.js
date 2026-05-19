import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_PREFIX, createPersistenceService } from "../../modules/core/persistence-service.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe("PersistenceService", () => {
  let storage;
  let persist;

  beforeEach(() => {
    storage = createMemoryStorage();
    persist = createPersistenceService(storage);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses uuspace.web2.v1.* key prefix", () => {
    expect(persist.storageKey("telemetry.columns")).toBe(`${STORAGE_PREFIX}telemetry.columns`);
  });

  it("load returns fallback when key is missing", () => {
    expect(persist.load("telemetry.decimals", { A: -1 })).toEqual({ A: -1 });
  });

  it("load returns fallback when JSON is invalid", () => {
    storage.setItem(persist.storageKey("telemetry.columns"), "{not-json");
    expect(persist.load("telemetry.columns", { visible: ["code"] })).toEqual({ visible: ["code"] });
  });

  it("save and load round-trip data", () => {
    persist.save("telemetry.decimals", { K2001: 2, "FW-A": -1 });
    expect(persist.load("telemetry.decimals", {})).toEqual({ K2001: 2, "FW-A": -1 });
  });

  it("debounceSave writes once after delay", () => {
    vi.useFakeTimers();
    const writer = vi.fn(() => ({ n: 1 }));
    persist.debounceSave("curve.views", writer, 200);
    persist.debounceSave("curve.views", writer, 200);
    expect(storage.getItem(persist.storageKey("curve.views"))).toBeNull();
    vi.advanceTimersByTime(199);
    expect(storage.getItem(persist.storageKey("curve.views"))).toBeNull();
    vi.advanceTimersByTime(1);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(persist.storageKey("curve.views")))).toEqual({ n: 1 });
  });

  it("flushDebounce writes pending data immediately", () => {
    vi.useFakeTimers();
    const writer = vi.fn(() => ({ saved: true }));
    persist.debounceSave("workspace.flush", writer, 500);
    expect(storage.getItem(persist.storageKey("workspace.flush"))).toBeNull();
    persist.flushDebounce("workspace.flush");
    expect(writer).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(persist.storageKey("workspace.flush")))).toEqual({ saved: true });
    vi.advanceTimersByTime(500);
    expect(writer).toHaveBeenCalledTimes(1);
  });
});
