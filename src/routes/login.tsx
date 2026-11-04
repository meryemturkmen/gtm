import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/companies' })
  },
  component: Login,
})

function Login() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setState('error') } else setState('sent')
  }

  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <form onSubmit={send} className="card w-full max-w-xs p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">GMT</h1>
          <p className="text-label-2 mt-1">Sign in with a magic link.</p>
        </div>
        {state === 'sent' ? (
          <p role="status">Check <b>{email}</b> for your link.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-label-2">Email</span>
              <input className="input" type="email" required autoFocus autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            {state === 'error' && <p role="alert" className="text-red">{error}</p>}
            <button className="btn btn-primary justify-center" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send link'}
            </button>
          </>
        )}
      </form>
    </main>
  )
}
