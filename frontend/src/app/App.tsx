import type { JSX } from 'solid-js';

import { AppProviders } from './providers';
import { AppRouteBoundary, AppRouter } from './router';

export default function App(): JSX.Element {
  return (
    <AppProviders>
      <AppRouteBoundary>
        <AppRouter />
      </AppRouteBoundary>
    </AppProviders>
  );
}
