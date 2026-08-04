import { useSignIn, useSignUp } from '@clerk/clerk-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthFormSkeleton } from './AuthFormSkeleton'
import { AuthGlassCard } from './AuthScene'
import type { Locale } from '../i18n'
import { cn } from '../lib/cn'
import { markOAuthIntent, OAUTH_ERROR_PARAM, type OAuthErrorCode } from '../lib/oauthFlow'
import { usePrefs } from '../preferences/PreferencesContext'

function fieldClass() {
  return 'auth-input mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-teal'
}

function primaryBtn(busy: boolean) {
  return cn(
    'btn-press mt-4 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-teal text-sm font-semibold text-white hover:bg-teal-deep',
    busy && 'opacity-60',
  )
}

function secondaryBtn() {
  return 'btn-press mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-line bg-panel text-sm font-medium text-ink hover:border-teal hover:bg-teal-soft/40'
}

function oauthErrorMessage(code: OAuthErrorCode, t: ReturnType<typeof usePrefs>['t']): string {
  if (code === 'email_in_use') return t('auth.errEmailInUse')
  return t('auth.errOAuth')
}

function useOAuthErrorParam() {
  const [params, setParams] = useSearchParams()
  const { t } = usePrefs()
  const code = params.get(OAUTH_ERROR_PARAM) as OAuthErrorCode | null

  useEffect(() => {
    if (!code) return
    const next = new URLSearchParams(params)
    next.delete(OAUTH_ERROR_PARAM)
    setParams(next, { replace: true })
  }, [code, params, setParams])

  if (code === 'email_in_use' || code === 'oauth_failed') {
    return oauthErrorMessage(code, t)
  }
  return ''
}

function errMsg(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong'
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  return e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Something went wrong'
}

function AuthFormSwitchLink({ locale, mode }: { locale: Locale; mode: 'sign-in' | 'sign-up' }) {
  const { t } = usePrefs()
  const isSignIn = mode === 'sign-in'

  return (
    <p className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-muted">
      {isSignIn ? (
        <>
          {t('auth.noAccount')}{' '}
          <Link className="font-medium text-teal hover:text-teal-deep" to={`/${locale}/sign-up`}>
            {t('auth.signUp')}
          </Link>
        </>
      ) : (
        <>
          {t('auth.hasAccount')}{' '}
          <Link className="font-medium text-teal hover:text-teal-deep" to={`/${locale}/sign-in`}>
            {t('auth.signIn')}
          </Link>
        </>
      )}
    </p>
  )
}

export function CustomSignInForm({ locale }: { locale: Locale }) {
  const { isLoaded, signIn, setActive } = useSignIn()
  const navigate = useNavigate()
  const { t } = usePrefs()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'start' | 'code' | 'password' | 'forgot' | 'forgot-code'>('start')
  const [codeAsSecondFactor, setCodeAsSecondFactor] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const oauthError = useOAuthErrorParam()

  useEffect(() => {
    if (oauthError) setError(oauthError)
  }, [oauthError])

  async function finishIfComplete(status: string | null | undefined, sessionId: string | null | undefined) {
    if (status === 'complete' && sessionId) {
      await setActive!({ session: sessionId })
      navigate(`/${locale}`, { replace: true })
      return true
    }
    return false
  }

  async function onGoogle() {
    if (!isLoaded || !signIn) return
    setError('')
    setBusy(true)
    try {
      markOAuthIntent('sign-in')
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: `${window.location.origin}/${locale}/sso-callback`,
        redirectUrlComplete: `${window.location.origin}/${locale}/sso-callback?step=verify`,
      })
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  async function sendEmailCode() {
    if (!isLoaded || !signIn) return
    setError('')
    setBusy(true)
    try {
      const created = await signIn.create({ identifier: email.trim() })
      const factor = created.supportedFirstFactors?.find((f) => f.strategy === 'email_code')
      if (!factor || factor.strategy !== 'email_code' || !('emailAddressId' in factor)) {
        setError(t('auth.errEmailCode'))
        setBusy(false)
        return
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      })
      setCodeAsSecondFactor(false)
      setStep('code')
      setCode('')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    setError('')
    setBusy(true)
    try {
      const res = codeAsSecondFactor
        ? await signIn.attemptSecondFactor({ strategy: 'email_code', code: code.trim() })
        : await signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() })
      if (!(await finishIfComplete(res.status, res.createdSessionId))) {
        setError(t('auth.errExtraStep'))
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function signInPassword(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    if (!email.trim() || !password) {
      setError(t('auth.errEnterCredentials'))
      return
    }
    setError('')
    setBusy(true)
    try {
      await signIn.create({ identifier: email.trim() })
      const hasPassword = signIn.supportedFirstFactors?.some((f) => f.strategy === 'password')
      if (!hasPassword) {
        setError(t('auth.errNoPassword'))
        return
      }
      const res = await signIn.attemptFirstFactor({ strategy: 'password', password })
      if (await finishIfComplete(res.status, res.createdSessionId)) return

      if (res.status === 'needs_second_factor') {
        const emailFactor = res.supportedSecondFactors?.find((f) => f.strategy === 'email_code')
        if (emailFactor && emailFactor.strategy === 'email_code' && 'emailAddressId' in emailFactor) {
          await signIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          })
          setCodeAsSecondFactor(true)
          setStep('code')
          setCode('')
          setError(t('auth.errExtraVerify'))
          return
        }
      }
      setError(t('auth.errSignIn'))
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function startForgot(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    setError('')
    setBusy(true)
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      })
      setStep('forgot-code')
      setCode('')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function finishForgot(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn) return
    if (password !== confirmPassword) {
      setError(t('auth.errPasswordMismatch'))
      return
    }
    setError('')
    setBusy(true)
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      })
      if (!(await finishIfComplete(result.status, result.createdSessionId))) {
        setError(t('auth.errReset'))
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  if (!isLoaded) {
    return <AuthFormSkeleton />
  }

  return (
    <AuthGlassCard>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t('auth.formSignIn')}</h1>

      {step === 'start' && (
        <div className="mt-6">
          <button type="button" disabled={busy} onClick={onGoogle} className={secondaryBtn()}>
            {t('auth.google')}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <span className="h-px flex-1 bg-line" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-line" />
          </div>

          <label className="block text-sm font-medium text-ink-soft">
            {t('auth.email')}
            <input
              className={fieldClass()}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPh')}
              required
            />
          </label>

          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={sendEmailCode}
            className={primaryBtn(busy)}
          >
            {t('auth.sendCode')}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError('')
              setPassword('')
              setStep('password')
            }}
            className={secondaryBtn()}
          >
            {t('auth.usePassword')}
          </button>
        </div>
      )}

      {step === 'code' && (
        <form className="mt-6" onSubmit={verifyCode}>
          <p className="text-sm text-ink-soft">{t('auth.checkEmail')}</p>
          <p className="mt-1 text-xs text-ink-muted">{email}</p>
          <label className="mt-4 block text-sm font-medium text-ink-soft">
            {t('auth.code')}
            <input
              className={fieldClass()}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('auth.codePh')}
              required
            />
          </label>
          <button type="submit" disabled={busy || !code.trim()} className={primaryBtn(busy)}>
            {t('auth.verify')}
          </button>
          <button type="button" disabled={busy} onClick={sendEmailCode} className={secondaryBtn()}>
            {t('auth.resend')}
          </button>
          <button
            type="button"
            className="btn-press mt-3 w-full cursor-pointer text-sm text-ink-muted hover:text-ink"
            onClick={() => {
              setStep('start')
              setError('')
            }}
          >
            {t('auth.back')}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form className="mt-6" onSubmit={signInPassword}>
          <label className="block text-sm font-medium text-ink-soft">
            {t('auth.email')}
            <input
              className={fieldClass()}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-soft">
            {t('auth.password')}
            <input
              className={fieldClass()}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPh')}
              required
            />
          </label>
          <button type="submit" disabled={busy} className={primaryBtn(busy)}>
            {t('auth.continue')}
          </button>
          <button
            type="button"
            className="btn-press mt-3 w-full cursor-pointer text-sm text-teal hover:text-teal-deep"
            onClick={() => {
              setStep('forgot')
              setError('')
              setPassword('')
              setConfirmPassword('')
            }}
          >
            {t('auth.forgot')}
          </button>
          <button
            type="button"
            className="btn-press mt-2 w-full cursor-pointer text-sm text-ink-muted hover:text-ink"
            onClick={() => {
              setStep('start')
              setError('')
            }}
          >
            {t('auth.useCode')}
          </button>
        </form>
      )}

      {step === 'forgot' && (
        <form className="mt-6" onSubmit={startForgot} autoComplete="on">
          <label className="block text-sm font-medium text-ink-soft">
            {t('auth.email')}
            <input
              className={fieldClass()}
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy || !email.trim()} className={primaryBtn(busy)}>
            {t('auth.resetSend')}
          </button>
          <button
            type="button"
            className="btn-press mt-3 w-full cursor-pointer text-sm text-ink-muted hover:text-ink"
            onClick={() => setStep('password')}
          >
            {t('auth.back')}
          </button>
        </form>
      )}

      {step === 'forgot-code' && (
        <form className="mt-6" onSubmit={finishForgot} autoComplete="on">
          <p className="text-sm text-ink-soft">{t('auth.checkEmail')}</p>
          <p className="mt-1 text-xs text-ink-muted">{email}</p>

          {/* Username hint for password managers — must come before OTP/password fields */}
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute size-0 opacity-0"
          />

          <label className="mt-4 block text-sm font-medium text-ink-soft">
            {t('auth.code')}
            <input
              className={fieldClass()}
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('auth.codePh')}
              required
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-soft">
            {t('auth.newPassword')}
            <input
              className={fieldClass()}
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPh')}
              required
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-soft">
            {t('auth.confirmPassword')}
            <input
              className={fieldClass()}
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.passwordPh')}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim() || !password || !confirmPassword}
            className={primaryBtn(busy)}
          >
            {t('auth.setPassword')}
          </button>
        </form>
      )}

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div id="clerk-captcha" />
      <AuthFormSwitchLink locale={locale} mode="sign-in" />
    </AuthGlassCard>
  )
}

export function CustomSignUpForm({ locale }: { locale: Locale }) {
  const { isLoaded, signUp, setActive } = useSignUp()
  const navigate = useNavigate()
  const { t } = usePrefs()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'start' | 'code'>('start')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const oauthError = useOAuthErrorParam()

  useEffect(() => {
    if (oauthError) setError(oauthError)
  }, [oauthError])

  async function onGoogle() {
    if (!isLoaded || !signUp) return
    setError('')
    setBusy(true)
    try {
      markOAuthIntent('sign-up')
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: `${window.location.origin}/${locale}/sso-callback`,
        redirectUrlComplete: `${window.location.origin}/${locale}/sso-callback?step=verify`,
      })
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  async function startEmailSignUp(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signUp) return
    setError('')
    setBusy(true)
    try {
      const payload: { emailAddress: string; password?: string } = { emailAddress: email.trim() }
      if (password.trim()) payload.password = password
      await signUp.create(payload)
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setStep('code')
      setCode('')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signUp) return
    setError('')
    setBusy(true)
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: code.trim() })
      if (res.status === 'complete' && res.createdSessionId) {
        await setActive!({ session: res.createdSessionId })
        navigate(`/${locale}`, { replace: true })
      } else {
        setError(t('auth.errSignUp'))
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  if (!isLoaded) {
    return <AuthFormSkeleton />
  }

  return (
    <AuthGlassCard>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t('auth.formSignUp')}</h1>

      {step === 'start' && (
        <form className="mt-6" onSubmit={startEmailSignUp}>
          <button type="button" disabled={busy} onClick={onGoogle} className={secondaryBtn()}>
            {t('auth.google')}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <span className="h-px flex-1 bg-line" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-line" />
          </div>

          <label className="block text-sm font-medium text-ink-soft">
            {t('auth.email')}
            <input
              className={fieldClass()}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPh')}
              required
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-soft">
            {t('auth.password')}
            <span className="ml-1 font-normal text-ink-muted">
              ({t('auth.passwordOptional')})
            </span>
            <input
              className={fieldClass()}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPh')}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={busy || !email.trim()} className={primaryBtn(busy)}>
            {t('auth.createAccount')}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form className="mt-6" onSubmit={verify}>
          <p className="text-sm text-ink-soft">{t('auth.checkEmail')}</p>
          <p className="mt-1 text-xs text-ink-muted">{email}</p>
          <label className="mt-4 block text-sm font-medium text-ink-soft">
            {t('auth.code')}
            <input
              className={fieldClass()}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('auth.codePh')}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit" disabled={busy || !code.trim()} className={primaryBtn(busy)}>
            {t('auth.verify')}
          </button>
          <button
            type="button"
            className="btn-press mt-3 w-full cursor-pointer text-sm text-ink-muted hover:text-ink"
            onClick={() => setStep('start')}
          >
            {t('auth.back')}
          </button>
        </form>
      )}

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div id="clerk-captcha" />
      <AuthFormSwitchLink locale={locale} mode="sign-up" />
    </AuthGlassCard>
  )
}
