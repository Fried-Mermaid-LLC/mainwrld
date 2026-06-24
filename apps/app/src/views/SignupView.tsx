import { Button, Input } from '@/components/sharedComponents'
import { AuthLayout } from '@/components/AuthLayout'
import { useApp } from '@/state/AppContext'

export const SignupView = () => {
  const { setView, setAuthError, signUpForm, setSignUpForm, authError, authBusy, handleSignup } = useApp()
  return (
    <AuthLayout
      center
      title='Sign Up'
      animation='animate-in slide-in-from-right duration-500'
      onBack={() => {
        setAuthError(null)
        setView('login')
      }}
    >
      <div className='space-y-6'>
        <Input
          label='Email Address'
          value={signUpForm.email}
          onChange={(val: string) =>
            setSignUpForm({ ...signUpForm, email: val })
          }
        />
        <Input
          label='Birth Date'
          type='date'
          value={signUpForm.birthDate}
          onChange={(val: string) =>
            setSignUpForm({ ...signUpForm, birthDate: val })
          }
        />
        <Input
          label='Display Name'
          description='5-25 characters'
          value={signUpForm.displayName}
          onChange={(val: string) =>
            setSignUpForm({ ...signUpForm, displayName: val })
          }
        />
        <Input
          label='Username'
          description='5-25 chars, lowercase, no caps'
          value={signUpForm.username}
          onChange={(val: string) =>
            setSignUpForm({
              ...signUpForm,
              username: val.toLowerCase().replace(/\s/g, '')
            })
          }
        />
        <Input
          label='Password'
          type='password'
          description='Minimum 12 characters'
          value={signUpForm.password}
          onChange={(val: string) =>
            setSignUpForm({ ...signUpForm, password: val })
          }
        />
        <div className='space-y-1.5'>
          <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
            Location
          </label>
          <select className='w-full bg-gray-50 rounded-2xl px-6 py-4 text-sm font-medium outline-none appearance-none'>
            <option>United States</option>
            <option>United Kingdom</option>
            <option>Canada</option>
          </select>
        </div>
        {authError && (
          <p className='text-[10px] text-red-500 font-bold uppercase tracking-widest px-2'>
            {authError}
          </p>
        )}
        <Button className='w-full' onClick={handleSignup} loading={authBusy}>
          {authBusy ? 'Creating account…' : 'Join MainWRLD'}
        </Button>
      </div>
    </AuthLayout>
  )
}
