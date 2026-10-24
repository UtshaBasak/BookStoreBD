import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SnackbarProvider } from 'notistack';
import { QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { queryClient } from './config/queryClient.js';
import { installErrorReporting } from './utils/report.js';
import { applyTheme, watchSystemTheme } from './utils/theme.js';
import { applyLanguage, onLanguageChange, watchSystemLanguage } from './utils/language.js';
import { apiFetch, API_BASE_URL } from './config/api.js';
import { isAuthenticated } from './utils/auth.js';

// Before anything renders, so a failure during the first render is caught too.
installErrorReporting();
applyTheme();
watchSystemTheme();
applyLanguage();
watchSystemLanguage();

/*
 * A new language: what came from the server - notifications, order histories,
 * any message - is fetched again in it, and a signed-in account keeps it, so
 * its e-mails and notifications arrive in it too.
 */
onLanguageChange((language) => {
  void queryClient.invalidateQueries();
  if (isAuthenticated()) {
    void apiFetch(`${API_BASE_URL}/user/me/language`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    }).catch(() => undefined);
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('No #root element to mount into');

// Outside the providers, so a failure inside one of them is still caught.
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/*
          Toasts. `useToast` picks the variant and how long each one stays;
          what is decided here is everything that should look the same across
          the site - where they appear, how many stack up, and that clicking a
          button twice does not produce the same message twice.
        */}
        <SnackbarProvider
          maxSnack={3}
          preventDuplicate
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <App />
        </SnackbarProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
