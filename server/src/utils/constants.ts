// Game constants
export const COLORS = {
  YELLOW: 'yellow',
  RED: 'red',
  GREEN: 'green',
  WHITE: 'white',
  GOLD: 'gold'
} as const;

export const RANKS = {
  JIANG: '将',  // General
  SHI: '士',    // Advisor
  XIANG: '象',  // Elephant
  CHE: '车',    // Chariot
  MA: '马',     // Horse
  PAO: '炮',    // Cannon
  ZU: '卒'      // Soldier
} as const;

export const GOLD_BARS = ['公', '侯', '伯', '子', '男'] as const;

export const PHASES = {
  WAITING: 'waiting',
  DECLARING: 'declaring',
  PLAYING: 'playing',
  ENDED: 'ended'
} as const;

export const RESPONSE_PHASES = {
  COLLECTIVE: 'collective',  // Collective inquiry (Hu/Kai/Peng)
  SELF_MODE1: 'self_mode1', // Self turn mode 1 (initial card)
  SELF_MODE2: 'self_mode2'  // Self turn mode 2 (drawn card)
} as const;

export const ACTIONS = {
  HU: 'hu',        // Win
  KAI: 'kai',      // Open (dark kong + 4th card)
  PENG: 'peng',    // Pong (3 same cards)
  CHI: 'chi',      // Chow (eat - form combinations)
  GRAB: 'grab',    // Draw card
  PASS: 'pass',    // Pass
  DISCARD: 'discard' // Discard
} as const;

// Response timeout in seconds
export const RESPONSE_TIMEOUT = 15;

// Card counts
export const TOTAL_CARDS = 117;
export const HAND_SIZE_DEALER = 21;
export const HAND_SIZE_NORMAL = 20;
