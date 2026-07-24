export const LAYOUT = Object.freeze({
  originX: 90,
  originY: 70,
  depthGap: 282,
  rowGap: 120,
  nodeWidth: 224,
  nodeHeight: 100,
  margin: 72,
});

export function layoutTree(tree, options = {}) {
  const config = { ...LAYOUT, ...options };
  const positions = new Map();
  let nextRow = 0;

  function place(id, depth) {
    const children = tree.childrenById.get(id) ?? [];
    let y;
    if (!children.length) {
      y = config.originY + nextRow++ * config.rowGap;
    } else {
      const childYs = children.map((child) => place(child.id, depth + 1));
      y = (childYs[0] + childYs.at(-1)) / 2;
    }
    positions.set(id, {
      id,
      depth,
      x: config.originX + depth * config.depthGap,
      y,
    });
    return y;
  }

  place(tree.rootId, 0);
  const values = [...positions.values()];
  return Object.freeze({
    positions,
    width: Math.max(...values.map((point) => point.x)) + config.nodeWidth + config.margin,
    height: Math.max(...values.map((point) => point.y)) + config.nodeHeight + config.margin,
    config,
  });
}

export function visibleFeatureIds(tree, expandedIds) {
  const visible = new Set([tree.rootId]);
  const walk = (id) => {
    if (!expandedIds.has(id)) return;
    for (const child of tree.childrenById.get(id) ?? []) {
      visible.add(child.id);
      walk(child.id);
    }
  };
  walk(tree.rootId);
  return visible;
}

export function ancestorIds(tree, id) {
  const ancestors = [];
  let cursor = tree.byId.get(id);
  while (cursor?.parent_id) {
    ancestors.unshift(cursor.parent_id);
    cursor = tree.byId.get(cursor.parent_id);
  }
  return ancestors;
}

export function boundsForIds(layout, ids) {
  const points = [...ids].map((id) => layout.positions.get(id)).filter(Boolean);
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  const { nodeWidth, nodeHeight, margin } = layout.config;
  const minX = Math.min(...points.map((point) => point.x)) - margin;
  const minY = Math.min(...points.map((point) => point.y)) - margin;
  const maxX = Math.max(...points.map((point) => point.x + nodeWidth)) + margin;
  const maxY = Math.max(...points.map((point) => point.y + nodeHeight)) + margin;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
