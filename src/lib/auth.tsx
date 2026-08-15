import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  useAuth,
  UserButton,
} from "@clerk/clerk-react";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { CustomSignInForm, CustomSignUpForm } from "../components/AuthForms";
import { AuthHero, AuthScene } from "../components/AuthScene";
import { BrandMark } from "../components/BrandMark";
import { parseLocale, invalidateApiCache } from "./api";
import {
  clerkAppearance,
  clerkLocalization,
  sidebarUserButtonAppearance,
  sidebarUserProfileAppearance,
} from "./clerkTheme";
import { startClerkDomFix } from "./clerkDomFix";
import type { Locale } from "../i18n";
import { cn } from "./cn";
import { usePrefs } from "../preferences/PreferencesContext";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
export const clerkEnabled = Boolean(publishableKey);

type TokenFn = () => Promise<string | null>;
const TokenContext = createContext<TokenFn>(async () => null);

export function useApiToken(): TokenFn {
  return useContext(TokenContext);
}

function TokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  return (
    <TokenContext.Provider value={() => getToken()}>
      {children}
    </TokenContext.Provider>
  );
}

function LocalTokenBridge({ children }: { children: ReactNode }) {
  return (
    <TokenContext.Provider value={async () => null}>
      {children}
    </TokenContext.Provider>
  );
}

function localeFromPath(pathname: string): Locale {
  const seg = pathname.split("/").filter(Boolean)[0];
  return parseLocale(seg) ?? "en";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const locale = localeFromPath(location.pathname);
  const localization = useMemo(() => clerkLocalization(locale), [locale]);

  if (!clerkEnabled) {
    return <LocalTokenBridge>{children}</LocalTokenBridge>;
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
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { locale: param } = useParams();
  const locale = parseLocale(param) ?? "en";

  if (!clerkEnabled) return children;

  return (
    <>
      <SignedIn>
        <SessionCacheGate>{children}</SessionCacheGate>
      </SignedIn>
      <SignedOut>
        <Navigate to={`/${locale}/sign-in`} replace />
      </SignedOut>
    </>
  );
}

function SessionCacheGate({ children }: { children: ReactNode }) {
  const { userId, isLoaded, getToken } = useAuth();
  const [ready, setReady] = useState(false);
  const prevUser = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    (async () => {
      if (!isLoaded || !userId) return;
      // Ensure a session JWT exists before mounting pages that fetch /counts.
      for (let i = 0; i < 8; i++) {
        const token = await getToken();
        if (token) {
          if (!cancelled) {
            if (prevUser.current !== userId) {
              invalidateApiCache();
              prevUser.current = userId;
            }
            setReady(true);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
      // Last resort: still mount so SignedIn UI is not blank forever.
      if (!cancelled) {
        if (prevUser.current !== userId) {
          invalidateApiCache();
          prevUser.current = userId;
        }
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, getToken]);

  if (!isLoaded || !userId || !ready) return null;

  return <Fragment key={userId}>{children}</Fragment>;
}

function AuthLocaleSwitch({
  locale,
  mode,
}: {
  locale: Locale;
  mode: "sign-in" | "sign-up";
}) {
  const navigate = useNavigate();
  const { t } = usePrefs();

  function go(next: Locale) {
    if (next === locale) return;
    navigate(`/${next}/${mode}`, { replace: true });
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-teal/20 bg-panel/60 p-1 backdrop-blur-md">
      <button
        type="button"
        aria-label={t("auth.localeKa")}
        title={t("auth.localeKa")}
        onClick={() => go("ka")}
        className={cn(
          "btn-press cursor-pointer overflow-hidden rounded-full transition ring-2",
          locale === "ka"
            ? "ring-teal shadow-sm"
            : "ring-transparent opacity-70 hover:opacity-100",
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
        aria-label={t("auth.localeEn")}
        title={t("auth.localeEn")}
        onClick={() => go("en")}
        className={cn(
          "btn-press cursor-pointer overflow-hidden rounded-full transition ring-2",
          locale === "en"
            ? "ring-teal shadow-sm"
            : "ring-transparent opacity-70 hover:opacity-100",
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
  );
}

function AuthThemeToggle() {
  const { theme, setTheme, t } = usePrefs();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-teal/20 bg-panel/60 p-1 backdrop-blur-md">
      <button
        type="button"
        aria-label={t("settings.themeLight")}
        onClick={(e) => setTheme("light", { x: e.clientX, y: e.clientY })}
        className={cn(
          "btn-press cursor-pointer rounded-md px-2.5 py-1.5",
          theme === "light"
            ? "bg-teal text-white"
            : "text-ink-muted hover:text-ink",
        )}
      >
        <SunIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t("settings.themeDark")}
        onClick={(e) => setTheme("dark", { x: e.clientX, y: e.clientY })}
        className={cn(
          "btn-press cursor-pointer rounded-md px-2.5 py-1.5",
          theme === "dark"
            ? "bg-teal text-white"
            : "text-ink-muted hover:text-ink",
        )}
      >
        <MoonIcon className="size-3.5" />
      </button>
    </div>
  );
}

function AuthShell({
  locale,
  mode,
  children,
}: {
  locale: Locale;
  mode: "sign-in" | "sign-up";
  children: ReactNode;
}) {
  const { t, theme } = usePrefs();
  const isSignIn = mode === "sign-in";

  return (
    <AuthScene theme={theme}>
      <header className="auth-header-enter relative flex items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <AuthThemeToggle />

        <Link
          to={`/${locale}/sign-in`}
          className="absolute left-1/2 -translate-x-1/2 font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          <span className="inline-flex items-center gap-2.5">
            <BrandMark className="size-9 sm:size-10" />
            <span className="auth-logo-shimmer bg-linear-to-r from-teal-deep via-teal to-amber bg-clip-text text-transparent uppercase">
              Stockline
            </span>
          </span>
        </Link>

        <AuthLocaleSwitch locale={locale} mode={mode} />
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 pb-12 pt-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:px-8">
        <AuthHero
          headlineLead={
            isSignIn
              ? t("auth.headlineLeadSignIn")
              : t("auth.headlineLeadSignUp")
          }
          headlineLeadSignIn={t("auth.headlineLeadSignIn")}
          headlineLeadSignUp={t("auth.headlineLeadSignUp")}
          headlineTail={t("auth.headlineTail")}
          mode={mode}
          blurb={t("auth.blurb")}
          tagline={t("brand.tagline")}
        />

        <div className="auth-card-enter w-full min-w-0">{children}</div>
      </div>
    </AuthScene>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
      />
    </svg>
  );
}

export function AuthPageLayout() {
  const { locale: param } = useParams();
  const locale = parseLocale(param) ?? "en";
  const location = useLocation();
  const mode = location.pathname.endsWith("/sign-up") ? "sign-up" : "sign-in";

  if (!clerkEnabled) return <Navigate to={`/${locale}`} replace />;

  return (
    <AuthShell locale={locale} mode={mode}>
      <Outlet />
    </AuthShell>
  );
}

export function SignInPage() {
  const { locale: param } = useParams();
  const locale = parseLocale(param) ?? "en";
  return <CustomSignInForm locale={locale} />;
}

export function SignUpPage() {
  const { locale: param } = useParams();
  const locale = parseLocale(param) ?? "en";
  return <CustomSignUpForm locale={locale} />;
}

/** OAuth return URL for Google (and other social) redirects. */
export { SsoCallbackPage } from "../components/SsoCallbackPage";

export function AuthUserButton() {
  const { theme } = usePrefs();

  useEffect(() => {
    if (!clerkEnabled) return;
    return startClerkDomFix();
  }, []);

  if (!clerkEnabled) return null;
  return (
    <UserButton
      appearance={sidebarUserButtonAppearance(theme)}
      userProfileProps={{ appearance: sidebarUserProfileAppearance(theme) }}
    />
  );
}

export function OrgBootstrap() {
  const getToken = useApiToken();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (!cancelled) await fetch("/api/me", { headers });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);
  return null;
}
