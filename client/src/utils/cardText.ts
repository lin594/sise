import type { Card } from "@/types/game";

const COLOR_LABEL_MAP: Record<string, string> = {
  red: "红",
  yellow: "黄",
  green: "绿",
  white: "白",
  gold: "金",
};

const DEFAULT_FACE_MAP: Record<string, string> = {
  jiang: "将",
  shi: "士",
  xiang: "象",
  ju: "车",
  ma: "马",
  pao: "炮",
  zu: "卒",
  gong: "公",
  hou: "侯",
  bo: "伯",
  zi: "子",
  nan: "男",
};

const DEFAULT_LABEL_MAP: Record<string, string> = {
  ...DEFAULT_FACE_MAP,
  gong: "条",
};

const NORTH_FACE_MAP: Record<string, string> = {
  jiang: "將",
  shi: "士",
  xiang: "象",
  ju: "車",
  ma: "馬",
  pao: "包",
  zu: "卒",
};

const SOUTH_FACE_MAP: Record<string, string> = {
  jiang: "帥",
  shi: "仕",
  xiang: "相",
  ju: "俥",
  ma: "傌",
  pao: "炮",
  zu: "兵",
};

function faceMapForColor(color: string): Record<string, string> {
  if (color === "green" || color === "white") {
    return NORTH_FACE_MAP;
  }
  if (color === "red" || color === "yellow") {
    return SOUTH_FACE_MAP;
  }
  return DEFAULT_FACE_MAP;
}

export function getCardFaceText(card: Pick<Card, "color" | "type">): string {
  const faceMap = faceMapForColor(card.color);
  return faceMap[card.type] ?? DEFAULT_FACE_MAP[card.type] ?? card.type;
}

export function getCardColorText(card: Pick<Card, "color">): string {
  if (card.color === "gold") {
    return "";
  }
  return COLOR_LABEL_MAP[card.color] ?? card.color;
}

export function getCardLabelText(card: Pick<Card, "color" | "type">): string {
  const faceMap = faceMapForColor(card.color);
  const labelFace = faceMap[card.type] ?? DEFAULT_LABEL_MAP[card.type] ?? card.type;
  const color = getCardColorText(card);
  return `${color}${labelFace}`;
}
