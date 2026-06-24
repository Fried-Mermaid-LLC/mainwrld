import { BASE } from '@/config/config'
import { Button } from '@/components/sharedComponents'
import { AuthLayout } from '@/components/AuthLayout'
import { SafeImg } from '@/components/SafeImg'
import { useApp } from '@/state/AppContext'

export const LandingView = () => {
  const { setView, setAuthError } = useApp()
  return (
    <AuthLayout
      center
      animation='animate-in fade-in duration-700'
      footer={
        <footer className='shrink-0 flex items-center justify-center gap-4 pt-4 text-center'>
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
      }
    >
      {/* Hero */}
      <div className='flex flex-col items-center justify-center text-center'>
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
        <h1 className='text-4xl font-display leading-tight'>
          Where stories
          <br />
          come to life.
        </h1>
      </div>

      {/* Feature highlights */}
      <div className='space-y-3 mt-8'>
        {[
          {
            icon: 'auto_stories',
            title: 'Read & write freely',
            desc: 'Discover endless stories or publish your own in seconds.'
          },
          {
            icon: 'sell',
            title: 'Sell & earn',
            desc: 'Set a price on your books and earn as you grow your audience.'
          },
          {
            icon: 'public',
            title: 'A living 3D world',
            desc: 'Walk in, meet readers and authors as 3D avatars.'
          }
        ].map(f => (
          <div
            key={f.title}
            className='flex items-center gap-4 bg-gray-50 rounded-2xl p-4'
          >
            <div className='w-11 h-11 shrink-0 rounded-xl bg-accent/10 flex items-center justify-center text-accent'>
              <span className='material-icons-round text-[22px]'>{f.icon}</span>
            </div>
            <div className='text-left'>
              <p className='text-sm font-bold leading-tight'>{f.title}</p>
              <p className='text-[11px] text-gray-400 font-medium leading-snug mt-0.5'>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className='space-y-3 mt-8'>
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
    </AuthLayout>
  )
}
