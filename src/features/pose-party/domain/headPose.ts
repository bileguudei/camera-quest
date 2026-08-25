export interface HeadPose {
  /** Nodding up/down, in radians. */
  pitch: number;
  /** Turning left/right, in radians. */
  yaw: number;
  /** Tilting toward either shoulder, in radians. */
  roll: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Extracts XYZ Euler rotation from MediaPipe's column-major 4x4 face matrix.
 * Translation and scale are intentionally ignored: head challenges should be
 * stable when a player moves slightly closer to the camera.
 */
export function headPoseFromMatrix(data: readonly number[]): HeadPose | null {
  if (data.length < 16 || data.some((value) => !Number.isFinite(value))) return null;

  const m11 = data[0] ?? 1;
  const m12 = data[4] ?? 0;
  const m13 = data[8] ?? 0;
  const m22 = data[5] ?? 1;
  const m23 = data[9] ?? 0;
  const m32 = data[6] ?? 0;
  const m33 = data[10] ?? 1;

  const yaw = Math.asin(clamp(m13, -1, 1));
  const gimbalLock = Math.abs(m13) >= 0.999_999_9;
  const pitch = gimbalLock ? Math.atan2(m32, m22) : Math.atan2(-m23, m33);
  const roll = gimbalLock ? 0 : Math.atan2(-m12, m11);

  return { pitch, yaw, roll };
}
