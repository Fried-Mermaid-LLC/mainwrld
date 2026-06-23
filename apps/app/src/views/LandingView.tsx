import { BASE } from '@/config/config'
import { Button } from '@/components/sharedComponents'
import { SafeImg } from '@/components/SafeImg'
import { useApp } from '@/state/AppContext'

export const LandingView = () => {
  const { setView, setAuthError } = useApp()
  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in fade-in duration-700'>
      <div className='min-h-dvh flex flex-col px-8 pt-safe-top pb-safe-bottom'>
        {/* Hero */}
        <div className='flex-1 flex flex-col items-center justify-center text-center py-16'>
          <SafeImg
            src={`${BASE}logo.png`}
            alt='MainWRLD'
            className='w-24 h-24 mb-6 drop-shadow-xl'
          />
          <SafeImg
            src={`${BASE}wordlogo.png`}
            alt='MainWRLD'
            className='h-7 mb-8'
          />
          <h1 className='text-4xl font-display leading-tight mb-4'>
            Where stories
            <br />
            come to life.
          </h1>
          <p className='text-sm text-gray-400 font-medium max-w-xs leading-relaxed'>
            Read, write and share stories in a living 3D world. Meet
            authors, build your audience and earn as you create.
          </p>
        </div>

        {/* Feature highlights */}
        <div className='space-y-3 mb-10'>
          {[
            {
              icon: 'auto_stories',
              title: 'Read & write freely',
              desc: 'Discover endless stories or publish your own in seconds.'
            },
            {
              icon: 'public',
              title: 'A living 3D world',
              desc: 'Walk in, meet readers and authors as 3D avatars.'
            },
            {
              icon: 'workspace_premium',
              title: 'Earn & go premium',
              desc: 'Collect points, grow your audience and unlock more.'
            }
          ].map(f => (
            <div
              key={f.title}
              className='flex items-center gap-4 bg-gray-50 rounded-2xl p-4'
            >
              <div className='w-11 h-11 shrink-0 rounded-xl bg-accent/10 flex items-center justify-center text-accent'>
                <span className='material-icons-round text-[22px]'>
                  {f.icon}
                </span>
              </div>
              <div className='text-left'>
                <p className='text-sm font-bold leading-tight'>
                  {f.title}
                </p>
                <p className='text-[11px] text-gray-400 font-medium leading-snug mt-0.5'>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className='space-y-3 pb-8'>
          <Button
            className='w-full'
            onClick={() => {
              setAuthError(null)
              setView('signup')
            }}
          >
            Get Started
          </Button>
          <button
            onClick={() => {
              setAuthError(null)
              setView('login')
            }}
            className='w-full text-xs font-bold text-gray-400 uppercase tracking-widest py-3'
          >
            I already have an account
          </button>
        </div>

        {/* Footer */}
        <footer className='flex items-center justify-center gap-4 pb-6 text-center'>
          <span className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>
            © Fried Mermaid LLC
          </span>
          <span className='w-px h-3 bg-gray-200' />
          <button
            onClick={() => setView('terms')}
            className='text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-accent transition-colors'
          >
            Terms
          </button>
          <span className='w-px h-3 bg-gray-200' />
          <button
            onClick={() => setView('privacy')}
            className='text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-accent transition-colors'
          >
            Privacy
          </button>
        </footer>
      </div>
    </div>
  )
}
