import { useMemo } from 'react';
import { useSnackbar, type SnackbarKey, type VariantType } from 'notistack';

/** A button offered alongside the message, for the obvious next step. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

type Notify = (message: string, options?: ToastOptions) => void;

export interface Toast {
  /** Something the visitor asked for happened. */
  success: Notify;
  /** Something failed. Stays longest, because it is the one worth reading. */
  error: Notify;
  /** Neither, such as a prompt to sign in. */
  info: Notify;
  /** Nothing broke, but the visitor cannot do what they tried. */
  warning: Notify;
}

/**
 * How long each kind stays up. A confirmation is read at a glance; a failure
 * needs long enough to take in and, often, to act on.
 */
const DURATION: Record<VariantType, number> = {
  default: 3500,
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

/**
 * Toasts, in the four kinds the pages actually need.
 *
 * A wrapper over notistack rather than `useSnackbar` at every call site: how
 * long a message stays and where it appears are decided here and in
 * `main.tsx`, so a page says what happened rather than how to display it.
 *
 * It replaces `alert()`, which blocked the whole tab until it was dismissed,
 * could not be styled, could not carry an action, and announced a successful
 * add-to-cart with the same modal interruption as a failure.
 */
export const useToast = (): Toast => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  return useMemo(() => {
    const show = (variant: VariantType, message: string, options?: ToastOptions): void => {
      const action = options?.action;

      enqueueSnackbar(message, {
        variant,
        autoHideDuration: DURATION[variant],
        action: action
          ? (key: SnackbarKey) => (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  closeSnackbar(key);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            )
          : undefined,
      });
    };

    return {
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
      info: (message, options) => show('info', message, options),
      warning: (message, options) => show('warning', message, options),
    };
  }, [enqueueSnackbar, closeSnackbar]);
};

/**
 * What an anonymous visitor is told when they try to use the cart or the
 * wishlist.
 *
 * One place, because it happens on five pages - and it carries a way to act on
 * it. "Please sign in to use cart." with no sign-in link is a dead end, and a
 * dead end at the exact moment somebody wanted to buy something.
 */
export const promptSignIn = (
  toast: Toast,
  goToSignIn: () => void,
  what: 'cart' | 'wishlist'
): void => {
  toast.info(`Sign in to use your ${what}.`, {
    action: { label: 'Sign in', onClick: goToSignIn },
  });
};
