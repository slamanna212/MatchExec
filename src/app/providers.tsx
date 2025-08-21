'use client'

import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import '@mantine/core/styles.css'

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
    ]
  }
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ModalsProvider>
        {children}
      </ModalsProvider>
    </MantineProvider>
  )
}