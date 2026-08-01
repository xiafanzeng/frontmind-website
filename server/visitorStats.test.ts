import { describe, expect, it } from "vitest";
import { summarizeVisitorStore, type VisitorStore } from "./visitorStats";

const firstVisitor = "a".repeat(64);
const secondVisitor = "b".repeat(64);
const thirdVisitor = "c".repeat(64);

describe("visitor statistics summary", () => {
  it("derives every total from persisted visits without a fabricated baseline", () => {
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

    expect(summary.totalReads).toBe(9);
    expect(summary.pageviews).toBe(9);
    expect(summary.countryCount).toBe(2);
    expect(summary).not.toHaveProperty("baselineReads");
    expect(summary).not.toHaveProperty("liveReads");
    expect(summary.countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ iso: "cn", reads: 3 }),
        expect.objectContaining({ iso: "us", reads: 2 }),
        expect.objectContaining({ iso: "unknown", reads: 4 }),
      ]),
    );
  });

  it("reports a fresh store honestly as zero visits and zero regions", () => {
    const summary = summarizeVisitorStore({
      visitors: {},
      pageviews: 0,
    });

    expect(summary).toMatchObject({
      totalReads: 0,
      countryCount: 0,
      pageviews: 0,
      countries: [],
    });
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

    expect(summary.countryCount).toBe(0);
    expect(summary.countries).toEqual([
      expect.objectContaining({
        country: "Unknown",
        iso: "unknown",
        reads: 1,
      }),
    ]);
  });
});
