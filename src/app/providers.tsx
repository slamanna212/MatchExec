'use client'

import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import '@mantine/core/styles.css'

const theme = createTheme({
  primaryColor: 'blue',
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