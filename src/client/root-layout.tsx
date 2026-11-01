import { Suspense } from 'react';
import { Outlet } from 'react-router';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/outfit';
import { ConditionalNavigation } from '@/components/ConditionalNavigation';
import { DatabaseStatusWrapper } from '@/components/DatabaseStatusWrapper';
import { KeyboardShortcutsProvider } from '@/components/keyboard-shortcuts/KeyboardShortcutsProvider';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Providers } from './providers';

/** Root layout route: Mantine provider/theme, DB loading gate, keyboard shortcuts and the app shell. */
export default function RootLayout() {
  useDocumentTitle('MatchExec');
  return (
    <Providers>
      <DatabaseStatusWrapper>
        <KeyboardShortcutsProvider>
          <ConditionalNavigation>
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </ConditionalNavigation>
        </KeyboardShortcutsProvider>
      </DatabaseStatusWrapper>
    </Providers>
  );
}
