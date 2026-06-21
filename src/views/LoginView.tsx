import { BASE } from '@/config/config'
import { Button, Input } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

export const LoginView = () => {
  const { setView, setAuthError, loginForm, setLoginForm, authError, handleLogin } = useApp()
  return (
    <div className='fixed inset-0 bg-white overflow-y-auto animate-in fade-in duration-500'>
      <button
        onClick={() => {
          setAuthError(null)
          setView('landing')
        }}
        className='fixed top-safe-top left-8 mt-4 z-10 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
      >
        <span className='material-icons-round'>arrow_back</span>
      </button>
      <div className='min-h-full p-8 pb-[max(2rem,env(keyboard-inset-height))] flex flex-col items-center justify-center'>
      <img
        src={`${BASE}logo.png`}
        alt='MainWRLD'
        className='w-20 h-20 mb-4'
      />
      <h1 className='text-3xl font-display mb-12'>Log In</h1>
      <div className='w-full max-w-sm space-y-4 mb-4'>
        <Input
          label='Username or Email'
          name='username'
          autoComplete='username'
          placeholder='Enter username or email...'
          value={loginForm.username}
          onChange={(val: string) =>
            setLoginForm({ ...loginForm, username: val })
          }
        />
        <Input
          label='Password'
          type='password'
          name='password'
          autoComplete='current-password'
          placeholder='••••••••••••'
          value={loginForm.password}
          onChange={(val: string) =>
            setLoginForm({ ...loginForm, password: val })
          }
        />
        <button
          onClick={() => setView('forgot-password')}
          className='text-[10px] font-bold text-accent uppercase tracking-widest text-right w-full py-1'
        >
          Forgot Password?
        </button>
      </div>
      {authError && (
        <p className='text-[10px] text-red-500 font-bold mb-4 uppercase tracking-widest'>
          {authError}
        </p>
      )}
      <Button className='w-full max-w-sm shrink-0' onClick={handleLogin}>
        Continue
      </Button>
      <button
        onClick={() => {
          setAuthError(null)
          setView('signup')
        }}
        className='mt-8 text-xs font-bold text-gray-400 uppercase tracking-widest py-2'
      >
        Create Account
      </button>
      </div>
    </div>
  )
}
