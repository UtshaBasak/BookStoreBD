/**
 * A book card: real links (the homepage's were a <div> with an onClick, which
 * a right-click could not open in a new tab), and the deal price when a seller
 * has discounted the book.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import BookCard from './BookCard.js';
import PriceTag from './PriceTag.js';

const BOOK = {
  _id: '0123456789abcdef01234567',
  title: 'Sapiens',
  author: 'Yuval Noah Harari',
  price: 650,
  stock: 3,
  bookType: 'old',
  condition: 'good',
  images: [],
} as unknown as Book;

const DEAL = { ...BOOK, discountType: 'percent', discountValue: 35, salePrice: 423, discountPercent: 35, discountAmount: 227 } as Book;

const renderCard = (props: Partial<Parameters<typeof BookCard>[0]> = {}) =>
  render(
    <MemoryRouter>
      <BookCard book={BOOK} {...props} />
    </MemoryRouter>
  );

describe('BookCard', () => {
  it('links to the book from its title, so it can be opened in a new tab', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Sapiens' })).toHaveAttribute('href', `/book/${BOOK._id}`);
  });

  it('says a used book is used, and in what condition', () => {
    renderCard();

    expect(screen.getByText('Used · Good')).toBeInTheDocument();
  });

  it('keeps the heart and the cart as buttons beside the link', async () => {
    const onToggleCart = vi.fn();
    const onToggleWishlist = vi.fn();
    renderCard({ signedIn: true, onToggleCart, onToggleWishlist });

    await userEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }));

    expect(onToggleCart).toHaveBeenCalledWith(BOOK._id);
    expect(onToggleWishlist).toHaveBeenCalledWith(BOOK._id);
  });

  it('shows no heart to a visitor who is not signed in', () => {
    renderCard({ onToggleWishlist: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Add to wishlist' })).not.toBeInTheDocument();
  });

  it('says a book that has sold out has sold out, instead of offering the cart', () => {
    renderCard({ book: { ...BOOK, stock: 0 }, onToggleCart: vi.fn() });

    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument();
  });
});

describe('PriceTag', () => {
  it('shows the price alone when there is no deal', () => {
    render(<PriceTag book={BOOK} />);

    expect(screen.getByText('৳650')).toBeInTheDocument();
    expect(screen.queryByText(/off/)).not.toBeInTheDocument();
  });

  it('shows the sale price, the listed one struck through, and the saving', () => {
    const { container } = render(<PriceTag book={DEAL} />);

    expect(container.querySelector('.price-now')).toHaveTextContent('Now ৳423');
    expect(container.querySelector('s')).toHaveTextContent('৳650');
    expect(screen.getByText('35% off')).toBeInTheDocument();
  });

  it('gives an amount off in taka', () => {
    render(<PriceTag book={{ ...DEAL, discountType: 'amount', discountAmount: 150, salePrice: 500, discountPercent: 23 }} />);

    expect(screen.getByText('৳150 off')).toBeInTheDocument();
  });
});
