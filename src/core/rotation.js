// 3-vectors and unit quaternions [w, x, y, z] (Hamilton convention).
// A body-to-world quaternion q rotates body vectors into the world frame.

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
  },
  hat: (a) => [[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]],
  vee: (M) => [M[2][1], M[0][2], M[1][0]],
};

export const quat = {
  identity: () => [1, 0, 0, 0],
  mul: (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ],
  conj: (q) => [q[0], -q[1], -q[2], -q[3]],
  norm: (q) => Math.hypot(q[0], q[1], q[2], q[3]),
  normalize: (q) => {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  },
  // rotate vector v by q (body -> world)
  rotate: (q, v) => {
    const w = q[0], x = q[1], y = q[2], z = q[3];
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx),
    ];
  },
  // rotate vector v by q^-1 (world -> body)
  rotateInv: (q, v) => quat.rotate([q[0], -q[1], -q[2], -q[3]], v),
  fromAxisAngle: (axis, angle) => {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const s = Math.sin(angle / 2) / n;
    return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
  },
  // ZYX (yaw-pitch-roll) Euler angles, aerospace convention
  fromEuler: (roll, pitch, yaw) => {
    const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
    const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    return [
      cr * cp * cy + sr * sp * sy,
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
    ];
  },
  toEuler: (q) => {
    const [w, x, y, z] = q;
    const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const sp = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
    const pitch = Math.asin(sp);
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    return [roll, pitch, yaw];
  },
  toMatrix: (q) => {
    const [w, x, y, z] = q;
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
  },
  fromMatrix: (R) => {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let w, x, y, z;
    if (tr > 0) {
      const S = Math.sqrt(tr + 1) * 2;
      w = 0.25 * S; x = (R[2][1] - R[1][2]) / S; y = (R[0][2] - R[2][0]) / S; z = (R[1][0] - R[0][1]) / S;
    } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
      const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
      w = (R[2][1] - R[1][2]) / S; x = 0.25 * S; y = (R[0][1] + R[1][0]) / S; z = (R[0][2] + R[2][0]) / S;
    } else if (R[1][1] > R[2][2]) {
      const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
      w = (R[0][2] - R[2][0]) / S; x = (R[0][1] + R[1][0]) / S; y = 0.25 * S; z = (R[1][2] + R[2][1]) / S;
    } else {
      const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
      w = (R[1][0] - R[0][1]) / S; x = (R[0][2] + R[2][0]) / S; y = (R[1][2] + R[2][1]) / S; z = 0.25 * S;
    }
    return quat.normalize([w, x, y, z]);
  },
  // Error rotation taking q to qRef, expressed in the body frame of q:
  // qe = q^-1 ⊗ qRef, sign-fixed to the short way round.
  error: (q, qRef) => {
    const e = quat.mul(quat.conj(q), qRef);
    return e[0] < 0 ? [-e[0], -e[1], -e[2], -e[3]] : e;
  },
  // Rotation vector (axis * angle) of a unit quaternion
  toRotVec: (q) => {
    let [w, x, y, z] = q;
    if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const s = Math.hypot(x, y, z);
    if (s < 1e-9) return [2 * x, 2 * y, 2 * z];
    const ang = 2 * Math.atan2(s, w);
    return [(x / s) * ang, (y / s) * ang, (z / s) * ang];
  },
  slerp: (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    if (d > 0.9995) return quat.normalize(a.map((x, i) => x + t * (bb[i] - x)));
    const th = Math.acos(d), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((x, i) => wa * x + wb * bb[i]);
  },
  // Angle between two orientations [rad]
  angle: (a, b) => {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
  },
};
