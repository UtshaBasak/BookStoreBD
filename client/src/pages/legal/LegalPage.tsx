import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import Footer from '../../components/Footer.js';
import { site } from '../../config/site.js';

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
 * Written with Tailwind rather than the inline style objects the rest of the
 * app uses. New pages set the standard the others are being moved towards, and
 * it is what makes these readable on a phone without extra work.
 */
export default function LegalPage({ title, intro, updated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#faf8f7] text-[#3b2f2f]">
      <header className="border-b border-[#e7ded9] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-xl font-bold text-[#8B6F6F] no-underline">
            {site.name}
          </Link>
          <Link to="/" className="text-sm text-[#8B6F6F] hover:underline">
            ← Back to books
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-2 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mb-2 text-[#6b5d5d]">{intro}</p>
        {updated && (
          <p className="mb-8 text-sm text-[#8a8a8a]">Last updated {updated}</p>
        )}

        {/*
          `prose`-like spacing done by hand rather than pulling in the typography
          plugin for five pages.
        */}
        <div
          className="space-y-6 leading-relaxed
                     [&_a]:text-[#8B6F6F] [&_a]:underline
                     [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold
                     [&_li]:ml-5 [&_li]:list-disc [&_li]:mb-1
                     [&_p]:text-[#4a3f3f]"
        >
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
