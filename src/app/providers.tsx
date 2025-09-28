'use client'

import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './globals.css'

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
  other: {
    bodyColor: '#e8ebec'
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