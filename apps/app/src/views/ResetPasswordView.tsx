import React, { useEffect, useState } from 'react'
import { Button, Input } from '@/components/sharedComponents'
import { AuthLayout } from '@/components/AuthLayout'
import { useApp } from '@/state/AppContext'
import { verifyResetCode, completePasswordReset } from '@/services/firebaseService'

// Landing page for the Firebase password-reset email. The link arrives as
// ?mode=resetPassword&oobCode=…; useUI opens this view on first paint and
// useAuthActions keeps it from being bounced to the landing page. We verify
// the out-of-band code (rejecting expired/used links and recovering the
// target email), let the user pick a new password, then commit it. Before
// this view existed the link "led nowhere" — the SPA ignored the params.
//
// Policy mirrors signup (useAuthActions.handleSignup): 12-35 chars with at
// least one uppercase letter, one number, and one symbol.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,35}$/
const PASSWORD_RULE =
  'Password must be 12-35 characters and include at least one uppercase letter, one number, and one symbol.'

type Status = 'verifying' | 'ready' | 'invalid' | 'done'

export const ResetPasswordView = () => {
  const { setView, showToast } = useApp()
  const [oobCode] = useState(
    () => new URLSearchParams(window.location.search).get('oobCode') || ''
  )
  const [status, setStatus] = useState<Status>('verifying')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Send the user back to login and clear the reset params from the URL so a
  // later refresh doesn't re-process an already-consumed code.
  const goToLogin = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setView('login')
  }

  useEffect(() => {
    let active = true
    if (!oobCode) {
      setStatus('invalid')
      return
    }
    verifyResetCode(oobCode)
      .then(verifiedEmail => {
        if (!active) return
        setEmail(verifiedEmail)
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setStatus('invalid')
      })
    return () => {
      active = false
    }
  }, [oobCode])

  const handleReset = async () => {
    if (!PASSWORD_REGEX.test(password)) {
      showToast(PASSWORD_RULE, 'error')
      return
    }
    if (password !== confirm) {
      showToast('Passwords do not match', 'error')
      return
    }
    setSubmitting(true)
    try {
      await completePasswordReset(oobCode, password)
      setStatus('done')
    } catch (err: any) {
      // Most commonly the code expired or was already used between page load
      // and submit; force the user back to request a fresh link.
      if (
        err?.code === 'auth/expired-action-code' ||
        err?.code === 'auth/invalid-action-code'
      ) {
        showToast('This reset link has expired. Please request a new one.', 'error')
        setStatus('invalid')
      } else {
        showToast('Could not reset password. Please try again.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const titles: Record<Status, string> = {
    verifying: 'Reset Password',
    invalid: 'Link Expired',
    ready: 'New Password',
    done: 'Password Updated'
  }

  return (
    <AuthLayout center logo title={titles[status]} onBack={goToLogin}>
      {status === 'verifying' && (
        <p className='text-xs text-gray-400 font-bold uppercase tracking-widest'>
          Verifying reset link…
        </p>
      )}

      {status === 'invalid' && (
        <>
          <span className='material-icons-round text-5xl text-red-500 mb-4'>
            error_outline
          </span>
          <p className='text-xs text-gray-400 font-bold uppercase tracking-widest mb-8'>
            This reset link is invalid or has expired. Request a new one from the
            login screen.
          </p>
          <Button className='w-full' onClick={goToLogin}>
            Back to Login
          </Button>
        </>
      )}

      {status === 'ready' && (
        <>
          <p className='text-xs text-gray-400 font-bold uppercase tracking-widest mb-8'>
            {email
              ? `Set a new password for ${email}`
              : 'Enter your new password below.'}
          </p>
          <div className='space-y-6'>
            <Input
              label='New Password'
              type='password'
              placeholder='••••••••••••'
              value={password}
              onChange={(val: string) => setPassword(val)}
            />
            <Input
              label='Confirm Password'
              type='password'
              placeholder='••••••••••••'
              value={confirm}
              onChange={(val: string) => setConfirm(val)}
            />
            <Button
              className='w-full'
              onClick={handleReset}
              disabled={submitting}
            >
              {submitting ? 'Resetting…' : 'Reset Password'}
            </Button>
          </div>
        </>
      )}

      {status === 'done' && (
        <>
          <span className='material-icons-round text-5xl text-green-500 mb-4'>
            check_circle
          </span>
          <p className='text-xs text-gray-400 font-bold uppercase tracking-widest mb-8'>
            You can now log in with your new password.
          </p>
          <Button className='w-full' onClick={goToLogin}>
            Back to Login
          </Button>
        </>
      )}
    </AuthLayout>
  )
}
