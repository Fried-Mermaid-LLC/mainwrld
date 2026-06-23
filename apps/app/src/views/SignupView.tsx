import { Button, Input } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

export const SignupView = () => {
  const { setView, setAuthError, signUpForm, setSignUpForm, authError, handleSignup } = useApp()
  return (
    <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='flex items-center gap-4 mb-10'>
        <button
          onClick={() => {
            setAuthError(null)
            setView('login')
          }}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-2xl font-bold'>Sign Up</h1>
      </header>
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
        <Button className='w-full' onClick={handleSignup}>
          Join MainWRLD
        </Button>
      </div>
    </div>
  )
}
