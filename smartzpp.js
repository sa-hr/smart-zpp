const B = 7200

const K = [0.5, 0.7, 1.0, 1.4, 1.9, 2.5, 3.2, 4.0, 4.9]

function k(n) {
  if (n <= 0) return 0
  if (n <= K.length) return K[n - 1]
  let c = K[K.length - 1]
  for (let i = K.length + 1; i <= n; i++) c += i * 0.1
  return Math.round(c * 10) / 10
}

function r_L(birthYear, r_L_municipal, taxYear = 2025) {
  const age = taxYear - birthYear
  if (age <= 25) return 0
  if (age <= 30) return r_L_municipal * 0.5
  return r_L_municipal
}

function τ(T, r_L, r_H) {
  if (T <= 0) return 0
  if (T <= 60000) return T * r_L
  return 60000 * r_L + (T - 60000) * r_H
}

function H(x, a, b, D, r_LA, r_LB, r_H) {
  const T_A = Math.max(0, a - x)
  const T_B = Math.max(0, b - (D - x))
  return τ(T_A, r_LA, r_H) + τ(T_B, r_LB, r_H)
}

function C(a, b, D) {
  return [
    { x: 0, label: "x_0" },
    { x: a - 60000, label: "x_1" },
    { x: a, label: "x_2" },
    { x: D - b, label: "x_3" },
    { x: D - b + 60000, label: "x_4" },
    { x: D, label: "x_5" },
  ]
    .map((c) => ({ ...c, x: Math.max(0, Math.min(D, c.x)) }))
    .filter((c) => c.x >= 0 && c.x <= D)
}

export function solve({ parentA, parentB, rates, childCount, depCount }) {
  const coefficients = [
    ...Array.from({ length: childCount }, (_, i) => k(i + 1)),
    ...Array(depCount).fill(0.5),
  ]

  const D = coefficients.reduce((s, c) => s + c * B, 0)

  const I_A = parentA.incomeAnnual
  const I_B = parentB.incomeAnnual

  const d_A = parentA.disability === "full" ? B : parentA.disability === "partial" ? 0.3 * B : 0
  const d_B = parentB.disability === "full" ? B : parentB.disability === "partial" ? 0.3 * B : 0

  const F_A = B + d_A
  const F_B = B + d_B

  const a = Math.max(0, I_A - F_A)
  const b = Math.max(0, I_B - F_B)

  const r_LA = r_L(parentA.birthYear, rates.lower)
  const r_LB = r_L(parentB.birthYear, rates.lower)
  const r_H = rates.higher

  const candidates = C(a, b, D).map((c) => ({
    ...c,
    H: H(c.x, a, b, D, r_LA, r_LB, r_H),
  }))

  const x_star = candidates.reduce((a, b) => (a.H < b.H ? a : b))

  const allocation = distribute(x_star.x, coefficients)

  const corrected = correct(allocation, coefficients, (f) => {
    const xA = f.reduce((s, frac, i) => s + frac * coefficients[i] * B, 0)
    return H(xA, a, b, D, r_LA, r_LB, r_H)
  })

  const xA = corrected.reduce((s, frac, i) => s + frac * coefficients[i] * B, 0)
  const T_A = Math.max(0, a - xA)
  const T_B = Math.max(0, b - (D - xA))

  return {
    x_star: x_star.x,
    D,
    a,
    b,
    H_min: τ(T_A, r_LA, r_H) + τ(T_B, r_LB, r_H),
    τ_A: τ(T_A, r_LA, r_H),
    τ_B: τ(T_B, r_LB, r_H),
    Δ_A: parentA.taxPaid - τ(T_A, r_LA, r_H),
    Δ_B: parentB.taxPaid - τ(T_B, r_LB, r_H),
    T_A,
    T_B,
    F_A,
    F_B,
    allocation: corrected.map((f, i) => ({
      index: i,
      coefficient: coefficients[i],
      fractionA: f,
    })),
    candidates,
  }
}

function distribute(x_star, coefficients) {
  const indexed = coefficients
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c - a.c)

  const fractions = new Array(coefficients.length).fill(0)
  let remaining = x_star

  for (const { c, i } of indexed) {
    const δ = c * B
    const raw = δ > 0 ? Math.min(1, remaining / δ) : 0
    fractions[i] = Math.round(raw * 100) / 100
    remaining -= fractions[i] * δ
    remaining = Math.max(0, remaining)
  }

  return fractions
}

function correct(fractions, coefficients, H_fn) {
  let best = [...fractions]
  let bestH = H_fn(fractions)

  for (let i = 0; i < fractions.length; i++) {
    for (const δ of [-0.01, 0.01]) {
      const f = Math.round((fractions[i] + δ) * 100) / 100
      if (f < 0 || f > 1) continue
      const trial = [...fractions]
      trial[i] = f
      const h = H_fn(trial)
      if (h < bestH) {
        bestH = h
        best = [...trial]
      }
    }
  }

  return best
}

export { k, r_L, τ, H, C, distribute, correct }
