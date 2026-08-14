export type OAuthIntent = "sign-in" | "sign-up";

const INTENT_KEY = "stockline_oauth_intent";
const LEGACY_INTENT_KEY = "mise_oauth_intent";

export function markOAuthIntent(intent: OAuthIntent) {
  sessionStorage.setItem(INTENT_KEY, intent);
  sessionStorage.removeItem(LEGACY_INTENT_KEY);
}

export function clearOAuthIntent() {
  sessionStorage.removeItem(INTENT_KEY);
  sessionStorage.removeItem(LEGACY_INTENT_KEY);
}

export function takeOAuthIntent(): OAuthIntent | null {
  const value =
    sessionStorage.getItem(INTENT_KEY) ||
    sessionStorage.getItem(LEGACY_INTENT_KEY);
  clearOAuthIntent();
  return value === "sign-in" || value === "sign-up" ? value : null;
}

export const OAUTH_ERROR_PARAM = "oauth_error";

export type OAuthErrorCode = "email_in_use" | "oauth_failed";
