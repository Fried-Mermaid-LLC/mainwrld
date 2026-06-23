import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/queryClient'
import { AppProvider } from '@/state/AppProvider'
import { AppShell } from '@/views/AppShell'

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <AppShell />
    </AppProvider>
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
)

export default App
