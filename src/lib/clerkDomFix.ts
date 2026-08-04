/** Hide Clerk branding chrome and stop password managers from stuffing current password into "new password" fields. */

function hideNode(el: HTMLElement) {
  if (el.dataset.miseHidden === "1") return;
  el.style.setProperty("display", "none", "important");
  el.setAttribute("aria-hidden", "true");
  el.dataset.miseHidden = "1";
}

function hideSecuredByClerk() {
  // Only hide known branding nodes — never climb to generic cl-internal ancestors
  // (those wrap UserButton / popover and would swallow the whole menu).
  const exact = document.querySelectorAll<HTMLElement>(
    [
      ".cl-internal-1wi0bo5",
      ".cl-footer",
      ".cl-userProfile-footer",
      ".cl-userButtonPopoverFooter",
      '[class*="userButtonPopoverFooter"]',
      '[class*="userProfile-footer"]',
      '[data-localization-key*="secured"]',
      '[data-localization-key*="Secured"]',
    ].join(","),
  );
  for (const el of exact) hideNode(el);

  for (const el of document.querySelectorAll<HTMLElement>(
    'a[href*="clerk.com"]',
  )) {
    hideNode(el);
    const p = el.closest("p");
    if (p && /secured\s+by/i.test((p.textContent || "").replace(/\s+/g, " "))) {
      hideNode(p);
    }
  }

  for (const el of document.querySelectorAll<HTMLElement>("p")) {
    if (el.dataset.miseHidden === "1") continue;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length > 40) continue;
    if (!/^secured\s+by\b/i.test(text)) continue;
    hideNode(el);
  }
}

function forceClear(input: HTMLInputElement) {
  if (!input.value) return;
  const proto = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  proto?.set?.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findPasswordInputs(
  suffix: "newPassword" | "confirmPassword" | "currentPassword",
) {
  const selectors = [
    `input.cl-formFieldInput__${suffix}`,
    `.cl-formFieldInput__${suffix}`,
    `.cl-formField__${suffix} input`,
    `.cl-formFieldRow__${suffix} input`,
    `[class*="formFieldInput__${suffix}"]`,
    `[class*="formField__${suffix}"] input`,
    `[class*="formFieldLabelRow__${suffix}"]`,
  ];
  const found = new Set<HTMLInputElement>();
  for (const sel of selectors) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (
          el instanceof HTMLInputElement &&
          (el.type === "password" || el.type === "text")
        ) {
          if (
            el.type === "text" &&
            !el.className.includes("Password") &&
            !sel.includes("Password")
          ) {
            /* skip unrelated text inputs */
          } else if (el.type === "password") {
            found.add(el);
            continue;
          }
        }
        if (el instanceof HTMLElement) {
          const wrap =
            el.closest(
              '.cl-formField, [class*="formFieldRow"], [class*="formField__"], [class*="cl-formField"]',
            ) ?? el.parentElement;
          wrap
            ?.querySelectorAll<HTMLInputElement>('input[type="password"]')
            .forEach((i) => found.add(i));
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

function guardNewPasswordField(input: HTMLInputElement, name: string) {
  input.setAttribute("autocomplete", "new-password");
  input.setAttribute("name", name);
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
  input.classList.add("mise-pw-new");

  if (input.dataset.misePwFocused !== "1") {
    input.setAttribute("readonly", "readonly");
  }

  if (input.dataset.misePwGuarded === "1") {
    if (input.dataset.misePwFocused !== "1") {
      input.setAttribute("readonly", "readonly");
      if (input.value) forceClear(input);
    }
    return;
  }
  input.dataset.misePwGuarded = "1";

  const unlock = () => {
    input.dataset.misePwFocused = "1";
    input.removeAttribute("readonly");
  };
  input.addEventListener("focus", unlock);
  input.addEventListener("pointerdown", unlock);

  // Reject any value until the user focuses the field (blocks browser autofill)
  input.addEventListener("input", () => {
    if (input.dataset.misePwFocused !== "1") forceClear(input);
  });

  forceClear(input);
  const started = Date.now();
  const poll = window.setInterval(() => {
    if (
      input.dataset.misePwFocused === "1" ||
      !input.isConnected ||
      Date.now() - started > 5000
    ) {
      window.clearInterval(poll);
      return;
    }
    forceClear(input);
  }, 50);
}

function fixPasswordAutofill() {
  // Prefer Clerk's own __newPassword / __confirmPassword class hooks (not DOM order)
  const news = findPasswordInputs("newPassword");
  const confirms = findPasswordInputs("confirmPassword");
  const currents = findPasswordInputs("currentPassword");

  for (const input of currents) {
    input.setAttribute("autocomplete", "current-password");
    input.setAttribute("name", "currentPassword");
    input.removeAttribute("readonly");
    input.classList.remove("mise-pw-new");
  }

  news.forEach((input) => guardNewPasswordField(input, "newPassword"));
  confirms.forEach((input) => guardNewPasswordField(input, "confirmPassword"));

  // Fallback: profile modal with 2+ password fields and no Clerk suffixes found
  if (news.length + confirms.length > 0) return;

  const profile = document.querySelector(
    ".mise-clerk-profile, .cl-modalContent.mise-clerk-profile, .cl-userProfile-root, .cl-modalContent",
  );
  if (!profile) return;

  const inputs = Array.from(
    profile.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  );
  if (inputs.length < 2) return;

  const [current, ...rest] = inputs;
  current.setAttribute("autocomplete", "current-password");
  current.setAttribute("name", "currentPassword");
  current.removeAttribute("readonly");
  rest.forEach((input, i) => {
    guardNewPasswordField(input, i === 0 ? "newPassword" : "confirmPassword");
  });
}

export function startClerkDomFix() {
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      hideSecuredByClerk();
      fixPasswordAutofill();
    });
  };

  run();
  const observer = new MutationObserver(() => run());
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
