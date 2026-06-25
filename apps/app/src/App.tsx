import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AppProvider } from '@/state/AppProvider'
import { MatureRevealProvider } from '@/components/MatureCover'
import { AppShell } from '@/views/AppShell'

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <MatureRevealProvider>
        <AppShell />
      </MatureRevealProvider>
    </AppProvider>
  </QueryClientProvider>
)

export default App
