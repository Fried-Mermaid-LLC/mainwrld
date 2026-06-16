import React from 'react'
import { AppProvider } from '@/state/AppProvider'
import { AppShell } from '@/views/AppShell'

const App: React.FC = () => (
  <AppProvider>
    <AppShell />
  </AppProvider>
)

export default App
