// Dense linear algebra for small systems (n <= ~30).
// Matrices are arrays of row arrays; vectors are plain arrays.

export const isMat = (A) => Array.isArray(A) && Array.isArray(A[0]);
export const isVec = (a) => (Array.isArray(a) || ArrayBuffer.isView(a)) && !Array.isArray(a[0]);

export function zeros(n, m = n) {
  const A = new Array(n);
  for (let i = 0; i < n; i++) A[i] = new Array(m).fill(0);
  return A;
}
export function eye(n) {
  const A = zeros(n, n);
  for (let i = 0; i < n; i++) A[i][i] = 1;
  return A;
}
export function diag(v) {
  if (isMat(v)) return v.map((row, i) => row[i]);
  const n = v.length, A = zeros(n, n);
  for (let i = 0; i < n; i++) A[i][i] = v[i];
  return A;
}
export function clone(A) {
  return isMat(A) ? A.map((r) => Array.from(r)) : Array.from(A);
}
export function size(A) {
  return isMat(A) ? [A.length, A[0].length] : [A.length];
}
export function transpose(A) {
  if (!isMat(A)) return A.map((x) => [x]); // column -> row handled by callers
  const n = A.length, m = A[0].length, T = zeros(m, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) T[j][i] = A[i][j];
  return T;
}
function ew(A, B, f) {
  if (typeof B === 'number') {
    return isMat(A) ? A.map((r) => r.map((x) => f(x, B))) : Array.from(A, (x) => f(x, B));
  }
  if (typeof A === 'number') {
    return isMat(B) ? B.map((r) => r.map((x) => f(A, x))) : Array.from(B, (x) => f(A, x));
  }
  if (isMat(A)) {
    if (A.length !== B.length || A[0].length !== B[0].length) throw new Error(`Size mismatch ${A.length}x${A[0].length} vs ${B.length}x${B[0].length}`);
    return A.map((r, i) => r.map((x, j) => f(x, B[i][j])));
  }
  if (A.length !== B.length) throw new Error(`Length mismatch ${A.length} vs ${B.length}`);
  return Array.from(A, (x, i) => f(x, B[i]));
}
export const add = (A, B) => ew(A, B, (a, b) => a + b);
export const sub = (A, B) => ew(A, B, (a, b) => a - b);
export const scale = (A, s) => ew(A, s, (a, b) => a * b);
export function mul(A, B) {
  if (typeof A === 'number' || typeof B === 'number') return scale(typeof A === 'number' ? B : A, typeof A === 'number' ? A : B);
  const aM = isMat(A), bM = isMat(B);
  if (aM && bM) {
    const n = A.length, k = A[0].length, m = B[0].length;
    if (B.length !== k) throw new Error(`mul: inner dimensions ${n}x${k} * ${B.length}x${m}`);
    const C = zeros(n, m);
    for (let i = 0; i < n; i++) {
      const Ai = A[i], Ci = C[i];
      for (let p = 0; p < k; p++) {
        const a = Ai[p];
        if (a === 0) continue;
        const Bp = B[p];
        for (let j = 0; j < m; j++) Ci[j] += a * Bp[j];
      }
    }
    return C;
  }
  if (aM && !bM) {
    if (A[0].length !== B.length) throw new Error(`mul: ${A.length}x${A[0].length} * vector(${B.length})`);
    return A.map((r) => {
      let s = 0;
      for (let j = 0; j < r.length; j++) s += r[j] * B[j];
      return s;
    });
  }
  if (!aM && bM) {
    if (A.length !== B.length) throw new Error(`mul: vector(${A.length}) * ${B.length}x${B[0].length}`);
    const m = B[0].length, out = new Array(m).fill(0);
    for (let i = 0; i < A.length; i++) for (let j = 0; j < m; j++) out[j] += A[i] * B[i][j];
    return out;
  }
  return dot(A, B);
}
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export function norm(a) {
  if (isMat(a)) {
    let s = 0;
    for (const r of a) for (const x of r) s += x * x;
    return Math.sqrt(s);
  }
  return Math.sqrt(dot(a, a));
}
export function norm1(A) {
  let best = 0;
  for (let j = 0; j < A[0].length; j++) {
    let s = 0;
    for (let i = 0; i < A.length; i++) s += Math.abs(A[i][j]);
    if (s > best) best = s;
  }
  return best;
}
export function normInf(A) {
  let best = 0;
  for (const r of A) {
    let s = 0;
    for (const x of r) s += Math.abs(x);
    if (s > best) best = s;
  }
  return best;
}
export function outer(a, b) {
  return a.map((x) => Array.from(b, (y) => x * y));
}
export function hstack(...Ms) {
  return Ms[0].map((_, i) => Ms.flatMap((M) => (isMat(M) ? M[i] : [M[i]])));
}
export function vstack(...Ms) {
  return Ms.flatMap((M) => (isMat(M) ? M.map((r) => Array.from(r)) : [Array.from(M)]));
}
export function block(rows) {
  return vstack(...rows.map((r) => hstack(...r)));
}
export function submat(A, r0, r1, c0, c1) {
  const out = [];
  for (let i = r0; i < r1; i++) out.push(A[i].slice(c0, c1));
  return out;
}
export function col(v) {
  return Array.from(v, (x) => [x]);
}
export function symmetrize(A) {
  return A.map((r, i) => r.map((x, j) => 0.5 * (x + A[j][i])));
}
export function trace(A) {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i][i];
  return s;
}

// LU decomposition with partial pivoting. Returns {LU, piv, sign, singular}
export function lu(A) {
  const n = A.length;
  const LU = clone(A);
  const piv = Array.from({ length: n }, (_, i) => i);
  let sign = 1, singular = false;
  const scaleRef = normInf(A) || 1;
  for (let k = 0; k < n; k++) {
    let p = k, big = Math.abs(LU[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(LU[i][k]);
      if (v > big) { big = v; p = i; }
    }
    if (!(big > 1e-300 * scaleRef) || !Number.isFinite(big)) { singular = true; continue; }
    if (p !== k) {
      [LU[p], LU[k]] = [LU[k], LU[p]];
      [piv[p], piv[k]] = [piv[k], piv[p]];
      sign = -sign;
    }
    const pivot = LU[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = (LU[i][k] /= pivot);
      if (f === 0) continue;
      const Li = LU[i], Lk = LU[k];
      for (let j = k + 1; j < n; j++) Li[j] -= f * Lk[j];
    }
  }
  return { LU, piv, sign, singular };
}
function luSolveVec(F, b) {
  const { LU, piv } = F, n = LU.length;
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = b[piv[i]];
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let j = 0; j < i; j++) s -= LU[i][j] * x[j];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= LU[i][j] * x[j];
    x[i] = s / LU[i][i];
  }
  return x;
}
export function solve(A, b) {
  const F = lu(A);
  if (F.singular) throw new Error('solve: matrix is singular');
  if (isMat(b)) {
    const m = b[0].length, out = zeros(A.length, m);
    for (let j = 0; j < m; j++) {
      const x = luSolveVec(F, b.map((r) => r[j]));
      for (let i = 0; i < x.length; i++) out[i][j] = x[i];
    }
    return out;
  }
  return luSolveVec(F, b);
}
export function inv(A) {
  const n = A.length;
  const F = lu(A);
  if (F.singular) throw new Error('inv: matrix is singular');
  const out = zeros(n, n);
  const e = new Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0);
    e[j] = 1;
    const x = luSolveVec(F, e);
    for (let i = 0; i < n; i++) out[i][j] = x[i];
  }
  return out;
}
export function det(A) {
  const F = lu(A);
  if (F.singular) return 0;
  let d = F.sign;
  for (let i = 0; i < A.length; i++) d *= F.LU[i][i];
  return d;
}
// log|det| (avoids overflow for scaling iterations)
export function logAbsDet(A) {
  const F = lu(A);
  if (F.singular) return -Infinity;
  let s = 0;
  for (let i = 0; i < A.length; i++) s += Math.log(Math.abs(F.LU[i][i]));
  return s;
}

// Numerical rank via Gaussian elimination with full pivoting.
export function rank(A, tol) {
  const M = clone(A);
  const n = M.length, m = M[0].length;
  const ref = Math.max(1e-300, ...M.map((r) => Math.max(...r.map(Math.abs))));
  const eps = tol ?? Math.max(n, m) * 1e-10 * ref;
  let r = 0;
  const usedCols = new Array(m).fill(false);
  for (let step = 0; step < Math.min(n, m); step++) {
    let bi = -1, bj = -1, big = 0;
    for (let i = r; i < n; i++) for (let j = 0; j < m; j++) {
      if (usedCols[j]) continue;
      const v = Math.abs(M[i][j]);
      if (v > big) { big = v; bi = i; bj = j; }
    }
    if (big <= eps) break;
    [M[r], M[bi]] = [M[bi], M[r]];
    usedCols[bj] = true;
    for (let i = r + 1; i < n; i++) {
      const f = M[i][bj] / M[r][bj];
      for (let j = 0; j < m; j++) M[i][j] -= f * M[r][j];
    }
    r++;
  }
  return r;
}

// Matrix exponential: scaling & squaring with Pade(6) approximant.
export function expm(A) {
  const n = A.length;
  const nrm = normInf(A);
  let s = 0;
  if (nrm > 0.5) s = Math.max(0, Math.ceil(Math.log2(nrm / 0.5)));
  const As = scale(A, 1 / Math.pow(2, s));
  const q = 6;
  let c = 0.5;
  let X = clone(As);
  let N = add(eye(n), scale(As, c));
  let D = sub(eye(n), scale(As, c));
  let positive = true;
  for (let k = 2; k <= q; k++) {
    c = (c * (q - k + 1)) / (k * (2 * q - k + 1));
    X = mul(As, X);
    const cX = scale(X, c);
    N = add(N, cX);
    D = positive ? add(D, cX) : sub(D, cX);
    positive = !positive;
  }
  let E = solve(D, N);
  for (let k = 0; k < s; k++) E = mul(E, E);
  return E;
}

// ---------------------------------------------------------------------------
// Eigenvalues of a general real matrix: balance -> Hessenberg -> shifted QR.
// Returns array of {re, im}, sorted by real part (descending).
export function eig(Ain) {
  const n = Ain.length;
  if (n === 0) return [];
  if (n === 1) return [{ re: Ain[0][0], im: 0 }];
  // 1-based working copy
  const a = [];
  for (let i = 0; i <= n; i++) a.push(new Array(n + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) a[i][j] = Ain[i - 1][j - 1];
  balance1(a, n);
  elmhes1(a, n);
  const wr = new Array(n + 1).fill(0), wi = new Array(n + 1).fill(0);
  hqr1(a, n, wr, wi);
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ re: wr[i], im: wi[i] });
  out.sort((p, q) => q.re - p.re || q.im - p.im);
  return out;
}
function balance1(a, n) {
  const RADIX = 2, sqrdx = RADIX * RADIX;
  let last = 0;
  let guard = 0;
  while (last === 0 && guard++ < 1000) {
    last = 1;
    for (let i = 1; i <= n; i++) {
      let r = 0, c = 0;
      for (let j = 1; j <= n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
      if (c && r) {
        let g = r / RADIX, f = 1;
        const s = c + r;
        while (c < g) { f *= RADIX; c *= sqrdx; }
        g = r * RADIX;
        while (c > g) { f /= RADIX; c /= sqrdx; }
        if ((c + r) / f < 0.95 * s) {
          last = 0;
          g = 1 / f;
          for (let j = 1; j <= n; j++) a[i][j] *= g;
          for (let j = 1; j <= n; j++) a[j][i] *= f;
        }
      }
    }
  }
}
function elmhes1(a, n) {
  for (let m = 2; m < n; m++) {
    let x = 0, i = m;
    for (let j = m; j <= n; j++) {
      if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
      for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
    }
    if (x) {
      for (i = m + 1; i <= n; i++) {
        let y = a[i][m - 1];
        if (y !== 0) {
          y /= x;
          a[i][m - 1] = y;
          for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j];
          for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i];
        }
      }
    }
  }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (i > j + 1) a[i][j] = 0;
}
const SIGN = (a, b) => (b >= 0 ? Math.abs(a) : -Math.abs(a));
function hqr1(a, n, wr, wi) {
  let nn, m, l, k, j, its, i, mmin;
  let z = 0, y = 0, x = 0, w = 0, v = 0, u = 0, t = 0, s = 0, r = 0, q = 0, p = 0;
  let anorm = 0;
  for (i = 1; i <= n; i++) for (j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  nn = n;
  t = 0;
  while (nn >= 1) {
    its = 0;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + SIGN(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eig: QR iteration did not converge');
          if (its === 10 || its === 20 || its === 40) {
            t += x;
            for (i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            if ((s = SIGN(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              mmin = nn < k + 3 ? nn : k + 3;
              for (i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
}

// Polynomial helpers ---------------------------------------------------------
// Coefficients (highest power first) of prod (s - r_i). Roots may be numbers,
// [re, im] pairs or {re, im}; complex roots must come in conjugate pairs.
export function poly(roots) {
  let c = [{ re: 1, im: 0 }];
  for (const r0 of roots) {
    const r = typeof r0 === 'number' ? { re: r0, im: 0 } : Array.isArray(r0) ? { re: r0[0], im: r0[1] || 0 } : { re: r0.re, im: r0.im || 0 };
    const next = new Array(c.length + 1).fill(0).map(() => ({ re: 0, im: 0 }));
    for (let i = 0; i < c.length; i++) {
      next[i].re += c[i].re;
      next[i].im += c[i].im;
      // - r * c[i]
      next[i + 1].re -= r.re * c[i].re - r.im * c[i].im;
      next[i + 1].im -= r.re * c[i].im + r.im * c[i].re;
    }
    c = next;
  }
  return c.map((z) => z.re);
}
export function polyvalm(coeffs, A) {
  const n = A.length;
  let P = zeros(n, n);
  for (const c of coeffs) P = add(mul(P, A), scale(eye(n), c));
  return P;
}
