import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SnackbarProvider } from 'notistack';

import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Outside the providers, so a failure inside one of them is still caught.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <SnackbarProvider>
        <App />
      </SnackbarProvider>
    </ErrorBoundary>
  </StrictMode>
);
