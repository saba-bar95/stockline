import { enUS } from "@clerk/localizations";

type Loc = typeof enUS;

/** Clerk has no built-in Georgian pack — custom overrides on top of English structure. */
export const kaGE = {
  ...enUS,
  locale: "ka-GE",
  socialButtonsBlockButton: "გაგრძელება {{provider|titleize}}-ით",
  dividerText: "ან",
  formFieldLabel__emailAddress: "ელფოსტა",
  formFieldLabel__emailAddress_username: "ელფოსტა",
  formFieldLabel__password: "პაროლი",
  formFieldLabel__currentPassword: "მიმდინარე პაროლი",
  formFieldLabel__newPassword: "ახალი პაროლი",
  formFieldLabel__confirmPassword: "გაიმეორე პაროლი",
  formFieldLabel__signOutOfOtherSessions: "სხვა მოწყობილობებიდან გასვლა",
  formFieldLabel__firstName: "სახელი",
  formFieldLabel__lastName: "გვარი",
  formFieldInputPlaceholder__emailAddress: "შეიყვანე ელფოსტა",
  formFieldInputPlaceholder__password: "შეიყვანე პაროლი",
  formButtonPrimary: "გაგრძელება",
  formFieldAction__forgotPassword: "დაგავიწყდა პაროლი?",
  unstable__errors: {
    ...enUS.unstable__errors,
    passwordComplexity: {
      maximumLength: "{{length}} სიმბოლოზე ნაკლები",
      minimumLength: "მინიმუმ {{length}} სიმბოლო",
      requireLowercase: "პატარა ასო",
      requireNumbers: "ციფრი",
      requireSpecialCharacter: "სპეციალური სიმბოლო",
      requireUppercase: "დიდი ასო",
      sentencePrefix: "პაროლი უნდა შეიცავდეს",
    },
  },
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: "შესვლა Mise-ში",
      subtitle: "კეთილი იყოს შენი დაბრუნება",
      actionText: "არ გაქვს ანგარიში?",
      actionLink: "რეგისტრაცია",
    },
    forgotPassword: {
      ...enUS.signIn?.forgotPassword,
      title: "პაროლის აღდგენა",
      subtitle: "შეიყვანე ელფოსტა კოდის მისაღებად",
      formTitle: "კოდის შემოწმება",
      formSubtitle: "შეიყვანე კოდი, რომელიც გამოგიგზავნეთ ელფოსტაზე",
      resendButton: "თავიდან გამოგზავნა",
    },
    emailCode: {
      ...enUS.signIn?.emailCode,
      title: "შეამოწმე ელფოსტა",
      subtitle: "კოდი გაგზავნილია {{identifier}}-ზე",
      formTitle: "დადასტურების კოდი",
      formSubtitle: "შეიყვანე ერთჯერადი კოდი",
      resendButton: "თავიდან გამოგზავნა",
    },
    alternativeMethods: {
      ...enUS.signIn?.alternativeMethods,
      title: "სხვა მეთოდი",
      actionLink: "სხვა გზით შესვლა",
      blockButton__emailCode: "ერთჯერადი კოდი ელფოსტაზე",
      blockButton__password: "პაროლით",
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: "შექმენი Mise ანგარიში",
      subtitle: "დაიწყე შენი სამზარეულოს აღრიცხვა",
      actionText: "უკვე გაქვს ანგარიში?",
      actionLink: "შესვლა",
    },
  },
  userButton: {
    ...enUS.userButton,
    action__addAccount: "ანგარიშის დამატება",
    action__closeUserMenu: "მენიუს დახურვა",
    action__manageAccount: "ანგარიშის მართვა",
    action__openUserMenu: "ანგარიშის მენიუ",
    action__signOut: "გასვლა",
    action__signOutAll: "ყველა ანგარიშიდან გასვლა",
    label__accountActions: "მოქმედებები",
    label__activeSessions: "აქტიური სესიები",
    label__userButtonPopover: "ანგარიში",
  },
  userProfile: {
    ...enUS.userProfile,
    formButtonPrimary__add: "დამატება",
    formButtonPrimary__continue: "გაგრძელება",
    formButtonPrimary__finish: "დასრულება",
    formButtonPrimary__remove: "წაშლა",
    formButtonPrimary__save: "შენახვა",
    formButtonReset: "გაუქმება",
    mobileButton__menu: "მენიუ",
    navbar: {
      ...enUS.userProfile?.navbar,
      account: "ანგარიში",
      security: "უსაფრთხოება",
      title: "ანგარიში",
      description: "შენი ანგარიშის ინფორმაცია",
    },
    profilePage: {
      ...enUS.userProfile?.profilePage,
      title: "პროფილის განახლება",
      successMessage: "პროფილი განახლდა",
      imageFormTitle: "პროფილის სურათი",
      imageFormSubtitle: "ატვირთვა",
      imageFormDestructiveActionSubtitle: "წაშლა",
      fileDropAreaHint: "რეკომენდებული ზომა 1:1, მაქს. 10MB",
    },
    passwordPage: {
      ...enUS.userProfile?.passwordPage,
      title__set: "პაროლის დაყენება",
      title__update: "პაროლის განახლება",
      successMessage__set: "პაროლი დაყენდა",
      successMessage__update: "პაროლი განახლდა",
      successMessage__signOutOfOtherSessions:
        "სხვა მოწყობილობებიდან გასვლა შესრულდა",
      readonly:
        "პაროლის შეცვლა ამჟამად შეუძლებელია, რადგან შესვლა მხოლოდ enterprise კავშირით ხდება",
      checkboxInfoText__signOutOfOtherSessions:
        "რეკომენდებულია სხვა მოწყობილობებიდან გასვლა, სადაც ძველი პაროლი გამოყენებული იყო",
    },
    emailAddressPage: {
      ...enUS.userProfile?.emailAddressPage,
      title: "ელფოსტის დამატება",
      verifyTitle: "ელფოსტის დადასტურება",
      formHint: "ელფოსტა უნდა დაადასტურო, სანამ ანგარიშზე დაემატება",
      removeResource: {
        ...enUS.userProfile?.emailAddressPage?.removeResource,
        title: "ელფოსტის წაშლა",
        messageLine1: "{{identifier}} ამოღებული იქნება ანგარიშიდან",
        messageLine2: "ამ ელფოსტით შესვლა აღარ იქნება შესაძლებელი",
      },
    },
    deletePage: {
      ...enUS.userProfile?.deletePage,
      title: "ანგარიშის წაშლა",
      confirm: "ანგარიშის წაშლა",
      actionDescription: 'გასაგრძელებლად ქვემოთ ჩაწერე "Delete account"',
      messageLine1:
        "დარწმუნებული ხარ, რომ გინდა ანგარიშის წაშლა? ზოგი მონაცემი შეიძლება შენახული დარჩეს",
      messageLine2: "ეს მოქმედება მუდმივია და შეუქცევადი",
    },
    start: {
      ...enUS.userProfile?.start,
      headerTitle__account: "ანგარიშის დეტალები",
      headerTitle__security: "უსაფრთხოება",
      headerSubtitle__account: "პროფილი და საკონტაქტო",
      headerSubtitle__security: "პაროლი და შესვლა",
      profileSection: {
        title: "პროფილი",
        primaryButton: "პროფილის განახლება",
      },
      emailAddressesSection: {
        title: "ელფოსტები",
        primaryButton: "ელფოსტის დამატება",
        destructiveAction: "ელფოსტის წაშლა",
        detailsAction__primary: "დადასტურების დასრულება",
        detailsAction__unverified: "დადასტურება",
        detailsAction__nonPrimary: "ძირითადად მონიშვნა",
      },
      passwordSection: {
        title: "პაროლი",
        primaryButton__setPassword: "პაროლის დაყენება",
        primaryButton__updatePassword: "პაროლის განახლება",
      },
      connectedAccountsSection: {
        title: "დაკავშირებული ანგარიშები",
        primaryButton: "ანგარიშის დაკავშირება",
        destructiveActionTitle: "წაშლა",
        actionLabel__reauthorize: "ხელახლა ავტორიზაცია",
        actionLabel__connectionFailed: "ხელახლა დაკავშირება",
        subtitle__disconnected: "ეს ანგარიში გათიშულია",
      },
      activeDevicesSection: {
        title: "აქტიური მოწყობილობები",
        destructiveAction: "მოწყობილობიდან გასვლა",
      },
      mfaSection: {
        title: "ორფაქტორიანი დაცვა",
        primaryButton: "ორფაქტორიანი დაცვის დამატება",
      },
      dangerSection: {
        title: "ანგარიშის წაშლა",
        deleteAccountButton: "ანგარიშის წაშლა",
      },
    },
  },
} as Loc;

export const enMise: Loc = {
  ...enUS,
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: "Sign in to Mise",
      subtitle: "Welcome back to your kitchen",
    },
    alternativeMethods: {
      ...enUS.signIn?.alternativeMethods,
      actionLink: "Use another method",
      blockButton__emailCode: "Email one-time code",
      blockButton__password: "Password",
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: "Create your Mise account",
      subtitle: "Stock · recipes · profit — start here",
    },
  },
};

export function clerkLocalization(locale: "ka" | "en"): Loc {
  return locale === "ka" ? kaGE : enMise;
}

export const clerkAppearance = {
  variables: {
    colorPrimary: "#0f766e",
    colorText: "#0f1a17",
    colorTextSecondary: "#3d4f48",
    colorBackground: "#ffffff",
    colorInputBackground: "#f3f6f4",
    colorInputText: "#0f1a17",
    colorNeutral: "#3d4f48",
    borderRadius: "0.75rem",
    fontFamily:
      '"IBM Plex Sans", "Noto Sans Georgian", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    rootBox: "w-full mx-auto",
    cardBox: "w-full !bg-transparent !shadow-none",
    card: "!bg-white !shadow-none !border !border-[#d7e0db] !rounded-2xl !p-6 sm:!p-8",
    main: "!bg-white",
    headerTitle:
      "font-[Cormorant_Garamond,Noto_Serif_Georgian,serif] text-2xl font-semibold !text-[#0f1a17]",
    headerSubtitle: "!text-[#6b7c74]",
    socialButtonsBlockButton:
      "!border !border-[#d7e0db] !bg-white hover:!border-[#0f766e] hover:!bg-[#e6f4f1] !text-[#0f1a17] transition",
    formButtonPrimary:
      "!bg-[#0f766e] hover:!bg-[#0a4f4a] !text-white !shadow-none",
    formFieldInput: "!bg-[#f3f6f4] !border-[#d7e0db] !text-[#0f1a17]",
    formFieldLabel: "!text-[#3d4f48]",
    footerActionLink: "!text-[#0f766e] hover:!text-[#0a4f4a]",
    identityPreviewEditButton: "!text-[#0f766e]",
    alternativeMethodsBlockButton:
      "!border !border-[#d7e0db] !bg-white !text-[#0f1a17]",
    // Hide Clerk chrome / dark development strip
    footer: "!hidden",
    footerAction: "!hidden",
    footerPages: "!hidden",
    logoBox: "!hidden",
    logoImage: "!hidden",
    badge: "!hidden",
  },
  layout: {
    socialButtonsPlacement: "top" as const,
    showOptionalFields: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
};

const miseClerkFont =
  '"IBM Plex Sans", "Noto Sans Georgian", ui-sans-serif, system-ui, sans-serif';
const miseClerkSidebarFont =
  '"Space Grotesk", "Firago", "Noto Sans Georgian", ui-sans-serif, system-ui, sans-serif';

/** Shared dark Clerk surface — matches app sidebar dark tones. */
const miseClerkDarkVariables = {
  colorBackground: "#141e1a",
  colorText: "#ffffff",
  colorTextSecondary: "rgba(255, 255, 255, 0.88)",
  colorInputBackground: "#0f1916",
  colorInputText: "#ffffff",
  colorPrimary: "#2dd4bf",
  colorNeutral: "rgba(255, 255, 255, 0.14)",
  borderRadius: "0.75rem",
  fontSize: "1rem",
  fontFamily: miseClerkFont,
};

const miseClerkLightVariables = {
  colorBackground: "#ffffff",
  colorText: "#0f1a17",
  colorTextSecondary: "#3d4f48",
  colorInputBackground: "#f3f6f4",
  colorInputText: "#0f1a17",
  colorPrimary: "#0f766e",
  colorNeutral: "rgba(15, 26, 23, 0.12)",
  borderRadius: "0.75rem",
  fontSize: "1rem",
  fontFamily: miseClerkFont,
};

const miseClerkDarkSidebarVariables = {
  ...miseClerkDarkVariables,
  fontFamily: miseClerkSidebarFont,
};

const miseClerkLightSidebarVariables = {
  ...miseClerkLightVariables,
  fontFamily: miseClerkSidebarFont,
};

const sidebarUserButtonElements = {
  rootBox: "sidebar-user-btn-root !w-auto !mx-0 !bg-transparent",
  userButtonBox: "!shadow-none",
  userButtonTrigger:
    "rounded-full !border-0 !bg-transparent p-0 !shadow-none hover:!bg-transparent focus:!shadow-none focus-visible:!outline-none",
  avatarBox: "size-9 !ring-2 !ring-white/25",
  userButtonPopoverCard: "sidebar-user-menu",
  userButtonPopoverRootBox: "sidebar-user-menu-root !bg-transparent !w-auto",
  userButtonPopoverMain: "sidebar-user-menu-main",
  userButtonPopoverActions: "sidebar-user-menu-actions",
  userButtonPopoverActionButton:
    "sidebar-user-menu-action !py-3 !px-4 !gap-1.5",
  userButtonPopoverActionButtonText: "!text-[1rem] !font-normal !leading-snug",
  userButtonPopoverActionButtonIcon: "!size-5",
  userButtonPopoverActionButtonIconBox: "!size-5 !mr-0",
  userButtonPopoverFooter: "!hidden",
  userPreview: "sidebar-user-menu-preview !px-4 !py-3",
  userPreviewMainIdentifier: "!text-[1.05rem] !font-normal",
  userPreviewSecondaryIdentifier: "!text-[0.9375rem] !font-normal",
  userPreviewAvatarBox: "size-10",
};

const sidebarUserProfileElements = {
  modalContent: "mise-clerk-profile",
  modalCloseButton: "mise-clerk-profile-close",
  card: "mise-clerk-profile-card",
  cardBox: "mise-clerk-profile-cardbox",
  rootBox: "mise-clerk-profile-root",
  navbar: "mise-clerk-profile-nav",
  navbarButton: "mise-clerk-profile-nav-btn",
  navbarMobileMenuRow: "mise-clerk-profile-nav-row",
  navbarHeader: "!hidden",
  navbarHeaderTitle: "!hidden",
  navbarHeaderDescription: "!hidden",
  pageScrollBox: "mise-clerk-profile-page",
  headerTitle: "mise-clerk-profile-title",
  headerSubtitle: "mise-clerk-profile-subtitle",
  profileSectionTitle: "mise-clerk-profile-section-title",
  profileSectionContent: "mise-clerk-profile-section-content",
  profileSectionPrimaryButton: "mise-clerk-profile-section-btn",
  formFieldLabel: "mise-clerk-profile-label",
  formFieldInput: "mise-clerk-profile-input",
  formButtonPrimary: "mise-clerk-profile-btn-primary",
  formButtonReset: "mise-clerk-profile-btn-reset",
  menuButton: "mise-clerk-profile-menu-btn",
  menuList: "mise-clerk-profile-menu-list",
  menuItem: "mise-clerk-profile-menu-item",
  accordionTriggerButton: "mise-clerk-profile-accordion",
  badge: "!hidden",
  footer: "!hidden",
  footerAction: "!hidden",
  footerPages: "!hidden",
  profileSection: "mise-clerk-profile-section",
  profileSectionHeader: "mise-clerk-profile-section-header",
  scrollBox: "mise-clerk-profile-scroll",
};

/** Sidebar account popover — theme-aware. */
export function sidebarUserButtonAppearance(theme: "light" | "dark" = "dark") {
  return {
    variables:
      theme === "dark"
        ? miseClerkDarkSidebarVariables
        : miseClerkLightSidebarVariables,
    elements: sidebarUserButtonElements,
  };
}

/** Manage-account modal — theme-aware (IBM Plex — same as when UI was settled). */
export function sidebarUserProfileAppearance(theme: "light" | "dark" = "dark") {
  return {
    variables: {
      ...(theme === "dark" ? miseClerkDarkVariables : miseClerkLightVariables),
    },
    elements: sidebarUserProfileElements,
  };
}
