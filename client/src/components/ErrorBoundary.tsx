import React, { type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../utils/report.js';

interface ErrorBoundaryProps {
  children?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render error anywhere below it and shows a recovery screen.
 *
 * Without this, one thrown error in any component unmounts the whole tree and
 * the user is left staring at a blank white page with no way forward.
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // In development this reaches the console; in a build it is a no-op until
    // a browser error reporter is wired into `reportError`.
    reportError('Unhandled render error:', { error, componentStack: info?.componentStack });
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" style={styles.wrap}>
        <div className="card" style={styles.card}>
          <div aria-hidden="true" style={styles.icon}>
            📖
          </div>
          <h1 style={styles.heading}>Something went wrong</h1>
          <p style={styles.body}>
            The page hit an unexpected error. You can try again, or go back to the
            catalogue.
          </p>

          {import.meta.env.DEV && (
            <pre style={styles.details}>{error.message}</pre>
          )}

          <div style={styles.actions}>
            <button type="button" onClick={this.handleReset} className="btn btn-primary">
              Try again
            </button>
            <a href="/" className="btn btn-ghost">
              Back to books
            </a>
          </div>
        </div>
      </div>
    );
  }
}

// Inline, not Tailwind or a stylesheet of its own: this screen is shown when
// something has already gone wrong, so it leans on as little as possible. The
// buttons use the shared `btn` classes from index.css, which is always loaded.
const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    boxSizing: 'border-box',
    background:
      'radial-gradient(560px 320px at 10% 0%, rgba(139, 92, 246, 0.2), transparent 70%),' +
      'radial-gradient(520px 320px at 95% 100%, rgba(255, 92, 53, 0.14), transparent 70%),' +
      '#f8f7fc',
  },
  card: {
    maxWidth: 480,
    width: '100%',
    boxSizing: 'border-box',
    padding: '2.25rem 1.75rem 2rem',
    textAlign: 'center',
  },
  icon: {
    width: 72,
    height: 72,
    margin: '0 auto 1.1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    fontSize: 34,
    background: 'linear-gradient(135deg, #f3efff 0%, #fff1ec 100%)',
    border: '1px solid #e4dcfb',
  },
  heading: { margin: '0 0 0.6rem', fontSize: '1.5rem', color: '#111827' },
  body: { margin: '0 0 1.5rem', color: '#374151', lineHeight: 1.6 },
  details: {
    textAlign: 'left',
    background: '#f3efff',
    border: '1px solid #e4dcfb',
    borderRadius: 12,
    padding: '0.75rem 0.9rem',
    fontSize: '0.8rem',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '0 0 1.5rem',
    color: '#5b21b6',
  },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' },
};
