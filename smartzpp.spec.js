import { describe, it, expect } from "vitest";
import { k, r_L, τ, H, C, solve, distribute, correct } from "./smartzpp.js";

describe("k(n) — child coefficients", () => {
  it.each([
    [1, 0.5],
    [2, 0.7],
    [3, 1.0],
    [4, 1.4],
    [5, 1.9],
    [6, 2.5],
    [7, 3.2],
    [8, 4.0],
    [9, 4.9],
    [0, 0],
  ])("k(%i) = %s", (n, expected) => {
    expect(k(n)).toBeCloseTo(expected);
  });

  describe("progressive gaps: k(n) - k(n-1) increases by 0.1", () => {
    it.each([3, 4, 5, 6, 7, 8, 9])("Δk(%i) - Δk(%i-1) = 0.1", (n) => {
      const gap = k(n) - k(n - 1);
      const prevGap = k(n - 1) - k(n - 2);
      expect(gap - prevGap).toBeCloseTo(0.1);
    });
  });
});

describe("r_L(birthYear) — young parent rate reduction", () => {
  it.each([
    [2001, 0.2, 0, "age 24 → 0"],
    [2000, 0.2, 0, "age 25 → 0"],
    [1999, 0.2, 0.1, "age 26 → half"],
    [1995, 0.2, 0.1, "age 30 → half"],
    [1994, 0.2, 0.2, "age 31 → full"],
    [1975, 0.2, 0.2, "age 50 → full"],
  ])("birthYear %i, rate %s → %s (%s)", (birthYear, rate, expected) => {
    expect(r_L(birthYear, rate)).toBeCloseTo(expected);
  });
});

describe("τ(T, r_L, r_H) — tax function", () => {
  const rL = 0.2;
  const rH = 0.3;

  it.each([
    [0, 0, "zero income"],
    [-100, 0, "negative income"],
    [10000, 2000, "lower bracket only"],
    [60000, 12000, "at bracket boundary"],
    [70000, 15000, "into higher bracket"],
    [100000, 24000, "well into higher bracket"],
  ])("τ(%i) = %s (%s)", (T, expected) => {
    expect(τ(T, rL, rH)).toBeCloseTo(expected);
  });

  describe("monotonicity", () => {
    it.each([0, 10000, 30000, 59999, 60000, 60001, 80000])(
      "τ(%i) ≤ τ(%i + 1)",
      (T) => {
        expect(τ(T, rL, rH)).toBeLessThanOrEqual(τ(T + 1, rL, rH));
      },
    );
  });
});

describe("H(x) — piecewise linear household tax", () => {
  const a = 16800;
  const b = 7200;
  const D = 15840;
  const rLA = 0.2;
  const rLB = 0.2;
  const rH = 0.3;

  it("is linear between breakpoints", () => {
    const candidates = C(a, b, D);
    const xs = candidates.map((c) => c.x).sort((a, b) => a - b);

    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const mid = (x0 + x1) / 2;
      const H0 = H(x0, a, b, D, rLA, rLB, rH);
      const H1 = H(x1, a, b, D, rLA, rLB, rH);
      const Hmid = H(mid, a, b, D, rLA, rLB, rH);
      expect(Hmid).toBeCloseTo((H0 + H1) / 2, 1);
    }
  });
});

describe("C(a, b, D) — candidate critical points", () => {
  it("all candidates are within [0, D]", () => {
    const candidates = C(16800, 7200, 15840);
    for (const c of candidates) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(15840);
    }
  });
});

describe("solve()", () => {
  it("computes correct deduction total for 3 children", () => {
    const D = (0.5 + 0.7 + 1.0) * 7200;
    expect(D).toBeCloseTo(15840);
    expect(7200 + D).toBeCloseTo(23040);
  });

  it("symmetric incomes → equal tax at both extremes", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 20000,
        taxPaid: 0,
        birthYear: 1990,
        disability: null,
      },
      parentB: {
        incomeAnnual: 20000,
        taxPaid: 0,
        birthYear: 1990,
        disability: null,
      },
      rates: { lower: 0.2, higher: 0.3 },
      childCount: 1,
      depCount: 0,
    });
    const Hat0 = r.candidates.find((c) => c.label === "x_0").H;
    const HatD = r.candidates.find((c) => c.label === "x_5").H;
    expect(Hat0).toBeCloseTo(HatD);
  });

  it("young parent B (≤25): all deduction goes to A", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 24000,
        taxPaid: 0,
        birthYear: 1988,
        disability: null,
      },
      parentB: {
        incomeAnnual: 16000,
        taxPaid: 0,
        birthYear: 2002,
        disability: null,
      },
      rates: { lower: 0.2, higher: 0.3 },
      childCount: 2,
      depCount: 0,
    });
    expect(r.x_star).toBeCloseTo(r.D);
  });

  it("low incomes, both drop to zero → H = 0", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 8000,
        taxPaid: 50,
        birthYear: 1990,
        disability: null,
      },
      parentB: {
        incomeAnnual: 8800,
        taxPaid: 80,
        birthYear: 1991,
        disability: null,
      },
      rates: { lower: 0.2, higher: 0.3 },
      childCount: 2,
      depCount: 0,
    });
    expect(r.H_min).toBeCloseTo(0);
    expect(r.Δ_A).toBeCloseTo(50);
    expect(r.Δ_B).toBeCloseTo(80);
  });

  it("Δ = taxPaid - τ for each parent", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 100000,
        taxPaid: 20000,
        birthYear: 1990,
        disability: null,
      },
      parentB: {
        incomeAnnual: 100000,
        taxPaid: 20000,
        birthYear: 1990,
        disability: null,
      },
      rates: { lower: 0.2, higher: 0.3 },
      childCount: 3,
      depCount: 0,
    });
    expect(r.Δ_A).toBeCloseTo(20000 - r.τ_A);
    expect(r.Δ_B).toBeCloseTo(20000 - r.τ_B);
  });

  it("large income difference → all deduction to higher earner", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 64000,
        taxPaid: 12000,
        birthYear: 1985,
        disability: null,
      },
      parentB: {
        incomeAnnual: 9600,
        taxPaid: 100,
        birthYear: 1988,
        disability: null,
      },
      rates: { lower: 0.23, higher: 0.33 },
      childCount: 2,
      depCount: 1,
    });
    expect(r.x_star).toBeCloseTo(r.D);
    expect(r.T_B).toBeGreaterThan(0);
  });

  it("parent A with partial disability", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 16000,
        taxPaid: 600,
        birthYear: 1980,
        disability: "partial",
      },
      parentB: {
        incomeAnnual: 22400,
        taxPaid: 1800,
        birthYear: 1982,
        disability: null,
      },
      rates: { lower: 0.2, higher: 0.3 },
      childCount: 2,
      depCount: 0,
    });
    expect(r.F_A).toBeCloseTo(9360);
    expect(r.F_B).toBeCloseTo(7200);
  });

  it("Zagreb, high incomes, 5 children", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 80000,
        taxPaid: 18000,
        birthYear: 1983,
        disability: null,
      },
      parentB: {
        incomeAnnual: 48000,
        taxPaid: 6000,
        birthYear: 1986,
        disability: null,
      },
      rates: { lower: 0.23, higher: 0.33 },
      childCount: 5,
      depCount: 0,
    });
    expect(r.D).toBeCloseTo(39600);
    expect(r.allocation.every((a) => a.fractionA === 1)).toBe(true);
  });
});

describe("distribute() — greedy allocation", () => {
  it("sum of fractions × coefficients ≈ x*", () => {
    const coeffs = [0.5, 0.7, 1.0];
    const xStar = 8640;
    const fracs = distribute(xStar, coeffs);
    const actual = fracs.reduce((s, f, i) => s + f * coeffs[i] * 7200, 0);
    expect(actual).toBeCloseTo(xStar, -3);
  });

  it.each([0, 5000, 10000, 20000, 25920])(
    "x=%i: all fractions are in [0, 1]",
    (x) => {
      const coeffs = [0.5, 0.7, 1.0, 1.4];
      const fracs = distribute(x, coeffs);
      for (const f of fracs) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    },
  );
});

describe("correct() — rounding correction", () => {
  it("H after correction ≤ H before correction", () => {
    const coeffs = [0.5, 0.7];
    const a = 800;
    const b = 1600;
    const D = 8640;
    const rLA = 0.2;
    const rLB = 0.2;
    const rH = 0.3;
    const hFn = (f) => {
      const xA = f.reduce((s, frac, i) => s + frac * coeffs[i] * 7200, 0);
      return H(xA, a, b, D, rLA, rLB, rH);
    };
    const initial = distribute(7040, coeffs);
    const corrected = correct(initial, coeffs, hFn);
    expect(hFn(corrected)).toBeLessThanOrEqual(hFn(initial));
  });
});

describe("optimality property", () => {
  it("H(x*) ≤ H(x) for 1000 random x ∈ [0, D]", () => {
    const r = solve({
      parentA: {
        incomeAnnual: 36000,
        taxPaid: 3000,
        birthYear: 1987,
        disability: null,
      },
      parentB: {
        incomeAnnual: 17600,
        taxPaid: 800,
        birthYear: 1997,
        disability: null,
      },
      rates: { lower: 0.22, higher: 0.32 },
      childCount: 3,
      depCount: 1,
    });
    const rLA = r_L(1987, 0.22);
    const rLB = r_L(1997, 0.22);
    const rH = 0.32;

    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * r.D;
      const Hx = H(x, r.a, r.b, r.D, rLA, rLB, rH);
      expect(Hx).toBeGreaterThanOrEqual(r.H_min - 0.01);
    }
  });
});
