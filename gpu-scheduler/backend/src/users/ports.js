// REQ-US-09
function portRange(slotIndex, cfg) {
  if (!slotIndex) return null;
  const from = cfg.portBase + cfg.portRangeSize * (slotIndex - 1);
  return { from, to: from + cfg.portRangeSize - 1 };
}

module.exports = { portRange };
