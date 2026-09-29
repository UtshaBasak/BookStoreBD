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
import { deliveryChargeFor, site } from '../../config/site.js';
import {
  DELIVERY,
  RETURN_WINDOW_DAYS,
  deliveryChargeFor as serverDeliveryCharge,
} from '../../../../server/config/commerce.js';
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

  it('the returns policy states the window the API enforces', () => {
    renderPage(<Returns />);
    const body = within(screen.getByRole('main'));

    // Counted from delivery: it used to be three days from the order date,
    // which a slow parcel could use up before it arrived.
    expect(body.getByText(/7 days of\s+delivery/i)).toBeInTheDocument();
    expect(body.getByText(/15 working days of the book\s+reaching us/i)).toBeInTheDocument();
    expect(body.getByText(/delivery charge you paid on the original order is not refunded/i)).toBeInTheDocument();
  });

  it('the terms quote the delivery charges and the seller fee', () => {
    renderPage(<Terms />);
    const body = within(screen.getByRole('main'));

    expect(body.getByText(/70 Tk/)).toBeInTheDocument();
    expect(body.getByText(/120 Tk/)).toBeInTheDocument();
    expect(body.getByText(/5%/)).toBeInTheDocument();
    expect(body.getByText(/must be 18 or older/i)).toBeInTheDocument();
  });

  it('no page still carries the placeholder details from the old footer', () => {
    for (const Page of [Privacy, Terms, Returns, About, Contact]) {
      const { container, unmount } = renderPage(<Page />);
      expect(container.textContent).not.toMatch(/bookstore@gmail\.com|1711 112333|Pragati Sarani/);
      unmount();
    }
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
    expect(screen.getByText(site.location)).toBeInTheDocument();
  });
});

/*
 * What people are told has to be what the API charges. The API decides - it
 * used to take the browser's word for the delivery charge - so the figures
 * quoted at checkout and in the policies are pinned to its rules here.
 */
describe('the figures quoted match what the API enforces', () => {
  it('delivery charges and the free-delivery threshold', () => {
    expect(site.delivery.insideDhaka).toBe(DELIVERY.insideDhaka);
    expect(site.delivery.outsideDhaka).toBe(DELIVERY.outsideDhaka);
    expect(site.delivery.freeFrom).toBe(DELIVERY.freeFrom);

    for (const [district, total] of [
      ['Dhaka', 300],
      ['Tangail', 300],
      ['Sylhet', 999],
      ['Sylhet', 1000],
      ['', 300],
    ] as const) {
      expect(deliveryChargeFor(district, total)).toBe(serverDeliveryCharge(district, total));
    }
  });

  it('the return window', () => {
    expect(site.returns.windowDays).toBe(RETURN_WINDOW_DAYS);
  });
});
