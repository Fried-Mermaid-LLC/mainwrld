import { Button, Input } from '@/components/sharedComponents'
import { AuthLayout } from '@/components/AuthLayout'
import { useApp } from '@/state/AppContext'

export const LoginView = () => {
  const { setView, setAuthError, loginForm, setLoginForm, authError, authBusy, handleLogin } = useApp()
  return (
    <AuthLayout
      center
      logo
      title='Log In'
      onBack={() => {
        setAuthError(null)
        setView('landing')
      }}
    >
      <div className='space-y-4'>
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
        <p className='text-[10px] text-red-500 font-bold mt-4 uppercase tracking-widest'>
          {authError}
        </p>
      )}
      <Button className='w-full mt-6' onClick={handleLogin} loading={authBusy}>
        {authBusy ? 'Logging in…' : 'Continue'}
      </Button>
      <button
        onClick={() => {
          setAuthError(null)
          setView('signup')
        }}
        className='mt-8 w-full text-center text-xs font-bold text-gray-400 uppercase tracking-widest py-2'
      >
        Create Account
      </button>
    </AuthLayout>
  )
}
