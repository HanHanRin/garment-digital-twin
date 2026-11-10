export const STATUS = {
  running: { label: '运行中', color: '#158568' },
  idle: { label: '空闲', color: '#a3acb3' },
  fault: { label: '故障', color: '#e87146' },
  offline: { label: '离线', color: '#8b83be' },
};

export function makeReplay(rows, assetIds, interval = 5, duration = 600) {
  const frames = new Map();
  for (const row of rows) {
    if (!frames.has(row.sim_time_s)) frames.set(row.sim_time_s, new Map());
    frames.get(row.sim_time_s).set(row.asset_id, row);
  }
  for (let t = 0; t <= duration; t += interval) {
    if (!frames.has(t) || assetIds.some(id => !frames.get(t).has(id))) {
      throw new Error(`回放数据不完整：${t}s`);
    }
  }
  return {
    frame(time) {
      const t = Math.floor(Math.max(0, Math.min(duration, time)) / interval) * interval;
      return frames.get(t);
    },
    history(id, time, window = 120) {
      const end = Math.floor(Math.max(0, Math.min(duration, time)) / interval) * interval;
      const start = Math.max(0, end - window);
      const result = [];
      for (let t = start; t <= end; t += interval) result.push(frames.get(t).get(id));
      return result;
    },
  };
}

export function clockText(time) {
  const secs = Math.floor(time);
  return `09:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

export function elapsedText(time) {
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time) % 60).padStart(2, '0')}`;
}

export function matchesAsset(asset, catalog, snapshot, { query = '', status = 'all', zone = 'all' }) {
  const text = `${asset.asset_id} ${asset.label} ${catalog.model_reference} ${catalog.category_name}`.toLowerCase();
  return text.includes(query.trim().toLowerCase()) &&
    (status === 'all' || snapshot.status === status) && (zone === 'all' || asset.zone_id === zone);
}
