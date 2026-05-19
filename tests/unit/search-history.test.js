import { describe, expect, it } from "vitest";
import {
  TABLE_SEARCH_HISTORY_MAX,
  filterSearchHistory,
  normalizeSearchHistory,
  pushSearchHistory,
} from "../../modules/core/search-history.js";

describe("search-history", () => {
  it("keeps at most 8 unique recent terms", () => {
    let list = [];
    for (let i = 0; i < 12; i += 1) {
      list = pushSearchHistory(list, `词${i}`);
    }
    expect(list).toHaveLength(TABLE_SEARCH_HISTORY_MAX);
    expect(list[0]).toBe("词11");
    expect(list).not.toContain("词0");
  });

  it("moves duplicate term to front", () => {
    const list = pushSearchHistory(["温度", "电压", "电流"], "电压");
    expect(list[0]).toBe("电压");
    expect(list).toHaveLength(3);
  });

  it("filters history by query substring", () => {
    const list = normalizeSearchHistory(["温度A", "温度B", "电压"]);
    expect(filterSearchHistory(list, "温度")).toEqual(["温度A", "温度B"]);
    expect(filterSearchHistory(list, "")).toEqual(list);
  });
});
