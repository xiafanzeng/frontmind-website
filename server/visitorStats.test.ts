import { describe, expect, it } from "vitest";
import { summarizeVisitorStore, type VisitorStore } from "./visitorStats";

const firstVisitor = "a".repeat(64);
const secondVisitor = "b".repeat(64);
const thirdVisitor = "c".repeat(64);

describe("visitor statistics summary", () => {
  it("adds persisted visits to the published historical snapshot", () => {
    const store: VisitorStore = {
      visitors: {
        [firstVisitor]: {
          country: "Mainland China",
          iso: "cn",
          firstSeen: "2026-07-28T00:00:00.000Z",
          lastSeen: "2026-07-28T00:00:00.000Z",
          visits: 3,
        },
        [secondVisitor]: {
          country: "United States",
          iso: "us",
          firstSeen: "2026-07-28T00:00:00.000Z",
          lastSeen: "2026-07-28T00:00:00.000Z",
          visits: 2,
        },
        [thirdVisitor]: {
          country: "Unknown",
          iso: "unknown",
          firstSeen: "2026-07-28T00:00:00.000Z",
          lastSeen: "2026-07-28T00:00:00.000Z",
          visits: 4,
        },
      },
      pageviews: 999_999,
      updatedAt: "2026-07-28T00:00:00.000Z",
    };

    const summary = summarizeVisitorStore(store);

    expect(summary.totalReads).toBe(1416);
    expect(summary.pageviews).toBe(9);
    expect(summary.countryCount).toBe(53);
    expect(summary.baselineReads).toBe(1407);
    expect(summary.liveReads).toBe(9);
    expect(summary.countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ iso: "cn", reads: 933 }),
        expect.objectContaining({ iso: "us", reads: 50 }),
        expect.objectContaining({ iso: "unknown", reads: 5 }),
      ]),
    );
  });

  it("retains the historical distribution for a fresh live store", () => {
    const summary = summarizeVisitorStore({
      visitors: {},
      pageviews: 0,
    });

    expect(summary).toMatchObject({
      totalReads: 1407,
      countryCount: 53,
      pageviews: 0,
      baselineReads: 1407,
      liveReads: 0,
    });
    expect(summary.countries).toHaveLength(53);
  });

  it("keeps missing or invalid geography under Unknown instead of China", () => {
    const summary = summarizeVisitorStore({
      visitors: {
        [firstVisitor]: {
          country: "",
          iso: "not-a-country",
          firstSeen: "2026-07-28T00:00:00.000Z",
          lastSeen: "2026-07-28T00:00:00.000Z",
          visits: 1,
        },
      },
      pageviews: 1,
    });

    expect(summary.countryCount).toBe(53);
    expect(summary.countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          country: "Unknown",
          iso: "unknown",
          reads: 2,
        }),
      ]),
    );
  });
});
