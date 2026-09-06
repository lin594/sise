export interface GameTimingConfig {
  botThinkMinMs: number;
  botThinkMaxMs: number;
  botCollectiveThinkMinMs: number;
  botCollectiveThinkMaxMs: number;
  localTransitionDelayMs: number;
}

type Environment = Readonly<Record<string, string | undefined>>;
type Warn = (message: string) => void;

function readDuration(
  env: Environment,
  name: string,
  fallback: number,
  productionMaximum: number,
  warn: Warn,
  legacyName?: string,
): number {
  const raw = env[name] ?? (legacyName ? env[legacyName] : undefined);
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    warn(`[game-timing] Ignoring invalid ${name}=${JSON.stringify(raw)}; using ${fallback}ms.`);
    return fallback;
  }
  const value = Math.trunc(parsed);
  if (env.NODE_ENV === "production" && value > productionMaximum) {
    warn(
      `[game-timing] Ignoring excessive ${name}=${value}ms in production; using ${fallback}ms ` +
      `to avoid an unresponsive table.`,
    );
    return fallback;
  }
  return value;
}

export function resolveGameTimingConfig(
  env: Environment = process.env,
  warn: Warn = console.warn,
): GameTimingConfig {
  const botThinkMinMs = readDuration(env, "BOT_THINK_MIN_MS", 450, 1_200, warn, "BOT_THINK_MS");
  const configuredBotThinkMaxMs = readDuration(env, "BOT_THINK_MAX_MS", 850, 1_500, warn);
  const botCollectiveThinkMinMs = readDuration(env, "BOT_COLLECTIVE_THINK_MIN_MS", 80, 350, warn);
  const configuredBotCollectiveThinkMaxMs = readDuration(
    env,
    "BOT_COLLECTIVE_THINK_MAX_MS",
    180,
    500,
    warn,
  );
  return {
    botThinkMinMs,
    botThinkMaxMs: Math.max(botThinkMinMs, configuredBotThinkMaxMs),
    botCollectiveThinkMinMs,
    botCollectiveThinkMaxMs: Math.max(botCollectiveThinkMinMs, configuredBotCollectiveThinkMaxMs),
    localTransitionDelayMs: readDuration(env, "LOCAL_TRANSITION_DELAY_MS", 250, 1_000, warn),
  };
}

export const GAME_TIMING_CONFIG = resolveGameTimingConfig();
