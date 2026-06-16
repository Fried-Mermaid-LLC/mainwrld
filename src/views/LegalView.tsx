import React from 'react'
import { BASE } from '@/config/config'

export const LEGAL_DOCS: Record<'terms' | 'privacy', { title: string; file: string }> = {
  terms: { title: 'Terms', file: 'terms.html' },
  privacy: { title: 'Privacy', file: 'privacy.html' }
}

export const LegalView = ({ doc, onBack }: any) => (
  <div className='fixed inset-0 bg-white flex flex-col animate-in slide-in-from-right duration-300'>
    <header
      className='shrink-0 px-6 border-b border-gray-100'
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className='flex items-center gap-4 h-16'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>{doc.title}</h1>
      </div>
    </header>
    <iframe
      src={`${BASE}${doc.file}`}
      title={doc.title}
      className='flex-1 w-full border-0'
    />
  </div>
)
