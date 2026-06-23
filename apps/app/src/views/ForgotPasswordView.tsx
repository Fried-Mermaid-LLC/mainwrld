import React, { useState } from 'react'
import { Button, Input } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'
import { sendPasswordReset } from '@/config/config'

export const ForgotPasswordView = () => {
  const { setView, registeredUsers, showToast } = useApp()
  const onBack = () => setView('login')
  // Branded reset email via the sendPasswordReset callable (Resend). The server
  // never reveals whether the address has an account, so we always show the
  // same "check your email" confirmation.
  const onResetPassword = async (email: string) => {
    await sendPasswordReset(email)
  }
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSendReset = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email', 'error')
      return
    }
    try {
      await onResetPassword(email)
      setSent(true)
      showToast('Password reset email sent!', 'check_circle')
    } catch {
      showToast('Failed to send reset email', 'error')
    }
  }

  return (
    <div className='fixed inset-0 bg-white p-8 flex flex-col items-center justify-center animate-in fade-in duration-500'>
      <header className='absolute top-8 left-8'>
        <button
          onClick={onBack}
          className='w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
      </header>

      {!sent ? (
        <>
          <h1 className='text-3xl font-display mb-4'>Reset Password</h1>
          <p className='text-center text-xs text-gray-400 font-bold uppercase tracking-widest mb-12 px-8'>
            Enter your email and we'll send you a reset link.
          </p>
          <div className='w-full max-w-sm space-y-8 mb-8'>
            <Input
              label='Email Address'
              placeholder='you@example.com'
              value={email}
              onChange={(val: string) => setEmail(val)}
            />
            <Button className='w-full' onClick={handleSendReset}>
              Send Reset Link
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className='material-icons-round text-5xl text-green-500 mb-4'>
            check_circle
          </span>
          <h1 className='text-3xl font-display mb-4'>Check Your Email</h1>
          <p className='text-center text-xs text-gray-400 font-bold uppercase tracking-widest mb-12 px-8'>
            We sent a password reset link to {email}
          </p>
          <Button className='w-full max-w-sm' onClick={onBack}>
            Back to Login
          </Button>
        </>
      )}
    </div>
  )
}
