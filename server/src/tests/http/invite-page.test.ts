import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitePage, buildPublicSharePage, normalizePublicWebOrigin } from "../../http/invite-page.js";

test("invite page provides a room-specific cultural share card and safe entry link", () => {
  const html = buildInvitePage("room_42", "https://cards.example.com");
  assert.match(html, /来一起玩四色牌/);
  assert.match(html, /好友房 room_42/);
  assert.match(html, /property="og:url" content="https:\/\/cards\.example\.com\/invite\/room_42"/);
  assert.match(html, /property="og:image" content="https:\/\/cards\.example\.com\/share-thumbnail-v3\.png"/);
  assert.match(html, /property="og:image:width" content="800"/);
  assert.match(html, /property="og:image:height" content="800"/);
  assert.match(html, /rel="image_src" href="https:\/\/cards\.example\.com\/share-thumbnail-v3\.png"/);
  assert.match(html, /rel="manifest" href="https:\/\/cards\.example\.com\/site\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#0b1220"/);
  assert.match(html, /url=https:\/\/cards\.example\.com\/\?roomId=room_42/);
  assert.doesNotMatch(html, /playerToken|hostKey/);
  assert.match(html, /itemprop="image"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test("public share page exposes social metadata and returns to mode selection", () => {
  const html = buildPublicSharePage("https://cards.example.com");
  assert.match(html, /来一起玩四色牌/);
  assert.match(html, /不用注册，打开就能玩莆田四色牌/);
  assert.match(html, /property="og:url" content="https:\/\/cards\.example\.com\/share"/);
  assert.match(html, /property="og:image" content="https:\/\/cards\.example\.com\/share-thumbnail-v3\.png"/);
  assert.match(html, /itemprop="image" content="https:\/\/cards\.example\.com\/share-thumbnail-v3\.png"/);
  assert.match(html, /url=https:\/\/cards\.example\.com\//);
});

test("public web origin accepts only credential-free http origins", () => {
  assert.equal(normalizePublicWebOrigin("https://cards.example.com/path"), "https://cards.example.com");
  assert.equal(normalizePublicWebOrigin("javascript:alert(1)"), null);
  assert.equal(normalizePublicWebOrigin("https://user:secret@cards.example.com"), null);
});
