'use client'

import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import './globals.css'

// Shared input styles — avoids repeating the same two strings across every input component
const INPUT_STYLES = {
  input: {
    backgroundColor: 'light-dark(var(--mantine-color-white), #1e1e2e)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
} as const;

const theme = createTheme({
  primaryColor: 'violet',
  colors: {
    violet: [
      '#f3e8ff',
      '#e9d5ff',
      '#d8b4fe',
      '#c084fc',
      '#a855f7',
      '#9333ea',
      '#7c3aed',
      '#6d28d9',
      '#5b21b6',
      '#420d4a'
    ],
    purple: [
      '#faf5ff',
      '#f3e8ff',
      '#e9d5ff',
      '#d8b4fe',
      '#c084fc',
      '#a855f7',
      '#9333ea',
      '#7c3aed',
      '#6d28d9',
      '#5b21b6'
    ],
    gray: [
      '#f8f9fa',
      '#e8ebec', // slightly darker for our background
      '#e9ecef',
      '#dee2e6',
      '#ced4da',
      '#adb5bd',
      '#6c757d',
      '#495057',
      '#343a40',
      '#212529'
    ]
  },
  headings: {
    fontFamily: 'var(--font-outfit), var(--font-geist-sans), sans-serif',
    fontWeight: '700',
  },
  other: {
    // Body background token (legacy — prefer CSS vars directly)
    bodyColor: '#e8ebec',

    // Page layout
    pageMaxWidth: '72rem',
    pageMaxWidthNarrow: '56rem',

    // Navigation active colour (used by navigation.tsx)
    navActiveColor: '#f7cc02',

    // Card hover lift
    cardHoverTransform: 'translateY(-3px)',
    cardHoverShadow: '0 8px 24px rgba(0,0,0,0.25)',

    // Match status colours (used by match dashboard and badges)
    statusColors: {
      created:   '#6c757d',
      gather:    '#3b82f6',
      assign:    '#f59e0b',
      battle:    '#22c55e',
      complete:  '#8b5cf6',
      cancelled: '#ef4444',
    },

    // Settings page category colours (used by settings/page.tsx)
    settingsColors: {
      application: '#27ae60',
      stats:       '#e74c3c',
      announcer:   '#e67e22',
      discord:     '#5865f2',
      scheduler:   '#9b59b6',
      ui:          '#f39c12',
      backup:      '#16a085',
    },

    // Input field tokens (values already applied via INPUT_STYLES above)
    inputBg: 'light-dark(var(--mantine-color-white), #1e1e2e)',
    inputBorderColor: 'rgba(139, 92, 246, 0.35)',
  },
  components: {
    // Disable auto contrast on buttons — buttons use intentional color choices with white text.
    // Global autoContrast still applies to other components (Badge, Avatar, etc.)
    Button: {
      defaultProps: {
        autoContrast: false,
      },
    },

    TextInput:     { styles: INPUT_STYLES },
    PasswordInput: { styles: INPUT_STYLES },
    NumberInput:   { styles: INPUT_STYLES },
    Textarea:      { styles: INPUT_STYLES },
    Select:        { styles: INPUT_STYLES },

    // Stable class names for NavLink — replaces fragile .m_XXXXXXXX selectors in globals.css
    NavLink: {
      classNames: {
        root: 'navlink-root',
      },
    },

    // Stable class names for Modal — replaces fragile .m_XXXXXXXX selectors in globals.css
    Modal: {
      classNames: {
        content: 'modal-content',
        header:  'modal-header',
      },
    },
  }
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ModalsProvider>
        <Notifications />
        {children}
      </ModalsProvider>
    </MantineProvider>
  )
}