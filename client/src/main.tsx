import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SnackbarProvider } from 'notistack';
import { QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { queryClient } from './config/queryClient.js';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element to mount into');

// Outside the providers, so a failure inside one of them is still caught.
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <App />
        </SnackbarProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
