import type { SkinId, TableLayoutId, RenderedTableLayoutId } from "@/types/game";
export const skins: { id: SkinId; name: string; description: string }[] = [
  { id: "cyber-minimal", name: "赛博极简", description: "深夜蓝调" },
  { id: "licheng-water", name: "荔城水乡", description: "古荔映溪" },
  { id: "puxian-house", name: "莆仙古厝", description: "红砖燕脊" },
  { id: "meizhou-sea", name: "湄洲海韵", description: "帆影潮声" },
];
export const tableLayouts: { id: TableLayoutId; name: string; description: string }[] = [
  { id: "adaptive", name: "自适应布局", description: "随屏幕调整" },
  { id: "compact", name: "紧凑布局", description: "紧凑分区，适合小屏" },
  { id: "classic", name: "经典布局", description: "围桌而坐，中央开阔" },
];
export const normalizeSkin = (value: unknown): SkinId => skins.find(item => item.id === value)?.id ?? "puxian-house";
export const normalizeTableLayout = (value: unknown): TableLayoutId => tableLayouts.find(item => item.id === value)?.id ?? "adaptive";

export const resolveTableLayout = (layout: TableLayoutId, ultraCompact: boolean): RenderedTableLayoutId => layout === "adaptive" ? ultraCompact ? "compact" : "classic" : layout;
