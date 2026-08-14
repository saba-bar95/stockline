import { useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { parseLocale } from "../lib/api";
import {
  OAUTH_ERROR_PARAM,
  takeOAuthIntent,
  type OAuthErrorCode,
} from "../lib/oauthFlow";

function redirectWithError(
  navigate: ReturnType<typeof useNavigate>,
  locale: string,
  code: OAuthErrorCode,
  target: "sign-in" | "sign-up",
) {
  navigate(`/${locale}/${target}?${OAUTH_ERROR_PARAM}=${code}`, {
    replace: true,
  });
}

export function SsoCallbackPage() {
  const clerk = useClerk();
  const { signIn, setActive: activateSignIn } = useSignIn();
  const { signUp } = useSignUp();
  const navigate = useNavigate();
  const { locale: param } = useParams();
  const locale = parseLocale(param) ?? "en";
  const [searchParams] = useSearchParams();
  const step = searchParams.get("step");
  const started = useRef(false);

  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;

    const verifyUrl = `/${locale}/sso-callback?step=verify`;

    if (step !== "verify") {
      void clerk
        .handleRedirectCallback({
          transferable: false,
          signInForceRedirectUrl: verifyUrl,
          signUpForceRedirectUrl: verifyUrl,
          signInFallbackRedirectUrl: `/${locale}/sign-in`,
          signUpFallbackRedirectUrl: `/${locale}/sign-up`,
        })
        .catch(() => {
          redirectWithError(navigate, locale, "oauth_failed", "sign-in");
        });
      return;
    }

    const oauthIntent = takeOAuthIntent();

    void (async () => {
      try {
        const user = clerk.user;
        const userId = user?.id;
        const accountAgeMs =
          user?.createdAt != null
            ? Date.now() - new Date(user.createdAt).getTime()
            : 0;
        const isExistingAccount = accountAgeMs > 60_000;

        if (oauthIntent === "sign-up" && isExistingAccount) {
          if (userId) {
            await fetch("/api/auth/revoke-fresh-oauth", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${await clerk.session?.getToken()}`,
                "Content-Type": "application/json",
              },
            }).catch(() => undefined);
          }
          await clerk.signOut();
          redirectWithError(navigate, locale, "email_in_use", "sign-up");
          return;
        }

        if (oauthIntent === "sign-in" && userId) {
          const token = await clerk.session?.getToken();
          if (token) {
            const res = await fetch("/api/auth/revoke-fresh-oauth", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });
            if (res.ok) {
              const data = (await res.json()) as { blocked?: boolean };
              if (data.blocked) {
                await clerk.signOut();
                redirectWithError(navigate, locale, "email_in_use", "sign-in");
                return;
              }
            }
          }
        }

        if (signIn?.status === "complete" && signIn.createdSessionId) {
          await activateSignIn!({ session: signIn.createdSessionId });
          navigate(`/${locale}`, { replace: true });
          return;
        }

        if (signUp?.status === "complete" && signUp.createdSessionId) {
          await clerk.setActive({ session: signUp.createdSessionId });
          navigate(`/${locale}`, { replace: true });
          return;
        }

        if (clerk.session) {
          navigate(`/${locale}`, { replace: true });
          return;
        }

        redirectWithError(navigate, locale, "oauth_failed", "sign-in");
      } catch {
        redirectWithError(navigate, locale, "oauth_failed", "sign-in");
      }
    })();
  }, [activateSignIn, clerk, locale, navigate, signIn, signUp, step]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-ink-muted">
      <div id="clerk-captcha" />
    </div>
  );
}
