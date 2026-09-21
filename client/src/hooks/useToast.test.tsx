/**
 * Every message the app shows used to be an `alert()`: a modal box that
 * blocked the tab, could not be styled, could not carry an action, and
 * announced a successful add-to-cart exactly as loudly as a failure.
 *
 * These pin what replaced it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';

import { promptSignIn, useToast, type Toast } from './useToast.js';

/** Renders a button that raises the toast the test is about. */
const Raise = ({ show }: { show: (toast: Toast) => void }) => {
  const toast = useToast();
  return (
    <button type="button" onClick={() => show(toast)}>
      raise
    </button>
  );
};

const raise = async (show: (toast: Toast) => void): Promise<void> => {
  render(
    <SnackbarProvider>
      <Raise show={show} />
    </SnackbarProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'raise' }));
};

describe('useToast', () => {
  it.each([
    ['success', (t: Toast) => t.success('Added to your cart.'), 'Added to your cart.'],
    ['error', (t: Toast) => t.error('Could not update your cart.'), 'Could not update your cart.'],
    ['info', (t: Toast) => t.info('No new notifications.'), 'No new notifications.'],
    ['warning', (t: Toast) => t.warning('This book is out of stock.'), 'This book is out of stock.'],
  ])('shows a %s message', async (_kind, show, message) => {
    await raise(show);

    // notistack gives each one role="alert", so a screen reader announces it.
    // An alert() was announced by being the only thing the tab would talk to.
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('carries a button for the obvious next step', async () => {
    const onClick = vi.fn();
    await raise((toast) =>
      toast.info('Sign in to use your cart.', { action: { label: 'Sign in', onClick } })
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('dismisses itself once its button has been used', async () => {
    await raise((toast) =>
      toast.info('Sign in to use your cart.', { action: { label: 'Sign in', onClick: vi.fn() } })
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    // Left up, it would sit over the page it just navigated to. `waitFor`
    // because it slides out rather than vanishing.
    await waitFor(() =>
      expect(screen.queryByText('Sign in to use your cart.')).not.toBeInTheDocument()
    );
  });

  it('does not block the page the way alert() did', async () => {
    await raise((toast) => toast.success('Added to your cart.'));
    await screen.findByRole('alert');

    // The point of the change: the button underneath is still usable while the
    // message is up. `alert()` froze the tab until it was dismissed.
    await userEvent.click(screen.getByRole('button', { name: 'raise' }));

    expect(screen.getByRole('button', { name: 'raise' })).toBeEnabled();
  });
});

describe('promptSignIn', () => {
  it('names the thing the visitor was trying to use', async () => {
    await raise((toast) => promptSignIn(toast, vi.fn(), 'wishlist'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to use your wishlist.');
  });

  it('offers a way there, rather than a dead end', async () => {
    // "Please sign in to use cart." with no link was the old text, at the exact
    // moment somebody wanted to buy something.
    const goToSignIn = vi.fn();
    await raise((toast) => promptSignIn(toast, goToSignIn, 'cart'));

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(goToSignIn).toHaveBeenCalledOnce();
  });
});
