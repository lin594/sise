import type { RequestHandler } from "express";

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizePublicWebOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildInvitePage(roomId: string, publicWebOrigin: string): string {
  const safeRoomId = escapeHtml(roomId);
  const inviteUrl = `${publicWebOrigin}/invite/${encodeURIComponent(roomId)}`;
  const entryUrl = `${publicWebOrigin}/?roomId=${encodeURIComponent(roomId)}`;
  const imageUrl = `${publicWebOrigin}/share-thumbnail-v2.png`;
  const title = "邀请你一起传承四色牌文化";
  const description = `好友房 ${roomId} · 点击进入四色牌同桌相聚`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="image_src" href="${escapeHtml(imageUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="四色牌" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(inviteUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="800" />
    <meta property="og:image:height" content="800" />
    <meta property="og:image:alt" content="四色牌文化：黃帥、紅相、綠車、白士" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(entryUrl)}" />
    <title>${title}｜好友房 ${safeRoomId}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>好友房 ${safeRoomId}</p>
      <p><a href="${escapeHtml(entryUrl)}">点击进入四色牌同桌相聚</a></p>
    </main>
  </body>
</html>`;
}

export function createInvitePageHandler(publicWebOriginValue: string | undefined): RequestHandler {
  const publicWebOrigin = normalizePublicWebOrigin(publicWebOriginValue);
  return (req, res) => {
    const roomId = String(req.params.roomId ?? "").trim();
    if (!ROOM_ID_PATTERN.test(roomId)) {
      res.status(400).type("text/plain; charset=utf-8").send("无效的好友房邀请地址");
      return;
    }
    if (!publicWebOrigin) {
      res.status(503).type("text/plain; charset=utf-8").send("邀请页面暂不可用");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("html").send(buildInvitePage(roomId, publicWebOrigin));
  };
}
