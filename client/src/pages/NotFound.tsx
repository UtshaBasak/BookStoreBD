import { Link } from 'react-router-dom';

import { useSeo } from '../hooks/useSeo.js';
import { site } from '../config/site.js';

/**
 * Was a bare `<h1>404 Not Found</h1>`: no way back, no search, and nothing to
 * say what happened. A dead end on a shop is a lost visitor.
 */
export default function NotFound() {
  useSeo({
    title: 'Page not found',
    description: 'That page does not exist. Browse the catalogue instead.',
    noIndex: true,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-bold text-[#8B6F6F]">404</p>
      <h1 className="text-2xl font-bold">We cannot find that page</h1>
      <p className="text-[#6b5d5d]">
        The link may be out of date, or the book may have been taken down. Everything
        {' '}
        {site.name} has is still one click away.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center rounded-lg px-5 text-white no-underline"
          style={{ background: '#8B6F6F' }}
        >
          Go to the homepage
        </Link>
        <Link
          to="/filter"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-[#8B6F6F] px-5 text-[#8B6F6F] no-underline"
        >
          Browse all books
        </Link>
      </div>
    </main>
  );
}
