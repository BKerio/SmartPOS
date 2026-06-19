import { toast as sonner } from "sonner";

export const toast = {
  success: (message: string, description?: string) =>
    sonner.success(message, { description }),

  error: (message: string, description?: string) =>
    sonner.error(message, { description }),

  warning: (message: string, description?: string) =>
    sonner.warning(message, { description }),

  info: (message: string, description?: string) =>
    sonner.info(message, { description }),

  /** Toast with confirm / cancel actions — resolves true when confirmed */
  confirm: (
    message: string,
    options?: { description?: string; confirmLabel?: string; cancelLabel?: string }
  ): Promise<boolean> =>
    new Promise((resolve) => {
      const id = sonner(message, {
        description: options?.description,
        duration: Infinity,
        action: {
          label: options?.confirmLabel ?? "Confirm",
          onClick: () => {
            sonner.dismiss(id);
            resolve(true);
          },
        },
        cancel: {
          label: options?.cancelLabel ?? "Cancel",
          onClick: () => {
            sonner.dismiss(id);
            resolve(false);
          },
        },
        onDismiss: () => resolve(false),
      });
    }),
};
