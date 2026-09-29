// REQ-DP-04: chọn image cần dọn — docs/10-design/deployment.md#dọn-image
// images: [{ id, created }]; usedImageIds: image của mọi container (chạy hay dừng).
function imagesToRemove(images, { baseImageId, usedImageIds, now, retentionMs }) {
  const used = new Set(usedImageIds);
  return images
    .filter((img) => img.id !== baseImageId && !used.has(img.id))
    .filter((img) => now - Date.parse(img.created) > retentionMs)
    .map((img) => img.id);
}

// Chạy trong `cli.js purge` (vmu-purge.timer, hằng ngày). Lỗi xóa một image (vd đang bị image khác phụ thuộc) không chặn các image còn lại.
async function pruneImages({ docker, cfg, clock }) {
  const [images, usedImageIds, baseImageId] = await Promise.all([docker.listImages(), docker.usedImageIds(), docker.imageId(cfg.baseImage)]);
  let removed = 0;
  for (const id of imagesToRemove(images, { baseImageId, usedImageIds, now: clock.now().getTime(), retentionMs: cfg.imageRetentionMs })) {
    try {
      await docker.removeImage(id);
      removed += 1;
    } catch (e) {
      console.error(`không xóa được image ${id}: ${e.message}`);
    }
  }
  return removed;
}

module.exports = { imagesToRemove, pruneImages };
