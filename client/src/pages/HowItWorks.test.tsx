import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import HowItWorks from './HowItWorks.js';
import ProfileSetup from '../components/ProfileSetup.js';

describe('the How it works tour', () => {
  it('walks through buying a step at a time, and switches to selling', async () => {
    render(
      <MemoryRouter>
        <HowItWorks />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Find your book' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: 'Check it out' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /sell/i }));
    expect(screen.getByRole('heading', { name: 'Get ready to be paid' })).toBeInTheDocument();
  });
});

describe('the profile set-up card', () => {
  const show = (profile: Record<string, unknown>, mode: 'buyer' | 'seller' = 'buyer') =>
    render(
      <MemoryRouter>
        <ProfileSetup profile={{ email: 'a@b.c', username: 'a', ...profile }} mode={mode} />
      </MemoryRouter>
    );

  it('shows how far along it is, with links to what is left', () => {
    show({ phone: '01710000002', address: 'Dhaka' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByRole('link', { name: /add a profile picture/i })).toHaveAttribute('href', '/update-profile?mode=buyer#up-picture');
  });

  it('asks a seller for a bKash number too, and disappears once complete', () => {
    const { container, unmount } = show({}, 'seller');
    expect(screen.getByRole('link', { name: /bkash/i })).toBeInTheDocument();
    unmount();
    const complete = {
      profilePicture: 'p.png', phone: '1', address: 'a', dateOfBirth: '2000-01-01', buyerBanner: 'b.png', twoFactor: true,
    };
    show(complete);
    expect(container.querySelector('#setup')).toBeNull();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
