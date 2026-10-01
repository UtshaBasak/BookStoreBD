import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

import Footer from '../../components/Footer.js';
import Logo from '../../components/Logo.js';
import { useSeo } from '../../hooks/useSeo.js';

interface LegalPageProps {
  title: string;
  /** One line under the heading saying what the page is for. */
  intro: string;
  /** Shown as "Last updated" — omitted on pages that are not policies. */
  updated?: string;
  children: ReactNode;
}

/**
 * Shared shell for the policy and information pages.
 *
 * Written with Tailwind utility classes, the standard for new pages, which
 * keeps these readable on a phone without extra work.
 */
export default function LegalPage({ title, intro, updated, children }: LegalPageProps) {
  // One call covers all five pages: each already passes the title and the line
  // that describes it, which is exactly what a search result needs.
  useSeo({ title, description: intro });

  /*
   * Links such as /about#how-it-works name a section. A full page load scrolls
   * to it, but a route change in the app does not, so this does it instead.
   */
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      {/* Frosted and sticky, like the homepage's bar. */}
      <header className="sticky top-0 z-50 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link to="/" className="inline-flex min-h-11 items-center no-underline [--logo-size:30px] sm:[--logo-size:34px]">
            <Logo />
          </Link>
          <Link to="/" className="btn btn-ghost">
            <FaArrowLeft aria-hidden="true" size={13} />
            Back to books
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-14">
        {/* The title band: a soft wash of the brand colours rather than a photo. */}
        <div
          className="relative overflow-hidden border-b border-brand-line px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-14"
          style={{
            background:
              'radial-gradient(520px 260px at 0% 0%, rgba(139, 92, 246, 0.22), transparent 70%),' +
              'radial-gradient(480px 260px at 100% 100%, rgba(255, 92, 53, 0.16), transparent 70%),' +
              'linear-gradient(180deg, #f3efff 0%, #fbfaff 100%)',
          }}
        >
          <div className="mx-auto max-w-190">
            <h1 className="mb-3">{title}</h1>
            <p className="m-0 max-w-160 text-lg text-ink-soft">{intro}</p>
            {updated && (
              <p className="mt-4 mb-0 inline-flex items-center rounded-full border border-brand-line bg-white/80 px-3 py-1 text-sm font-semibold text-brand-dark">
                Last updated {updated}
              </p>
            )}
          </div>
        </div>

        {/*
          `prose`-like spacing done by hand rather than pulling in the typography
          plugin for five pages. The card overlaps the band by a few rem, so the
          text reads as a sheet laid on it. `scroll-mt` keeps a heading reached by
          its #hash clear of the sticky header.
        */}
        <article
          className="card relative mx-3 -mt-14 max-w-190 space-y-5 px-5 py-7 leading-relaxed sm:mx-auto sm:-mt-16 sm:px-10 sm:py-10
                     [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:decoration-brand-line [&_a]:decoration-2 [&_a]:underline-offset-4
                     [&_a:hover]:text-brand-dark [&_a:hover]:decoration-brand-light
                     [&_code]:rounded-md [&_code]:bg-brand-tint [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-brand-dark
                     [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:text-ink [&_h2:first-child]:mt-0
                     [&_li]:mb-1.5 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:text-ink-soft [&_li]:marker:text-brand-light
                     [&_p]:text-ink-soft [&_strong]:text-ink [&_ul]:pl-0"
        >
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}
