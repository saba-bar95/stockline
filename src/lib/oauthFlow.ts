export type OAuthIntent = 'sign-in' | 'sign-up'

const INTENT_KEY = 'mise_oauth_intent'

export function markOAuthIntent(intent: OAuthIntent) {
  sessionStorage.setItem(INTENT_KEY, intent)
}

export function takeOAuthIntent(): OAuthIntent | null {
  const value = sessionStorage.getItem(INTENT_KEY)
  sessionStorage.removeItem(INTENT_KEY)
  return value === 'sign-in' || value === 'sign-up' ? value : null
}

export const OAUTH_ERROR_PARAM = 'oauth_error'

export type OAuthErrorCode = 'email_in_use' | 'oauth_failed'
