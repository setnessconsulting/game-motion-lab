import { describe, expect, it } from "vitest";
import {
  DISPLAY_DECIMALS,
  SI_UNITS,
  TOLERANCE_FLOORS,
  formatQuantity,
  roundForDisplay,
  roundHalfAwayFromZero,
  type QuantityId,
} from "../../src/science/index.js";

const QUANTITIES = Object.keys(SI_UNITS) as QuantityId[];

describe("display rounding (frozen algorithm)", () => {
  it("rounds half away from zero for positive values", () => {
    expect(roundHalfAwayFromZero(1.25, 1)).toBe(1.3);
    expect(roundHalfAwayFromZero(2.35, 1)).toBe(2.4);
    expect(roundHalfAwayFromZero(0.125, 2)).toBe(0.13);
  });

  it("rounds half away from zero for negative values (symmetric, not toward zero)", () => {
    expect(roundHalfAwayFromZero(-1.25, 1)).toBe(-1.3);
    expect(roundHalfAwayFromZero(-0.125, 2)).toBe(-0.13);
  });

  it("never returns negative zero, so a display string is stable", () => {
    expect(Object.is(roundHalfAwayFromZero(-0.0001, 2), -0)).toBe(false);
    expect(roundHalfAwayFromZero(-0.0001, 2)).toBe(0);
  });

  it("passes non-finite values through rather than inventing a number", () => {
    expect(Number.isNaN(roundHalfAwayFromZero(Number.NaN, 2))).toBe(true);
    expect(roundHalfAwayFromZero(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
  });

  it("is idempotent: rounding an already-rounded value changes nothing", () => {
    for (const value of [0, 1.005, -3.456, 12, 0.049]) {
      const once = roundHalfAwayFromZero(value, 2);
      expect(roundHalfAwayFromZero(once, 2)).toBe(once);
    }
  });
});

describe("display round-trip safety invariant (docs/SCIENCE_MODEL.md §7.3)", () => {
  it("keeps the tolerance floor at least twice the display half-increment for every quantity", () => {
    for (const quantity of QUANTITIES) {
      const halfIncrement = 10 ** -DISPLAY_DECIMALS[quantity] / 2;
      expect(TOLERANCE_FLOORS[quantity]).toBeGreaterThanOrEqual(2 * halfIncrement);
    }
  });

  it("means a learner who types back a displayed value is always inside tolerance", () => {
    const samples = [0, 0.005, -0.005, 6.0000001, -2.4999, 0.05, 11.95, 1.005];
    for (const quantity of QUANTITIES) {
      for (const value of samples) {
        const displayed = roundForDisplay(quantity, value);
        expect(Math.abs(displayed - value)).toBeLessThanOrEqual(TOLERANCE_FLOORS[quantity]);
      }
    }
  });
});

describe("formatQuantity", () => {
  it("uses the frozen decimal count and the SI unit", () => {
    expect(formatQuantity("mass", 1.5)).toBe("1.50 kg");
    expect(formatQuantity("netForce", 3.25)).toBe("3.3 N");
    expect(formatQuantity("velocity", -2)).toBe("-2.00 m/s");
    expect(formatQuantity("acceleration", 0.5)).toBe("0.50 m/s\u00b2");
  });

  it("labels an unavailable value instead of printing a bogus number", () => {
    expect(formatQuantity("position", Number.NaN)).toContain("unavailable");
  });
});
