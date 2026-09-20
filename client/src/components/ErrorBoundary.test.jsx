import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ErrorBoundary from './ErrorBoundary.jsx';

const Boom = ({ shouldThrow = true }) => {
  if (shouldThrow) throw new Error('kaboom');
  return <p>recovered content</p>;
};

let consoleError;

beforeEach(() => {
  // React logs the caught error itself; silenced so the suite stays readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a recovery screen instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('offers a way back to the catalogue', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('link', { name: /back to books/i })).toHaveAttribute('href', '/');
  });

  it('notifies the onError callback so the failure can be reported', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('kaboom');
  });

  it('logs the failure to the console', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(consoleError).toHaveBeenCalledWith(
      'Unhandled render error:',
      expect.any(Error),
      expect.anything()
    );
  });

  it('recovers when Try again is pressed and the child no longer throws', async () => {
    const user = userEvent.setup();

    const Flaky = () => {
      const shouldThrow = Flaky.throws;
      if (shouldThrow) throw new Error('kaboom');
      return <p>recovered content</p>;
    };
    Flaky.throws = true;

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    Flaky.throws = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error detail in a development build', () => {
    // import.meta.env.DEV is true under Vitest. The same block is gated out of
    // a production bundle, so an end user never sees the raw message.
    expect(import.meta.env.DEV).toBe(true);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });
});
