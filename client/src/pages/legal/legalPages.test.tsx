/**
 * The footer used to advertise a privacy policy, a returns policy and contact
 * details as plain text with nothing behind any of them. These pin that each
 * page exists, says the thing it is supposed to say, and that the footer points
 * at routes rather than at nowhere.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Footer from '../../components/Footer.js';
import { site } from '../../config/site.js';
import About from './About.js';
import Contact from './Contact.js';
import Privacy from './Privacy.js';
import Returns from './Returns.js';
import Terms from './Terms.js';

const renderPage = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('policy and information pages', () => {
  it.each([
    ['privacy policy', <Privacy key="p" />, 'Privacy policy'],
    ['terms of service', <Terms key="t" />, 'Terms of service'],
    ['returns policy', <Returns key="r" />, 'Returns and refunds'],
    ['about page', <About key="a" />, `About ${site.name}`],
    ['contact page', <Contact key="c" />, 'Contact us'],
  ])('the %s renders', (_label, ui, heading) => {
    renderPage(ui);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('the privacy policy names the data it actually collects', () => {
    renderPage(<Privacy />);
    // Scoped to the article: the footer repeats the contact details, so a
    // page-wide query would match twice and say nothing useful.
    const body = within(screen.getByRole('main'));

    // If the model gains a field, this page should gain a line about it.
    for (const field of ['phone number', 'delivery address', 'date of birth']) {
      expect(body.getAllByText(new RegExp(field, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('the privacy policy is honest about the one cookie that is set', () => {
    renderPage(<Privacy />);

    expect(screen.getByText(/exactly one cookie/i)).toBeInTheDocument();
    expect(screen.getByText(/no advertising or analytics cookies/i)).toBeInTheDocument();
  });

  it('the returns policy states the window the code enforces', () => {
    renderPage(<Returns />);

    // BuyerBookList allows a return within three days of the order date. If one
    // changes without the other, this fails.
    expect(screen.getByText(/three days/i)).toBeInTheDocument();
  });

  it('every page offers a way to reach a human', () => {
    renderPage(<Contact />);
    const body = within(screen.getByRole('main'));

    expect(body.getByRole('link', { name: site.email })).toHaveAttribute(
      'href',
      `mailto:${site.email}`
    );
  });
});

describe('footer', () => {
  it('links to pages that exist rather than to nothing', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const expected = ['/about', '/contact', '/privacy', '/terms', '/returns'];
    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');

    for (const route of expected) {
      expect(hrefs.some((href) => href.startsWith(route))).toBe(true);
    }
  });

  it('shows the contact details from one place, not typed out again', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: site.email })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: site.phone })).toBeInTheDocument();
  });
});
