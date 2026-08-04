import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth,
  UserButton,
} from '@clerk/clerk-react'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CustomSignInForm, CustomSignUpForm } from '../components/AuthForms'
import { parseLocale } from './api'
import { clerkAppearance, clerkLocalization } from './clerkTheme'
import type { Locale } from '../i18n'
import { cn } from './cn'
import { usePrefs } from '../preferences/PreferencesContext'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
export const clerkEnabled = Boolean(publishableKey)

type TokenFn = () => Promise<string | null>
const TokenContext = createContext<TokenFn>(async () => null)

export function useApiToken(): TokenFn {
  return useContext(TokenContext)
}

function TokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  return <TokenContext.Provider value={() => getToken()}>{children}</TokenContext.Provider>
}

function LocalTokenBridge({ children }: { children: ReactNode }) {
  return <TokenContext.Provider value={async () => null}>{children}</TokenContext.Provider>
}

function localeFromPath(pathname: string): Locale {
  const seg = pathname.split('/').filter(Boolean)[0]
  return parseLocale(seg) ?? 'ka'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const locale = localeFromPath(location.pathname)
  const localization = useMemo(() => clerkLocalization(locale), [locale])

  if (!clerkEnabled) {
    return <LocalTokenBridge>{children}</LocalTokenBridge>
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      localization={localization}
      appearance={clerkAppearance}
      signInUrl={`/${locale}/sign-in`}
      signUpUrl={`/${locale}/sign-up`}
      afterSignOutUrl={`/${locale}/sign-in`}
    >
      <TokenBridge>{children}</TokenBridge>
    </ClerkProvider>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { locale: param } = useParams()
  const locale = parseLocale(param) ?? 'ka'

  if (!clerkEnabled) return children

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to={`/${locale}/sign-in`} replace />
      </SignedOut>
    </>
  )
}

function AuthLocaleSwitch({ locale, mode }: { locale: Locale; mode: 'sign-in' | 'sign-up' }) {
  const navigate = useNavigate()
  const { setLocale, t } = usePrefs()

  function go(next: Locale) {
    if (next === locale) return
    setLocale(next)
    navigate(`/${next}/${mode}`)
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-panel/90 p-1 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t('auth.localeKa')}
        title={t('auth.localeKa')}
        onClick={() => go('ka')}
        className={cn(
          'btn-press cursor-pointer overflow-hidden rounded-full transition ring-2',
          locale === 'ka' ? 'ring-teal shadow-sm' : 'ring-transparent opacity-70 hover:opacity-100',
        )}
      >
        <img
          src="https://flagcdn.com/w80/ge.png"
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
          draggable={false}
        />
      </button>
      <button
        type="button"
        aria-label={t('auth.localeEn')}
        title={t('auth.localeEn')}
        onClick={() => go('en')}
        className={cn(
          'btn-press cursor-pointer overflow-hidden rounded-full transition ring-2',
          locale === 'en' ? 'ring-teal shadow-sm' : 'ring-transparent opacity-70 hover:opacity-100',
        )}
      >
        <img
          src="https://flagcdn.com/w80/gb.png"
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
          draggable={false}
        />
      </button>
    </div>
  )
}

function AuthThemeToggle() {
  const { theme, setTheme, t } = usePrefs()

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-panel/80 p-1">
      <button
        type="button"
        aria-label={t('settings.themeLight')}
        onClick={(e) => setTheme('light', { x: e.clientX, y: e.clientY })}
        className={cn(
          'btn-press cursor-pointer rounded-md px-2.5 py-1.5',
          theme === 'light' ? 'bg-teal text-white' : 'text-ink-muted hover:text-ink',
        )}
      >
        <SunIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t('settings.themeDark')}
        onClick={(e) => setTheme('dark', { x: e.clientX, y: e.clientY })}
        className={cn(
          'btn-press cursor-pointer rounded-md px-2.5 py-1.5',
          theme === 'dark' ? 'bg-teal text-white' : 'text-ink-muted hover:text-ink',
        )}
      >
        <MoonIcon className="size-3.5" />
      </button>
    </div>
  )
}

function AuthShell({
  locale,
  mode,
  children,
}: {
  locale: Locale
  mode: 'sign-in' | 'sign-up'
  children: ReactNode
}) {
  const { t, theme } = usePrefs()
  const isSignIn = mode === 'sign-in'

  return (
    <div className="relative flex min-h-screen overflow-hidden text-ink">
      {/* Kitchen photo — full bleed */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=2400&q=80')",
        }}
      />
      {/* Readability overlay — stronger in dark mode */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          theme === 'dark'
            ? 'bg-[linear-gradient(105deg,rgb(11_18_16/0.92)_0%,rgb(11_18_16/0.78)_45%,rgb(11_18_16/0.55)_100%)]'
            : 'bg-[linear-gradient(105deg,rgb(243_246_244/0.94)_0%,rgb(243_246_244/0.82)_45%,rgb(243_246_244/0.45)_100%)]',
        )}
      />

      <div className="relative z-10 flex w-full flex-col">
        <header className="relative flex items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <AuthThemeToggle />

          <Link
            to={`/${locale}/sign-in`}
            className="absolute left-1/2 -translate-x-1/2 font-display text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            <span className="bg-gradient-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent">
              Mise
            </span>
          </Link>

          <AuthLocaleSwitch locale={locale} mode={mode} />
        </header>

        <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 pb-12 pt-6 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-16 lg:px-8">
          <div className="hidden lg:block">
            <p className="font-pl text-[3rem] leading-[1.08] font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent">
                {isSignIn ? t('auth.headlineSignIn') : t('auth.headlineSignUp')}
              </span>
            </p>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink-soft">{t('auth.blurb')}</p>
            <div className="mt-10 h-px w-24 bg-gradient-to-r from-teal to-transparent" />
          </div>

          <div className="mx-auto w-full max-w-[420px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
      />
    </svg>
  )
}

export function SignInPage() {
  const { locale: param } = useParams()
  const locale = parseLocale(param) ?? 'ka'
  if (!clerkEnabled) return <Navigate to={`/${locale}`} replace />
  return (
    <AuthShell locale={locale} mode="sign-in">
      <CustomSignInForm locale={locale} />
    </AuthShell>
  )
}

export function SignUpPage() {
  const { locale: param } = useParams()
  const locale = parseLocale(param) ?? 'ka'
  if (!clerkEnabled) return <Navigate to={`/${locale}`} replace />
  return (
    <AuthShell locale={locale} mode="sign-up">
      <CustomSignUpForm locale={locale} />
    </AuthShell>
  )
}

/** OAuth return URL for Google (and other social) redirects. */
export function SsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />
}

export function AuthUserButton() {
  if (!clerkEnabled) return null
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'size-8',
        },
      }}
    />
  )
}

export function OrgBootstrap() {
  const getToken = useApiToken()
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        if (!cancelled) await fetch('/api/me', { headers })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])
  return null
}
