import { nextTick, ref, type Ref } from "vue";

/** Invitation UI state; room ownership and admission remain with useRoom. */
export function useInviteActions({ activeRoomId, globalError, showGlobalNotice }: {
  activeRoomId: Readonly<Ref<string>>;
  globalError: Ref<string>;
  showGlobalNotice: (message: string) => void;
}) {
const inviteCopyFallbackUrl = ref("");
const inviteQrUrl = ref("");
const inviteQrRoomId = ref("");
const inviteActionPending = ref<"copy" | "share" | null>(null);
let inviteCopyReturnFocus: HTMLElement | null = null;
let inviteQrReturnFocus: HTMLElement | null = null;
function buildInviteUrl(): string {
  if (!activeRoomId.value) {
    return "";
  }
  return new URL(`/invite/${encodeURIComponent(activeRoomId.value)}`, window.location.origin).toString();
}

function buildPublicShareUrl(): string {
  return new URL("/share", window.location.origin).toString();
}

async function copyInviteLink() {
  await performInviteAction("copy");
}

async function shareInviteLink() {
  await performInviteAction("share");
}

async function shareGame() {
  await performInviteAction("share", "game");
}

async function performInviteAction(action: "copy" | "share", target: "invite" | "game" = "invite") {
  if ((target === "invite" && !activeRoomId.value) || inviteActionPending.value) {
    return;
  }
  inviteCopyReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inviteActionPending.value = action;
  const inviteUrl = target === "invite" ? buildInviteUrl() : buildPublicShareUrl();
  const title = "邀请你一起传承四色牌文化";
  const shareText = target === "invite"
    ? `好友房 ${activeRoomId.value} · 不用注册，打开选座；不满四人可电脑补位`
    : "象棋魂 · 麻将韵 · 纸牌趣——四色牌，一局见真章！";
  let restoreFocus = true;
  try {
    if (action === "share" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: inviteUrl,
        });
        globalError.value = "";
        showGlobalNotice(target === "invite" ? "邀请已分享，等待牌友加入" : "四色牌已分享到系统分享菜单");
        return;
      } catch (error) {
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
          return;
        }
      }
    }

    inviteActionPending.value = "copy";
    let copied = false;
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = inviteUrl;
      textarea.readOnly = true;
      textarea.style.position = "fixed";
      textarea.style.inset = "0 auto auto -9999px";
      textarea.style.fontSize = "16px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, inviteUrl.length);
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        textarea.remove();
      }
    }
    if (copied) {
      globalError.value = "";
      const embeddedSocial = /MicroMessenger|MQQBrowser|QQ\//i.test(navigator.userAgent);
      showGlobalNotice(embeddedSocial
        ? "链接已复制，也可以点右上角分享到微信或 QQ"
        : target === "invite" ? "邀请链接已复制，可以发给朋友了" : "四色牌链接已复制，可以发给朋友了");
    } else {
      globalError.value = "";
      inviteCopyFallbackUrl.value = inviteUrl;
      restoreFocus = false;
    }
  } finally {
    inviteActionPending.value = null;
    if (restoreFocus) {
      const returnTarget = inviteCopyReturnFocus;
      inviteCopyReturnFocus = null;
      await nextTick();
      returnTarget?.isConnected && returnTarget.focus();
    }
  }
}

function showInviteQr(): void {
  const inviteUrl = buildInviteUrl();
  if (!inviteUrl || !activeRoomId.value) {
    return;
  }
  inviteQrReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inviteQrRoomId.value = activeRoomId.value;
  inviteQrUrl.value = inviteUrl;
}

function closeInviteQr(restoreFocus = true): void {
  if (!inviteQrUrl.value) {
    return;
  }
  const returnTarget = inviteQrReturnFocus;
  inviteQrUrl.value = "";
  inviteQrRoomId.value = "";
  inviteQrReturnFocus = null;
  if (restoreFocus) {
    void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
  }
}

function closeInviteCopyFallback(restoreFocus = true): void {
  if (!inviteCopyFallbackUrl.value) {
    return;
  }
  const returnTarget = inviteCopyReturnFocus;
  inviteCopyFallbackUrl.value = "";
  inviteCopyReturnFocus = null;
  if (restoreFocus) {
    void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
  }
}

return { inviteCopyFallbackUrl, inviteQrUrl, inviteQrRoomId, inviteActionPending, copyInviteLink, shareInviteLink, shareGame, showInviteQr, closeInviteQr, closeInviteCopyFallback };
}
