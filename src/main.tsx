import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { AppProviders } from './app/providers';
import { router } from './app/router';
import { envError } from './lib/env';

const root = createRoot(document.getElementById('root')!);

if (envError) {
  root.render(
    <div style={{ fontFamily: 'system-ui', padding: 32, color: '#EDEDF2', background: '#0B0B0F', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20 }}>CrewBoard isn’t configured</h1>
      <p style={{ opacity: 0.75 }}>{envError}</p>
      <p style={{ opacity: 0.75 }}>Copy .env.example to .env.local and fill in your Supabase URL and anon key.</p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}
