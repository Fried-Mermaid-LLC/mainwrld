import React, { useState } from 'react'
import { Button, Input } from '@/components/sharedComponents'
import { AuthLayout } from '@/components/AuthLayout'
import { useApp } from '@/state/AppContext'
import { sendPasswordReset } from '@/services/authService'

export const ForgotPasswordView = () => {
  const { setView, registeredUsers, showToast } = useApp()
  const onBack = () => setView('login')
  // Branded reset email via the API (/auth/password-reset, Resend server-side).
  // The server never reveals whether the address has an account, so we always
  // show the same "check your email" confirmation.
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
    <AuthLayout
      center
      title={sent ? 'Check Your Email' : 'Reset Password'}
      onBack={onBack}
    >
      {!sent ? (
        <>
          <p className='text-xs text-gray-400 font-bold uppercase tracking-widest mb-8'>
            Enter your email and we'll send you a reset link.
          </p>
          <div className='space-y-8'>
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
          <p className='text-xs text-gray-400 font-bold uppercase tracking-widest mb-8'>
            We sent a password reset link to {email}
          </p>
          <Button className='w-full' onClick={onBack}>
            Back to Login
          </Button>
        </>
      )}
    </AuthLayout>
  )
}
