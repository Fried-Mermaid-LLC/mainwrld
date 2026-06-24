import React, { useState, useCallback } from 'react'
import { useApp } from '@/state/AppContext'
import type { ReportReason } from '@/types'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'sexual', label: 'Sexual or explicit content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' }
]

type ReportType = 'Book' | 'Comment' | 'User'

// Shared report flow: a bottom-sheet reason picker + a `startReport` opener.
// Each view calls useReportFlow(), renders {sheet}, and wires its Report
// control to startReport(type, id). The chosen reason is threaded to
// handleReport (optional + backward compatible — picking is required here, but
// the field stays optional end-to-end). A "sexual" report on a book routes a
// mature-content complaint into the existing strike/take-down pipeline.
export function useReportFlow() {
  const { handleReport } = useApp()
  const [target, setTarget] = useState<{ type: ReportType; id: string } | null>(
    null
  )

  const startReport = useCallback((type: ReportType, id: string) => {
    setTarget({ type, id })
  }, [])

  const close = useCallback(() => setTarget(null), [])

  const sheet = target ? (
    <div
      className='fixed inset-0 z-[120] flex items-end justify-center bg-black/40 animate-in fade-in duration-200'
      onClick={close}
    >
      <div
        className='w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom duration-300'
        onClick={e => e.stopPropagation()}
      >
        <h3 className='text-sm font-bold mb-1'>
          Report {target.type.toLowerCase()}
        </h3>
        <p className='text-[11px] text-gray-400 mb-4'>
          Why are you reporting this?
        </p>
        <div className='space-y-2'>
          {REASONS.map(r => (
            <button
              key={r.value}
              onClick={() => {
                handleReport(target.type, target.id, r.value)
                close()
              }}
              className='w-full p-4 text-left rounded-2xl bg-gray-50 active:bg-gray-100 text-sm font-bold transition-colors'
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={close}
          className='w-full mt-4 p-3 text-[11px] font-bold uppercase tracking-widest text-gray-400'
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null

  return { sheet, startReport }
}
