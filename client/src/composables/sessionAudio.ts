import { ref } from "vue";

/** Session-only override. Never writes or replaces saved sound preferences. */
export const sessionAudioMuted = ref(false);
