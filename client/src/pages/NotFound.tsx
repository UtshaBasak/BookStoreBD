import { Link } from 'react-router-dom';
import { FaBookOpen, FaHome } from 'react-icons/fa';

import Logo from '../components/Logo.js';
import { useSeo } from '../hooks/useSeo.js';
import { site } from '../config/site.js';

/**
 * The 404 page: says what happened and offers a way back into the shop, so an
 * outdated link never leaves a visitor at a dead end.
 */
export default function NotFound() {
  useSeo({
    title: 'Page not found',
    description: 'That page does not exist. Browse the catalogue instead.',
    noIndex: true,
  });

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 text-center"
      style={{
        background:
          'radial-gradient(620px 360px at 10% 0%, rgba(139, 92, 246, 0.2), transparent 70%),' +
          'radial-gradient(560px 340px at 95% 100%, rgba(255, 92, 53, 0.16), transparent 70%),' +
          'var(--color-page)',
      }}
    >
      <Link to="/" className="mb-8 inline-flex min-h-11 items-center no-underline" aria-label={`${site.name} home`}>
        <Logo size={34} />
      </Link>

      <div className="card w-full max-w-xl px-6 pb-9 pt-6 sm:px-10">
        <p
          className="m-0 select-none font-extrabold leading-none tracking-tighter"
          style={{
            fontSize: 'clamp(6rem, 4rem + 10vw, 9rem)',
            background: 'linear-gradient(120deg, #6d28d9 0%, #c026d3 55%, #ff5c35 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          404
        </p>
        <p className="mb-1 mt-1 text-3xl" aria-hidden="true">📚🔍</p>
        <h1 className="mb-3 mt-2 text-2xl sm:text-3xl">We cannot find that page</h1>
        <p className="mx-auto mb-0 max-w-md text-ink-soft">
          The link may be out of date, or the book may have been taken down. Everything
          {' '}
          {site.name} has is still one click away.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            <FaHome aria-hidden="true" />
            Go to the homepage
          </Link>
          <Link to="/filter" className="btn btn-ghost">
            <FaBookOpen aria-hidden="true" />
            Browse all books
          </Link>
        </div>
      </div>
    </main>
  );
}
