'use client'

import { HeroUIProvider } from '@heroui/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider theme="purple">
      {children}
    </HeroUIProvider>
  )
}