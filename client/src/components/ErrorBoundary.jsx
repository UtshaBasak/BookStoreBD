import React from 'react';

/**
 * Catches a render error anywhere below it and shows a recovery screen.
 *
 * Without this, one thrown error in any component unmounts the whole tree and
 * the user is left staring at a blank white page with no way forward.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The browser console is the log of record on the client.
    console.error('Unhandled render error:', error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Something went wrong</h1>
          <p style={styles.body}>
            The page hit an unexpected error. You can try again, or go back to the
            catalogue.
          </p>

          {import.meta.env.DEV && (
            <pre style={styles.details}>{error.message}</pre>
          )}

          <div style={styles.actions}>
            <button type="button" onClick={this.handleReset} style={styles.primary}>
              Try again
            </button>
            <a href="/" style={styles.secondary}>
              Back to books
            </a>
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background: '#f5f3f1',
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: '#fff',
    borderRadius: 12,
    padding: '2rem',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  heading: { margin: '0 0 0.75rem', fontSize: '1.4rem', color: '#3b2f2f' },
  body: { margin: '0 0 1.25rem', color: '#6b5d5d', lineHeight: 1.5 },
  details: {
    textAlign: 'left',
    background: '#faf7f5',
    border: '1px solid #e7ded9',
    borderRadius: 6,
    padding: '0.75rem',
    fontSize: '0.8rem',
    overflowX: 'auto',
    marginBottom: '1.25rem',
    color: '#8a4b4b',
  },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' },
  primary: {
    background: '#8B6F6F',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '0.6rem 1.2rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondary: {
    background: 'transparent',
    color: '#8B6F6F',
    border: '1px solid #8B6F6F',
    borderRadius: 6,
    padding: '0.6rem 1.2rem',
    textDecoration: 'none',
    fontWeight: 600,
  },
};
