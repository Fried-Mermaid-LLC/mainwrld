import React, { createContext, useContext, useState, useCallback } from 'react'
import { CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'
import type { Book } from '@/types'

// Session-scoped set of mature book ids the user has tapped to reveal. Memory
// only — a reveal is never persisted, so it resets on app relaunch. Mounted in
// App.tsx (inside AppProvider) so MatureCover can read both canSeeMature and
// the reveal state.
interface MatureRevealCtx {
  revealedIds: Set<string>
  reveal: (id: string) => void
}

const MatureRevealContext = createContext<MatureRevealCtx>({
  revealedIds: new Set(),
  reveal: () => {}
})

export const MatureRevealProvider = ({
  children
}: {
  children: React.ReactNode
}) => {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set())
  const reveal = useCallback((id: string) => {
    setRevealedIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])
  return (
    <MatureRevealContext.Provider value={{ revealedIds, reveal }}>
      {children}
    </MatureRevealContext.Provider>
  )
}

export const useMatureReveal = () => useContext(MatureRevealContext)

// Cover wrapper that blurs mature books for viewers who can't (yet) see mature
// content, with a tap-to-reveal overlay (TikTok-style). For non-mature books,
// for viewers with canSeeMature, or once revealed this session, it renders the
// plain CoverImg unchanged. Must be rendered inside a `position: relative`
// container (the existing cover wrappers are).
export const MatureCover = ({ book }: { book: Book }) => {
  const { canSeeMature } = useApp()
  const { revealedIds, reveal } = useMatureReveal()

  const gated = !!book.isMature && !canSeeMature && !revealedIds.has(book.id)
  if (!gated) return <CoverImg book={book} />

  return (
    <>
      <CoverImg book={book} />
      <button
        type='button'
        onClick={e => {
          // The first tap only lifts the blur — stop it from bubbling to the
          // card's onClick (which opens the book). A second tap on the now-clear
          // cover opens it; for a gated viewer that lands on the block screen.
          e.stopPropagation()
          reveal(book.id)
        }}
        className='absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-xl text-white'
        aria-label='Reveal mature content'
      >
        <span className='material-icons-round text-2xl opacity-90'>
          visibility_off
        </span>
        <span className='text-[8px] font-bold uppercase tracking-widest text-center px-2 leading-tight'>
          Mature
          <br />
          Tap to reveal
        </span>
      </button>
    </>
  )
}

export default MatureCover
