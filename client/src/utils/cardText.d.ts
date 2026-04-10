import type { Card } from "@/types/game";
export declare function getCardFaceText(card: Pick<Card, "color" | "type">): string;
export declare function getCardColorText(card: Pick<Card, "color">): string;
export declare function getCardLabelText(card: Pick<Card, "color" | "type">): string;
