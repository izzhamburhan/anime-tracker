function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinchRatio(hand) {
  const fingertipGap = distance(hand[4], hand[8]);
  const palmLength = Math.max(.001, distance(hand[0], hand[9]));
  return fingertipGap / palmLength;
}

export function advancePinchGesture(machine, now, landmarks, options = {}) {
  const enabled = options.enabled ?? true;
  const holdMs = options.holdMs ?? 300;
  const closeThreshold = options.closeThreshold ?? .3;
  const releaseThreshold = options.releaseThreshold ?? .46;

  if (!enabled || landmarks.length < 2) {
    machine.pinchStarted = 0;
    machine.pinchLatched = false;
    return { triggered: false, progress: 0 };
  }

  const ratios = landmarks.slice(0, 2).map(pinchRatio);
  const bothPinched = ratios.every((ratio) => ratio < closeThreshold);
  const bothReleased = ratios.every((ratio) => ratio > releaseThreshold);

  if (bothReleased) {
    machine.pinchStarted = 0;
    machine.pinchLatched = false;
    return { triggered: false, progress: 0 };
  }

  if (!bothPinched) {
    if (!machine.pinchLatched) machine.pinchStarted = 0;
    return { triggered: false, progress: 0 };
  }

  if (machine.pinchLatched) return { triggered: false, progress: 0 };
  if (!machine.pinchStarted) machine.pinchStarted = now;
  const progress = Math.min(1, (now - machine.pinchStarted) / holdMs);
  if (progress < 1) return { triggered: false, progress };

  machine.pinchStarted = 0;
  machine.pinchLatched = true;
  return { triggered: true, progress: 0 };
}
