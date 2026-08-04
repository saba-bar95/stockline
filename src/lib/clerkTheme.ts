import { enUS } from '@clerk/localizations'

type Loc = typeof enUS

/** Clerk has no built-in Georgian pack — custom overrides on top of English structure. */
export const kaGE = {
  ...enUS,
  locale: 'ka-GE',
  socialButtonsBlockButton: 'გაგრძელება {{provider|titleize}}-ით',
  dividerText: 'ან',
  formFieldLabel__emailAddress: 'ელფოსტა',
  formFieldLabel__emailAddress_username: 'ელფოსტა',
  formFieldLabel__password: 'პაროლი',
  formFieldLabel__firstName: 'სახელი',
  formFieldLabel__lastName: 'გვარი',
  formFieldInputPlaceholder__emailAddress: 'შეიყვანე ელფოსტა',
  formFieldInputPlaceholder__password: 'შეიყვანე პაროლი',
  formButtonPrimary: 'გაგრძელება',
  formFieldAction__forgotPassword: 'დაგავიწყდა პაროლი?',
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: 'შესვლა Mise-ში',
      subtitle: 'კეთილი იყოს შენი დაბრუნება',
      actionText: 'არ გაქვს ანგარიში?',
      actionLink: 'რეგისტრაცია',
    },
    forgotPassword: {
      ...enUS.signIn?.forgotPassword,
      title: 'პაროლის აღდგენა',
      subtitle: 'შეიყვანე ელფოსტა კოდის მისაღებად',
      formTitle: 'კოდის შემოწმება',
      formSubtitle: 'შეიყვანე კოდი, რომელიც გამოგიგზავნეთ ელფოსტაზე',
      resendButton: 'თავიდან გამოგზავნა',
    },
    emailCode: {
      ...enUS.signIn?.emailCode,
      title: 'შეამოწმე ელფოსტა',
      subtitle: 'კოდი გაგზავნილია {{identifier}}-ზე',
      formTitle: 'დადასტურების კოდი',
      formSubtitle: 'შეიყვანე ერთჯერადი კოდი',
      resendButton: 'თავიდან გამოგზავნა',
    },
    alternativeMethods: {
      ...enUS.signIn?.alternativeMethods,
      title: 'სხვა მეთოდი',
      actionLink: 'სხვა გზით შესვლა',
      blockButton__emailCode: 'ერთჯერადი კოდი ელფოსტაზე',
      blockButton__password: 'პაროლით',
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: 'შექმენი Mise ანგარიში',
      subtitle: 'დაიწყე შენი სამზარეულოს აღრიცხვა',
      actionText: 'უკვე გაქვს ანგარიში?',
      actionLink: 'შესვლა',
    },
  },
} as Loc

export const enMise: Loc = {
  ...enUS,
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: 'Sign in to Mise',
      subtitle: 'Welcome back to your kitchen',
    },
    alternativeMethods: {
      ...enUS.signIn?.alternativeMethods,
      actionLink: 'Use another method',
      blockButton__emailCode: 'Email one-time code',
      blockButton__password: 'Password',
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: 'Create your Mise account',
      subtitle: 'Stock · recipes · profit — start here',
    },
  },
}

export function clerkLocalization(locale: 'ka' | 'en'): Loc {
  return locale === 'ka' ? kaGE : enMise
}

export const clerkAppearance = {
  variables: {
    colorPrimary: '#0f766e',
    colorText: '#0f1a17',
    colorTextSecondary: '#3d4f48',
    colorBackground: '#ffffff',
    colorInputBackground: '#f3f6f4',
    colorInputText: '#0f1a17',
    colorNeutral: '#3d4f48',
    borderRadius: '0.75rem',
    fontFamily: '"IBM Plex Sans", "Noto Sans Georgian", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    rootBox: 'w-full mx-auto',
    cardBox: 'w-full !bg-transparent !shadow-none',
    card: '!bg-white !shadow-none !border !border-[#d7e0db] !rounded-2xl !p-6 sm:!p-8',
    main: '!bg-white',
    headerTitle: 'font-[Cormorant_Garamond,Noto_Serif_Georgian,serif] text-2xl font-semibold !text-[#0f1a17]',
    headerSubtitle: '!text-[#6b7c74]',
    socialButtonsBlockButton:
      '!border !border-[#d7e0db] !bg-white hover:!border-[#0f766e] hover:!bg-[#e6f4f1] !text-[#0f1a17] transition',
    formButtonPrimary: '!bg-[#0f766e] hover:!bg-[#0a4f4a] !text-white !shadow-none',
    formFieldInput: '!bg-[#f3f6f4] !border-[#d7e0db] !text-[#0f1a17]',
    formFieldLabel: '!text-[#3d4f48]',
    footerActionLink: '!text-[#0f766e] hover:!text-[#0a4f4a]',
    identityPreviewEditButton: '!text-[#0f766e]',
    alternativeMethodsBlockButton: '!border !border-[#d7e0db] !bg-white !text-[#0f1a17]',
    // Hide Clerk chrome / dark development strip
    footer: '!hidden',
    footerAction: '!hidden',
    footerPages: '!hidden',
    logoBox: '!hidden',
    logoImage: '!hidden',
    badge: '!hidden',
  },
  layout: {
    socialButtonsPlacement: 'top' as const,
    showOptionalFields: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
}
