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

  /** Dialog with confirm / cancel - resolves true when confirmed */
  confirm: (
    message: string,
    options?: { description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
  ): Promise<boolean> => {
    const confirmLabel = options?.confirmLabel ?? "Confirm";
    const danger = options?.danger ?? DESTRUCTIVE.test(`${confirmLabel} ${message}`);
    return Swal.fire({
      buttonsStyling: false,
      title: message,
      text: options?.description,
      icon: danger ? "warning" : "question",
      iconColor: danger ? ICON_COLOR.error : ICON_COLOR.question,
      showCancelButton: true,
      confirmButtonText: confirmLabel,
      cancelButtonText: options?.cancelLabel ?? "Cancel",
      reverseButtons: true,
      focusCancel: danger,
      customClass: {
        popup: "swal-confirm",
        confirmButton: `btn ${danger ? "btn-danger" : "btn-primary"}`,
        cancelButton: "btn btn-ghost",
        actions: "swal-actions",
      },
    }).then((result) => result.isConfirmed);
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
