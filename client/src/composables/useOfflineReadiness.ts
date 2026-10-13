import { computed, onMounted, ref } from "vue";
import { registerSW } from "virtual:pwa-register";

export type OfflineReadinessState = "unsupported" | "preparing" | "ready" | "error";

export function useOfflineReadiness() {
  const state = ref<OfflineReadinessState>("preparing");
  const updateAvailable = ref(false);

  const label = computed(() => {
    if (state.value === "ready") return "离线资源已备好，可断网重新打开";
    if (state.value === "preparing") return "正在保存离线资源，完成后可断网重新打开";
    if (state.value === "unsupported") return "此浏览器不能保存离线资源；当前页面仍可练习";
    return "离线资源保存失败；当前页面仍可练习";
  });

  onMounted(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      state.value = "unsupported";
      return;
    }

    registerSW({
      immediate: true,
      // The worker may activate immediately, but reloading during a live round
      // would discard an offline practice session. Let the user choose when to
      // switch the document to the newly cached application instead.
      onNeedReload: () => {
        updateAvailable.value = true;
      },
      onOfflineReady: () => {
        state.value = "ready";
      },
      onRegisteredSW: (_serviceWorkerUrl, registration) => {
        if (registration?.active) state.value = "ready";
      },
      onRegisterError: () => {
        state.value = "error";
      },
    });

    void navigator.serviceWorker.ready
      .then(() => {
        state.value = "ready";
      })
      .catch(() => {
        state.value = "error";
      });
  });

  function reloadForUpdate() {
    window.location.reload();
  }

  return {
    offlineReadinessState: state,
    offlineReadinessLabel: label,
    offlineUpdateAvailable: updateAvailable,
    reloadForOfflineUpdate: reloadForUpdate,
  };
}
