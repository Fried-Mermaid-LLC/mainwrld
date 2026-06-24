import React from 'react'

// Single, web-friendly shell for every auth screen (landing / login / signup /
// forgot- & reset-password). The app is mobile-first (Capacitor), so without a
// constraint these views stretched edge-to-edge on desktop — landing and signup
// ran the full window width while login and reset sat in a narrow centred
// column, so the four screens never matched. AuthLayout fixes that in one place:
// a centred `max-w-md` column (its inner content, minus the px-8 gutters, is
// exactly the original `max-w-sm` form width) with a shared back/title header,
// iOS safe-area + keyboard insets, and scroll. Screens only provide content.
interface AuthLayoutProps {
  children: React.ReactNode
  /** Back-button handler. Omit to hide the back button. */
  onBack?: () => void
  /** Optional header title shown next to the back button. */
  title?: string
  /** Vertically centre the content (login / forgot / reset). Long forms leave
      this off so they top-align and scroll. */
  center?: boolean
  /** Pinned to the bottom of the column (landing CTAs + footer). */
  footer?: React.ReactNode
  /** Entrance animation utilities; defaults to a soft fade-in. */
  animation?: string
}

export const AuthLayout = ({
  children,
  onBack,
  title,
  center = false,
  footer,
  animation = 'animate-in fade-in duration-500'
}: AuthLayoutProps) => (
  <div className={`fixed inset-0 bg-white overflow-y-auto no-scrollbar ${animation}`}>
    <div className='min-h-dvh w-full max-w-md mx-auto flex flex-col px-8 pt-safe-top pb-[max(2rem,env(safe-area-inset-bottom),env(keyboard-inset-height))]'>
      <div className={`flex-1 flex flex-col py-8 ${center ? 'justify-center' : ''}`}>
        {(onBack || title) && (
          <header className='flex items-center gap-4 mb-8 shrink-0'>
            {onBack && (
              <button
                onClick={onBack}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
            )}
            {title && <h1 className='text-2xl font-bold'>{title}</h1>}
          </header>
        )}
        {children}
      </div>
      {footer}
    </div>
  </div>
)
