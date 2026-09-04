import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("newer room revisions win and same revisions only enrich private state", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  const result = await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: {
        getRoomState: () => any;
        getDecisionTimer: () => any;
        applyRoomSnapshot: (patch: Record<string, unknown>, source?: "schema" | "explicit") => void;
      };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    const initial = bridge.getRoomState();
    const baseRevision = Number(initial.stateRevision);
    const sortedPlayers = [...initial.players].sort(
      (left, right) => left.seatIndex - right.seatIndex || left.clientId.localeCompare(right.clientId),
    );
    bridge.applyRoomSnapshot({
      stateRevision: baseRevision + 2,
      phase: "playing",
      lastAction: "REVISION_NEW",
      players: [...sortedPlayers].reverse(),
    }, "explicit");
    bridge.applyRoomSnapshot({
      stateRevision: baseRevision + 2,
      phase: "declaring",
      lastAction: "SAME_REVISION_MUST_NOT_REPLACE",
      decisionTimer: {
        untimed: false,
        canRequestMoreTime: true,
        extensionSeconds: 20,
        totalMs: 30_000,
        endsAt: Date.now() + 30_000,
        decisionKey: "same-revision-private-update",
      },
    }, "explicit");
    bridge.applyRoomSnapshot({
      stateRevision: baseRevision + 3,
      phase: "playing",
      lastAction: "REVISION_NEW",
      players: sortedPlayers,
    }, "schema");
    bridge.applyRoomSnapshot({
      stateRevision: baseRevision + 1,
      phase: "declaring",
      lastAction: "LATE_SCHEMA_MUST_NOT_REPLACE",
      players: [...sortedPlayers].reverse(),
    }, "schema");
    const finalState = bridge.getRoomState();
    return {
      phase: finalState.phase,
      lastAction: finalState.lastAction,
      storedRevision: finalState.stateRevision,
      expectedVisibleRevision: baseRevision + 2,
      playerIds: finalState.players.map((player: { clientId: string }) => player.clientId),
      sortedPlayerIds: sortedPlayers.map((player: { clientId: string }) => player.clientId),
      decisionKey: bridge.getDecisionTimer().decisionKey,
    };
  });

  expect(result).toMatchObject({
    phase: "playing",
    lastAction: "REVISION_NEW",
    storedRevision: result.expectedVisibleRevision,
    playerIds: result.sortedPlayerIds,
    decisionKey: "same-revision-private-update",
  });
});
