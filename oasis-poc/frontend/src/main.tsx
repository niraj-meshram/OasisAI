import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import AppWithAuth0, { AppNoAuth } from './App';
import './index.css';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin;
const authDisabledFlag = import.meta.env.VITE_AUTH_DISABLED === 'true';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}
const missingConfig = !domain || !clientId;
const useAuth0 = !authDisabledFlag && !missingConfig;

if (import.meta.env.DEV) {
  console.info('Auth0 config', {
    authDisabledFlag,
    missingConfig,
    useAuth0,
    domain: domain || '(unset)',
    clientId: clientId || '(unset)',
    audience: audience || '(unset)',
    redirectUri,
    rolesClaim: import.meta.env.VITE_AUTH0_ROLES_CLAIM || '(unset)',
    defaultRole: import.meta.env.VITE_DEFAULT_ROLE || '(unset)',
  });
}

if (authDisabledFlag || missingConfig) {
  console.warn(
    'Auth0 disabled for demo. Set VITE_AUTH_DISABLED=false and provide VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID to enable login.',
  );
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {useAuth0 ? (
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        useCookiesForTransactions={true}
        authorizationParams={{
          redirect_uri: redirectUri,
          audience: audience || undefined,
        }}
      >
        <AppWithAuth0 />
      </Auth0Provider>
    ) : (
      <AppNoAuth />
    )}
  </React.StrictMode>,
);
