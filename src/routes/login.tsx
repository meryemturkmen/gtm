import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ScoreMeter } from '../components/Cell'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/companies' })
  },
  component: Login,
})

/** The first screen shows the product doing its one trick, next to the form. Nothing else. */
function Login() {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex flex-col justify-center gap-8 px-6 py-12 lg:pl-16 lg:pr-10 min-w-0">
        <div className="max-w-xl">
          <p className="mono text-label-2">GTM · go-to-market toolkit</p>
          <h1 className="text-[34px] leading-10 font-semibold tracking-[-0.025em] mt-3">Domains in, pipeline out.</h1>
          <p className="text-label-2 text-[15px] leading-6 mt-3">
            Paste a list of domains. Five free providers and your own LLM fill the columns, a playbook opens the deal.
            Every cell keeps its provenance.
          </p>
        </div>
        <Preview />
      </section>
      <aside className="flex items-center justify-center px-6 py-12 lg:border-l border-separator bg-surface">
        <SignIn />
      </aside>
    </main>
  )
}

function SignIn() {
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
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) { setError(error.message); setState('error') } else setState('sent')
  }

  return (
    <form onSubmit={send} className="w-full max-w-xs flex flex-col gap-5">
      <h2 className="title">Sign in</h2>
      {state === 'sent' ? (
        <p role="status">Check <b>{email}</b> for your link.</p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-label-2">Email</span>
            <input className="input h-9" type="email" required autoFocus autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          {state === 'error' && <p role="alert" className="text-red">{error}</p>}
          <button className="btn btn-primary h-9 justify-center" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {demo && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-separator">
              <button type="button" className="btn h-9 justify-center" disabled={state === 'sending'} onClick={demoLogin}>
                Try the demo workspace
              </button>
              <p className="text-label-3 text-xs text-center">No account needed. The demo resets every day.</p>
            </div>
          )}
        </>
      )}
      <a href="https://github.com/meryemturkmen/gtm" className="mono link text-label-2 self-center mt-2">source on github</a>
    </form>
  )
}

/* A fixed scene, replayed every few seconds: four rows get enriched, three of them qualify. */
const rows = [
  { domain: 'parloa.com', name: 'Parloa', tech: 'Next.js, Netlify', hiring: 'Yes', score: 85 },
  { domain: 'staffbase.com', name: 'Staffbase', tech: 'HubSpot, Segment', hiring: 'Yes', score: 85 },
  { domain: 'sennder.com', name: 'sennder', tech: 'Nuxt, Vue', hiring: 'No', score: 5 },
  { domain: 'pipedrive.com', name: 'Pipedrive', tech: 'HubSpot, React', hiring: 'Yes', score: 85 },
]
const STEP = 0.22, ROW = 1.1, LOOP = 9000

function Preview() {
  const [cycle, setCycle] = useState(0)
  useEffect(() => { const t = setInterval(() => setCycle(c => c + 1), LOOP); return () => clearInterval(t) }, [])
  const at = (r: number, c: number) => 0.4 + r * ROW + c * STEP
  const done = 0.4 + rows.length * ROW
  return (
    <div key={cycle} className="card overflow-hidden max-w-3xl" aria-hidden>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>{['Domain', 'Name', 'Tech Stack', 'Hiring', 'ICP Score'].map(h => <th key={h} className="th pl-3 first:pl-4">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.domain} className="border-b border-separator odd:bg-surface-2/40 h-9">
              <td className="pl-4 pr-3 mono font-medium whitespace-nowrap">{r.domain}</td>
              <PreviewCell delay={at(i, 0)}>{r.name}</PreviewCell>
              <PreviewCell delay={at(i, 1)}>{r.tech}</PreviewCell>
              <PreviewCell delay={at(i, 2)}>{r.hiring}</PreviewCell>
              <PreviewCell delay={at(i, 3)}><ScoreMeter score={r.score} /></PreviewCell>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="arrive px-4 py-2.5 text-label-2 leading-5" style={{ animationDelay: `${done}s` }}>
        <span className="inline-block size-1.5 rounded-full bg-green mr-2 align-middle" />
        Playbook <b className="text-label font-medium">Qualify high ICP fits</b> opened 3 deals in Qualified.
      </p>
    </div>
  )
}

function PreviewCell({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <td className="pl-3 pr-3 whitespace-nowrap border-l border-separator/60">
      <span className="inline-flex items-center gap-1.5">
        <span className="dot-wait inline-block size-1.5 rounded-full bg-orange shrink-0" style={{ animationDuration: `${delay}s` }} />
        <span className="arrive" style={{ animationDelay: `${delay}s` }}>{children}</span>
      </span>
    </td>
  )
}
