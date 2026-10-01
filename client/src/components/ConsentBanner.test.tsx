import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ConsentBanner from './ConsentBanner.js';
import { allowed, openConsentSettings } from '../utils/consent.js';

const show = () =>
  render(
    <MemoryRouter>
      <ConsentBanner />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.removeItem('consent');
});

describe('the storage consent', () => {
  it('asks on a first visit, and Accept all allows everything', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(screen.queryByRole('region', { name: /cookies/i })).not.toBeInTheDocument();
    expect(allowed('preferences') && allowed('personalisation') && allowed('diagnostics')).toBe(true);
  });

  it('keeps only what is necessary when asked, and deletes the rest', async () => {
    localStorage.setItem('recentlyViewed', '["a"]');
    localStorage.setItem('theme', 'dark');
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Necessary only' }));
    expect(allowed('preferences')).toBe(false);
    expect(localStorage.getItem('recentlyViewed')).toBeNull();
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('lets each kind be chosen, with the necessary one always on', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(screen.getByRole('switch', { name: /necessary: always on/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Personalisation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    expect(allowed('preferences')).toBe(true);
    expect(allowed('personalisation')).toBe(false);
  });

  it('opens again from anywhere, once chosen', async () => {
    localStorage.setItem('consent', JSON.stringify({ version: 1, at: '', preferences: true, personalisation: true, diagnostics: false }));
    show();
    expect(screen.queryByRole('button', { name: 'Necessary only' })).not.toBeInTheDocument();
    openConsentSettings();
    expect(await screen.findByRole('dialog', { name: /cookies and storage/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Error reports' })).not.toBeChecked();
  });
});
