import Swal from "sweetalert2";

/**
 * Central SweetAlert2 wrapper, styled with the design system (see .swal* rules in styles/design.css).
 * Notices are corner toasts; confirm() is a centred dialog.
 */

type Kind = "success" | "error" | "warning" | "info";

const ICON_COLOR: Record<Kind | "question", string> = {
  success: "#169A5B",
  error: "#D62828",
  warning: "#B7791F",
  info: "#2563EB",
  question: "#1E3A8A",
};

const TIMER: Record<Kind, number> = { success: 2500, info: 4000, warning: 5000, error: 6000 };

const DESTRUCTIVE = /delete|remove|logout|log out|sign out|reset|replace|reject|deactivate|disable|revoke|suspend|cancel order|void/i;

const notify = (icon: Kind, message: string, description?: string) =>
  Swal.fire({
    buttonsStyling: false,
    toast: true,
    position: "top-end",
    icon,
    iconColor: ICON_COLOR[icon],
    title: message,
    text: description,
    showConfirmButton: false,
    showCloseButton: icon === "error",
    timer: TIMER[icon],
    timerProgressBar: true,
    customClass: { popup: "swal-toast" },
  });

type ConfirmTone = "danger" | "warning" | "primary";

// Lucide icons (trash-2, triangle-alert, circle-help, circle-check) as inline SVG for the dialog.
const svg = (d: string) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  check: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const toast = {
  success: (message: string, description?: string) => notify("success", message, description),
  error: (message: string, description?: string) => notify("error", message, description),
  warning: (message: string, description?: string) => notify("warning", message, description),
  info: (message: string, description?: string) => notify("info", message, description),

  /**
   * Confirmation sheet - resolves true when confirmed.
   *   message        the question, e.g. "Delete this staff member?"
   *   description    one or two sentences on what happens
   *   subject        who/what is affected, shown as a card (name + detail line, with initials)
   *   points         short list of consequences ("Their login stops working", ...)
   *   typeToConfirm  for the most dangerous actions: the word the user must type (e.g. "DELETE")
   *   tone           danger (red), warning (amber) or primary (navy); guessed from the wording if omitted
   */
  confirm: async (
    message: string,
    options?: {
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
      tone?: ConfirmTone;
      subject?: { name: string; detail?: string | null };
      points?: string[];
      typeToConfirm?: string;
    },
  ): Promise<boolean> => {
    const confirmLabel = options?.confirmLabel ?? "Confirm";
    const words = `${confirmLabel} ${message}`;
    const tone: ConfirmTone =
      options?.tone ?? (options?.danger === false ? "primary" : options?.danger || DESTRUCTIVE.test(words) ? (/reset|replace|disable|stop|suspend/i.test(words) && !/delete|remove/i.test(words) ? "warning" : "danger") : "primary");
    const icon = /approve|enable|activate|restore|confirm/i.test(words) && tone === "primary" ? ICONS.check : /delete|remove|void|revoke/i.test(words) ? ICONS.trash : tone === "primary" ? ICONS.help : ICONS.alert;
    const subject = options?.subject;
    const typed = options?.typeToConfirm?.trim();

    const html = `
      <div class="cf-head">
        <span class="cf-icon cf-${tone}" aria-hidden="true">${icon}</span>
        <div class="cf-text">
          <h2 class="cf-title" id="cf-title">${escapeHtml(message)}</h2>
          ${options?.description ? `<p class="cf-desc">${escapeHtml(options.description)}</p>` : ""}
        </div>
      </div>
      ${subject ? `
        <div class="cf-subject">
          <span class="cf-av" aria-hidden="true">${escapeHtml(initialsOf(subject.name))}</span>
          <span class="cf-subject-meta"><b>${escapeHtml(subject.name)}</b>${subject.detail ? `<span>${escapeHtml(subject.detail)}</span>` : ""}</span>
        </div>` : ""}
      ${options?.points?.length ? `<ul class="cf-points cf-${tone}">${options.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join("")}</ul>` : ""}
      ${typed ? `
        <label class="cf-type" for="cf-type-input">Type <b>${escapeHtml(typed)}</b> to confirm</label>
        <input id="cf-type-input" class="input cf-type-input" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(typed)}" />` : ""}
      ${tone === "danger" ? `<p class="cf-note">This can't be undone.</p>` : ""}
    `;

    const result = await Swal.fire({
      buttonsStyling: false,
      html,
      showCancelButton: true,
      confirmButtonText: confirmLabel,
      cancelButtonText: options?.cancelLabel ?? "Cancel",
      reverseButtons: true,
      focusCancel: tone !== "primary",
      showClass: { popup: "cf-in" },
      hideClass: { popup: "cf-out" },
      width: 460,
      customClass: {
        popup: "cf-popup",
        htmlContainer: "cf-body",
        actions: "cf-actions",
        confirmButton: `btn ${tone === "danger" ? "btn-danger" : tone === "warning" ? "btn-warning" : "btn-primary"}`,
        cancelButton: "btn btn-ghost",
      },
      didOpen: (popup) => {
        popup.setAttribute("aria-labelledby", "cf-title");
        if (!typed) return;
        const input = popup.querySelector<HTMLInputElement>("#cf-type-input");
        const btn = Swal.getConfirmButton();
        const sync = () => {
          const ok = input?.value.trim().toUpperCase() === typed.toUpperCase();
          if (btn) btn.disabled = !ok;
        };
        sync();
        input?.addEventListener("input", sync);
        input?.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && btn && !btn.disabled) btn.click();
        });
        input?.focus();
      },
    });
    return result.isConfirmed;
  },

  /** Sign-out confirmation showing the signed-in account - resolves true when confirmed */
  signOut: async (account: { name?: string | null; detail?: string | null } | null): Promise<boolean> => {
    const name = account?.name?.trim() || "Signed-in user";
    const initials = name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const result = await Swal.fire({
      buttonsStyling: false,
      title: "Sign out of SmartPOS?",
      html: `
        <div class="swal-signout-account">
          <span class="swal-signout-av" aria-hidden="true">${escapeHtml(initials)}</span>
          <span class="swal-signout-meta">
            <b>${escapeHtml(name)}</b>
            ${account?.detail ? `<span>${escapeHtml(account.detail)}</span>` : ""}
          </span>
        </div>
        <p class="swal-signout-note">You'll need to sign in again to continue.</p>
      `,
      showCancelButton: true,
      confirmButtonText: "Sign out",
      cancelButtonText: "Cancel",
      focusCancel: true,
      width: 420,
      customClass: {
        popup: "swal-signout",
        title: "swal-signout-title",
        htmlContainer: "swal-signout-html",
        actions: "swal-signout-actions",
        confirmButton: "swal-signout-confirm",
        cancelButton: "swal-signout-cancel",
      },
    });
    return result.isConfirmed;
  },
};
