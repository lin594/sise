import { nextTick, ref } from "vue";
import { usePwaInstall } from "./usePwaInstall";
/** App-level installation guide and return focus, on top of browser capability detection. */
export function useInstallGuide({ onError, onNotice, onGuideClosed }) {
    const { canOfferInstall: canOfferPwaInstall, requestInstall: installPwa } = usePwaInstall();
    const pwaInstallGuide = ref(null);
    let pwaInstallReturnFocus = null;
    async function requestPwaInstall() {
        if (!canOfferPwaInstall.value)
            return;
        pwaInstallReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        try {
            const result = await installPwa();
            if (result.kind === "guide") {
                pwaInstallGuide.value = result.guide;
                return;
            }
            if (result.kind === "accepted") {
                onError("");
                onNotice("四色牌已安装，可以从桌面直接打开");
            }
        }
        catch {
            onError("暂时无法打开安装提示，请从浏览器菜单选择“安装应用”或“添加到主屏幕”。");
        }
    }
    function closePwaInstallGuide(restoreFocus = true) {
        if (!pwaInstallGuide.value)
            return;
        pwaInstallGuide.value = null;
        onGuideClosed();
        if (!restoreFocus) {
            pwaInstallReturnFocus = null;
            return;
        }
        void nextTick(() => {
            window.requestAnimationFrame(() => {
                const returnTarget = pwaInstallReturnFocus?.isConnected
                    && !pwaInstallReturnFocus.closest("[data-testid='settings-panel']")
                    ? pwaInstallReturnFocus
                    : document.querySelector("[data-testid='game-settings']")
                        ?? document.querySelector("[data-testid='pwa-install-entry']");
                returnTarget?.focus({ preventScroll: true });
                pwaInstallReturnFocus = null;
            });
        });
    }
    return { canOfferPwaInstall, pwaInstallGuide, requestPwaInstall, closePwaInstallGuide };
}
