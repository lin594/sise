import { startLobbyAction } from "./helpers/game";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

async function enterDebugPractice(page: Page): Promise<void> {
  await page.goto("/?e2eDebug=1");

  await startLobbyAction(page);
  await expect.poll(async () => {
    const layoutClass = await page.locator("main.layout").getAttribute("class");
    if (layoutClass?.split(/\s+/u).includes("playing")) return "playing";
    const confirm = page.getByTestId("confirm-declaration");
    if (await confirm.isVisible().catch(() => false) && await confirm.isEnabled().catch(() => false)) {
      await confirm.click();
    }
    return "waiting";
  }, { timeout: 20_000 }).toBe("playing");
}

async function setupLocalUpperChi(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("chi_local_upper"));
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult()))
    .toMatchObject({ scenario: "chi_local_upper", ok: true });
}

test("the local upper receiver always keeps the card centered while observers see its flow lane", async ({ page }) => {
  await enterDebugPractice(page);
  await setupLocalUpperChi(page);

  const board = page.getByTestId("game-board");
  await expect(board).toHaveAttribute("data-response-placement", "center");
  const fixture = await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const result = bridge.getLastResult();
    const players = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex);
    const selfId = document.querySelector<HTMLElement>("[data-testid='player-self']")!.dataset.playerId!;
    const selfIndex = players.findIndex((player) => player.clientId === selfId);
    const receiver = players[(selfIndex + 2) % players.length];
    const receiverIndex = players.findIndex((player) => player.clientId === receiver.clientId);
    const origin = players[(receiverIndex - 1 + players.length) % players.length];
    const responseCard = state.responseCard;
    const original = {
      currentPlayerId: state.currentPlayerId,
      currentTurnPlayerId: state.currentTurnPlayerId,
      previousPlayerId: state.previousPlayerId,
      pollOriginPlayerId: state.pollOriginPlayerId,
      actions: result.actions,
    };
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 10,
      responsePhase: "local_upper",
      currentPlayerId: receiver.clientId,
      currentTurnPlayerId: receiver.clientId,
      previousPlayerId: origin.clientId,
      pollOriginPlayerId: origin.clientId,
      responseCard,
      targetCard: responseCard,
      availableActions: [],
      decisionTimer: { ...bridge.getDecisionTimer(), decisionKey: "observer-local-upper" },
      tableTransitions: [],
    }, "explicit");
    return { responseId: responseCard.id, receiverId: receiver.clientId, original };
  });

  await expect(board).toHaveAttribute("data-response-placement", "flow");
  await expect(page.getByTestId("pending-card")).toHaveCount(0);
  await expect(page.locator(
    `.flow-card[data-flow-receiver-id="${fixture.receiverId}"] [data-face-id="${fixture.responseId}"]`,
  )).toBeVisible();

  await page.evaluate(({ original }) => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 1,
      responsePhase: "local_upper",
      currentPlayerId: original.currentPlayerId,
      currentTurnPlayerId: original.currentTurnPlayerId,
      previousPlayerId: original.previousPlayerId,
      pollOriginPlayerId: original.pollOriginPlayerId,
      availableActions: original.actions,
      presentationUntil: 0,
      decisionTimer: { ...bridge.getDecisionTimer(), decisionKey: "receiver-local-upper" },
      tableTransitions: [],
    }, "explicit");
  }, fixture);
  await expect(board).toHaveAttribute("data-response-placement", "center");
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.locator(`[data-face-id="${fixture.responseId}"]`)).toHaveCount(1);

  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 1,
      availableActions: [],
      presentationUntil: 0,
      decisionTimer: { ...bridge.getDecisionTimer(), decisionKey: "receiver-local-upper-no-chi" },
      tableTransitions: [],
    }, "explicit");
  });
  await expect(board).toHaveAttribute("data-response-placement", "center");
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.locator(`[data-face-id="${fixture.responseId}"]`)).toHaveCount(1);
});

test("a player's own discard stays centered without adding a waiting prompt", async ({ page }) => {
  await enterDebugPractice(page);
  await setupLocalUpperChi(page);
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const selfId = document.querySelector<HTMLElement>("[data-testid='player-self']")!.dataset.playerId!;
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 10,
      responsePhase: "collective",
      currentPlayerId: selfId,
      currentTurnPlayerId: selfId,
      previousPlayerId: selfId,
      pollOriginPlayerId: selfId,
      availableActions: [],
      decisionTimer: { ...bridge.getDecisionTimer(), decisionKey: "self-discard-collective" },
      tableTransitions: [],
    }, "explicit");
  });
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.getByTestId("decision-status")).toHaveText("等待其他玩家响应");
  await expect(page.locator(".action-dock .action-row")).toHaveCount(0);
  await expect(page.getByTestId("action-feedback")).toHaveCount(0);
});
