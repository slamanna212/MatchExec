'use client'

import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'

const theme = createTheme({
  colorScheme: 'auto',
  primaryColor: 'blue',
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  )
}