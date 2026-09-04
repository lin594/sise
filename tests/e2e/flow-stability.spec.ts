import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("flow lanes keep seat relationships, DOM identity, and one animation per action", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await expect.poll(() => page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    if (!bridge) throw new Error("Local test bridge is unavailable");
    const result = bridge.getLastResult();
    if (result?.scenario !== "chi_local_upper" || !result.ok) {
      bridge.setupScenario("chi_local_upper");
    }
    return result;
  })).toMatchObject({ scenario: "chi_local_upper", ok: true });

  const setup = await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const sorted = [...state.players].sort(
      (left, right) => left.seatIndex - right.seatIndex || left.clientId.localeCompare(right.clientId),
    );
    const self = sorted.find((player) => player.connected && !player.isConfiguredBot) ?? sorted[0];
    const selfIndex = sorted.findIndex((player) => player.clientId === self.clientId);
    const ring = [...sorted.slice(selfIndex), ...sorted.slice(0, selfIndex)];
    const players = sorted.map((player, index) => ({
      ...player,
      discardPile: [{
        id: `stable-flow-${player.clientId}`,
        color: ["yellow", "red", "green", "white"][index % 4],
        type: "ju",
        source: "upper",
      }],
    }));
    const revision = Number(state.stateRevision) + 10;
    bridge.applyRoomSnapshot({
      stateRevision: revision,
      phase: "playing",
      responsePhase: "local_draw",
      currentPlayerId: self.clientId,
      currentTurnPlayerId: self.clientId,
      previousPlayerId: "",
      pollOriginPlayerId: "",
      responseCard: null,
      targetCard: null,
      lastAction: "STABLE_FLOW_FIXTURE",
      players: [...players].reverse(),
    }, "explicit");
    return {
      revision,
      ringIds: ring.map((player) => player.clientId),
      names: Object.fromEntries(sorted.map((player) => [player.clientId, player.name])),
    };
  });

  const lanes = page.locator(".flow-card[data-flow-lane]");
  await expect(lanes).toHaveCount(4);
  await expect(lanes.locator(".discard-token")).toHaveCount(4);

  const laneState = async () => page.locator(".flow-card[data-flow-lane]").evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [
      item.getAttribute("data-flow-lane"),
      {
        receiverId: item.getAttribute("data-flow-receiver-id"),
        title: item.querySelector("p")?.textContent?.trim(),
      },
    ])),
  );
  const title = (sender: string, receiver: string) => `${setup.names[sender]} → ${setup.names[receiver]}`;
  const [selfId, nextId, oppositeId, previousId] = setup.ringIds;
  expect(await laneState()).toEqual({
    "top-left": { receiverId: previousId, title: title(oppositeId, previousId) },
    "top-right": { receiverId: oppositeId, title: title(nextId, oppositeId) },
    "bottom-left": { receiverId: selfId, title: title(previousId, selfId) },
    "bottom-right": { receiverId: nextId, title: title(selfId, nextId) },
  });

  await page.evaluate(({ revision }) => {
    const trackingWindow = window as any;
    trackingWindow.__siseFlowLaneNodes = Array.from(document.querySelectorAll(".flow-card[data-flow-lane]"));
    trackingWindow.__siseFlowCardNodes = Array.from(document.querySelectorAll(".flow-card .discard-token"));
    const bridge = trackingWindow.__siseLocalTest;
    const current = bridge.getRoomState();
    for (let index = 0; index < 5; index += 1) {
      bridge.applyRoomSnapshot({
        stateRevision: revision,
        players: [...current.players].reverse(),
      }, "explicit");
    }
    bridge.applyRoomSnapshot({ stateRevision: revision + 1 }, "schema");
  }, setup);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => {
    const trackingWindow = window as any;
    const lanesNow = Array.from(document.querySelectorAll(".flow-card[data-flow-lane]"));
    const cardsNow = Array.from(document.querySelectorAll(".flow-card .discard-token"));
    return {
      lanesStable: lanesNow.every((node, index) => node === trackingWindow.__siseFlowLaneNodes[index]),
      cardsStable: cardsNow.every((node, index) => node === trackingWindow.__siseFlowCardNodes[index]),
    };
  })).toEqual({ lanesStable: true, cardsStable: true });

  await page.getByTestId("game-settings").click();
  await page.getByTestId("seat-direction-clockwise").click();
  await page.getByRole("button", { name: "关闭设置" }).click();
  expect(await laneState()).toEqual({
    "top-left": { receiverId: oppositeId, title: title(nextId, oppositeId) },
    "top-right": { receiverId: previousId, title: title(oppositeId, previousId) },
    "bottom-left": { receiverId: nextId, title: title(selfId, nextId) },
    "bottom-right": { receiverId: selfId, title: title(previousId, selfId) },
  });
  expect(await page.evaluate(() => {
    const trackingWindow = window as any;
    const lanesNow = Array.from(document.querySelectorAll(".flow-card[data-flow-lane]"));
    return lanesNow.every((node, index) => node === trackingWindow.__siseFlowLaneNodes[index]);
  })).toBe(true);

  await page.evaluate(({ revision, selfId }) => {
    const trackingWindow = window as any;
    trackingWindow.__siseDiscardFlightCount = 0;
    trackingWindow.__siseDiscardObserver = new MutationObserver((records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".fx-card.discard")) trackingWindow.__siseDiscardFlightCount += 1;
          trackingWindow.__siseDiscardFlightCount += node.querySelectorAll(".fx-card.discard").length;
        }
      }
    });
    trackingWindow.__siseDiscardObserver.observe(document.body, { childList: true, subtree: true });
    const bridge = trackingWindow.__siseLocalTest;
    const current = bridge.getRoomState();
    const responseCard = {
      id: `stable-flow-${selfId}`,
      color: "yellow",
      type: "ju",
      source: "upper",
      isResponseCard: true,
    };
    const action = `${selfId} DISCARD`;
    bridge.applyRoomSnapshot({
      stateRevision: revision + 2,
      responsePhase: "collective",
      previousPlayerId: selfId,
      pollOriginPlayerId: selfId,
      responseCard,
      targetCard: responseCard,
      lastAction: action,
      players: current.players,
    }, "explicit");
    bridge.applyRoomSnapshot({ stateRevision: revision + 2, lastAction: action }, "schema");
    bridge.applyRoomSnapshot({ stateRevision: revision + 3, lastAction: action }, "explicit");
    bridge.applyRoomSnapshot({ stateRevision: revision + 2, lastAction: action }, "schema");
  }, { revision: setup.revision, selfId });
  await expect.poll(() => page.evaluate(() => (window as any).__siseDiscardFlightCount)).toBe(1);
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => {
    const trackingWindow = window as any;
    trackingWindow.__siseDiscardObserver.disconnect();
    return trackingWindow.__siseDiscardFlightCount;
  })).toBe(1);
});
