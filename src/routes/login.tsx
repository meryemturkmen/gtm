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
  const demo = import.meta.env.VITE_DEMO_EMAIL && import.meta.env.VITE_DEMO_PASSWORD

  async function demoLogin() {
    setState('sending')
    const { error } = await supabase.auth.signInWithPassword({ email: import.meta.env.VITE_DEMO_EMAIL, password: import.meta.env.VITE_DEMO_PASSWORD })
    if (error) { setError(error.message); setState('error') } else window.location.assign('/companies')
  }

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
      <form onSubmit={send} className="w-full max-w-xs flex flex-col gap-5">
        <div>
          <p className="mono text-label-2">GTM · go-to-market toolkit</p>
          <h1 className="title mt-1">Domains in, pipeline out.</h1>
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
              {state === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {demo && (
              <button type="button" className="btn justify-center" disabled={state === 'sending'} onClick={demoLogin}>
                Try the demo workspace
              </button>
            )}
          </>
        )}
      </form>
    </main>
  )
}
