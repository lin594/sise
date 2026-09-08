import type { SkinId, TableLayoutId } from "@/types/game";
export const skins: { id: SkinId; name: string; description: string }[] = [
  { id: "cyber-minimal", name: "赛博极简", description: "深夜蓝 · 清晰利落" },
  { id: "licheng-water", name: "荔城水乡", description: "古荔映溪 · 一局闲趣" },
  { id: "puxian-house", name: "莆仙古厝", description: "红砖燕脊 · 围桌相聚" },
  { id: "meizhou-sea", name: "湄洲海韵", description: "帆影潮声 · 海风入席" },
];
export const tableLayouts: { id: TableLayoutId; name: string; description: string }[] = [
  { id: "compact", name: "紧凑布局", description: "紧凑分区，适合小屏" },
];
export const normalizeSkin = (value: unknown): SkinId => skins.find(item => item.id === value)?.id ?? "cyber-minimal";
export const normalizeTableLayout = (value: unknown): TableLayoutId => tableLayouts.find(item => item.id === value)?.id ?? "compact";
