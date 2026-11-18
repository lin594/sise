import type { Card } from "@/types/game";

export function exampleCards(color: string, types: string[]): Card[] {
  return types.map((type, index) => ({ id: `example-${color}-${type}-${index}`, color, type }));
}

export const meldExamples = {
  jmp: exampleCards("red", ["ju", "ma", "pao"]),
  jsx: exampleCards("green", ["jiang", "shi", "xiang"]),
  zu3: ["red", "green", "yellow"].map(color => ({ id: `example-${color}-zu`, color, type: "zu" })),
};
