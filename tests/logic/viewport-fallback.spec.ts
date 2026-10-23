import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("the document keeps a traditional viewport-height fallback", async () => {
  const styles = await readFile(path.join(process.cwd(), "client/src/styles.css"), "utf8");

  expect(styles).toMatch(/height:\s*100vh;\s*height:\s*100dvh;/u);
});

test("critical layouts do not depend on unsupported dynamic viewport units", async () => {
  const relativePaths = [
    "client/src/App.vue",
    "client/src/components/FriendInviteQrDialog.vue",
    "client/src/components/GameBoard.vue",
    "client/src/components/GameTools.vue",
    "client/src/components/LobbyPage.vue",
  ];
  const sources = await Promise.all(
    relativePaths.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
  );

  for (const [index, source] of sources.entries()) {
    expect(source, `${relativePaths[index]} still contains a dynamic-only viewport unit`).not.toMatch(/\d(?:dvh|dvw)\b/u);
  }
});
