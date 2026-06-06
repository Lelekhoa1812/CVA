export const PROFILE_UPDATED_STORAGE_KEY = "cv-assistant:profile-updated-at";
export const PROFILE_UPDATED_EVENT = "cv-assistant:profile-updated";

export function broadcastProfileUpdated(at = Date.now()) {
  if (typeof window === "undefined") return;

  const value = `${at}`;
  window.localStorage.setItem(PROFILE_UPDATED_STORAGE_KEY, value);
  window.dispatchEvent(
    new CustomEvent(PROFILE_UPDATED_EVENT, {
      detail: { at },
    }),
  );
}
