import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AppProvider } from '@/state/AppProvider'
import { MatureRevealProvider } from '@/components/MatureCover'
import { AppShell } from '@/views/AppShell'
import { onScreenshot } from '@/lib/privacyScreen'

const App: React.FC = () => {
  React.useEffect(
    () =>
      onScreenshot(() => {
        // iOS can't block the screenshot; it's already taken by the time we
        // hear about it. Hook for analytics / a user notice goes here.
        console.warn('[privacy] screenshot taken')
      }),
    [],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <MatureRevealProvider>
          <AppShell />
        </MatureRevealProvider>
      </AppProvider>
    </QueryClientProvider>
  )
}

export default App
