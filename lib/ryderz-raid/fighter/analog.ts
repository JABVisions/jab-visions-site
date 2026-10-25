/** Radial dead zone with a continuous response from rest to full deflection. */
export function analogStick(x: number, y: number, deadzone: number, exponent = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const magnitude = Math.hypot(x, y);
  const threshold = Math.max(0, Math.min(0.95, deadzone));
  if (magnitude <= threshold) return { x: 0, y: 0 };
  const response = Math.pow(Math.min(1, (magnitude - threshold) / (1 - threshold)), exponent);
  return { x: (x / magnitude) * response, y: (y / magnitude) * response };
}
