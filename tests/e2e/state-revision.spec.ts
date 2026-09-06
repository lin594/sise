import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("newer room revisions win and same revisions only enrich private state", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  await expect.poll(async () => {
    const layoutClass = await page.locator("main.layout").getAttribute("class");
    if (layoutClass?.split(/\s+/u).includes("playing")) return "playing";
    const declaration = page.getByTestId("confirm-declaration");
    if (await declaration.isVisible().catch(() => false) && await declaration.isEnabled()) {
      await declaration.click();
    }
    return "waiting";
  }, { timeout: 20_000 }).toBe("playing");
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
        totalMs: 30_000,
        endsAt: Date.now() + 30_000,
        decisionKey: "same-revision-private-update",
      },
    }, "explicit");
    bridge.applyRoomSnapshot({
      stateRevision: baseRevision + 3,
      phase: "playing",
      lastAction: "REVISION_NEW",
      deckCount: Number(initial.deckCount) + 1,
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
      expectedFinalRevision: baseRevision + 3,
      deckCount: finalState.deckCount,
      expectedDeckCount: Number(initial.deckCount) + 1,
      playerIds: finalState.players.map((player: { clientId: string }) => player.clientId),
      sortedPlayerIds: sortedPlayers.map((player: { clientId: string }) => player.clientId),
      decisionKey: bridge.getDecisionTimer().decisionKey,
    };
  });

  expect(result).toMatchObject({
    phase: "playing",
    lastAction: "REVISION_NEW",
    storedRevision: result.expectedFinalRevision,
    deckCount: result.expectedDeckCount,
    playerIds: result.sortedPlayerIds,
    decisionKey: "same-revision-private-update",
  });
});
