import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitePage, normalizePublicWebOrigin } from "../../http/invite-page.js";

test("invite page provides a room-specific cultural share card and safe entry link", () => {
  const html = buildInvitePage("room_42", "https://cards.example.com");
  assert.match(html, /邀请你一起传承四色牌文化/);
  assert.match(html, /好友房 room_42/);
  assert.match(html, /property="og:url" content="https:\/\/cards\.example\.com\/invite\/room_42"/);
  assert.match(html, /property="og:image" content="https:\/\/cards\.example\.com\/share-card\.png"/);
  assert.match(html, /url=https:\/\/cards\.example\.com\/\?roomId=room_42/);
  assert.doesNotMatch(html, /playerToken|hostKey/);
});

test("public web origin accepts only credential-free http origins", () => {
  assert.equal(normalizePublicWebOrigin("https://cards.example.com/path"), "https://cards.example.com");
  assert.equal(normalizePublicWebOrigin("javascript:alert(1)"), null);
  assert.equal(normalizePublicWebOrigin("https://user:secret@cards.example.com"), null);
});
