export const PAN_THRESHOLD_PX = 6;

export function exceedsPanThreshold(start, current, threshold = PAN_THRESHOLD_PX) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function translatedViewport(origin, delta) {
  return Object.freeze({
    translateX: origin.translateX + delta.x,
    translateY: origin.translateY + delta.y,
  });
}
