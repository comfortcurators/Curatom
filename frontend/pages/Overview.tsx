import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Bot, MessageCircleQuestion, Loader2, Pencil, Copy, Check, KeyRound, Camera, ChevronDown } from 'lucide-react';
import { api } from '../api';
import { BusinessContext } from '../types';
import { BusinessContextForm } from '../components/BusinessContextForm';
import { RegisterAtomForm } from '../components/RegisterAtomForm';

const BackupCode: React.FC = () => {
  // Used to render open, full-height, on every dashboard load - a
  // permanent fixture demanding attention for something most founders
  // set up once and never touch again. Collapsed by default now, same
  // pattern as the White Paper section below.
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (code && !confirm('Generating a new code replaces your old one — it will stop working. Continue?')) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.createRecoveryCode();
      setCode(res.recovery_code);
      setCopied(false);
    } catch (e: any) {
      setError(e.message || 'Could not generate a backup code — try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-10"
      >
        <span className="flex items-center gap-10">
          <KeyRound size={18} className="text-accent" />
          <span className="text-15 text-ink-primary font-medium">Your backup code</span>
        </span>
        <ChevronDown size={16} className={`text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-14 mt-16">
          <p className="text-13 text-ink-secondary font-prose">
            Lose your password and you lose access — unless you have this. Generate a code, then write it down or{' '}
            <Camera size={12} className="inline -mt-2" /> photograph it and keep that somewhere safe, like you would
            a physical key. Curatom never sees or stores that paper or photo — only the code itself, and only as a
            hash.
          </p>

          {code ? (
            <div className="flex items-center gap-8 bg-surface-200 border border-surface-400 rounded-md p-12">
              <code className="flex-1 text-14 font-mono text-ink-primary tracking-wider break-all">{code}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300 shrink-0"
                title="Copy"
              >
                {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
              </button>
            </div>
          ) : null}

          {error && <div className="text-13 text-accent font-prose">~ {error} ~</div>}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-8 px-14 py-8 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded-md border border-surface-400 transition-colors text-13 font-medium disabled:opacity-50"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {code ? 'Generate a new code' : 'Generate a backup code'}
          </button>
          <p className="text-11 text-ink-secondary font-mono">
            Shown once. Generating a new one replaces the old — only the latest code works.
          </p>
        </div>
      )}
    </div>
  );
};

interface Stat {
  label: string;
  value: string;
  icon: React.ElementType;
}

export const Overview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<BusinessContext | null>(null);
  const [editing, setEditing] = useState(false);
  // The full context used to render open on every dashboard load - the
  // founder already knows what they told Curatom, since they're the one
  // who typed it. Collapsed by default; Edit already covers changing it,
  // this is only for the rare "what does the AI actually see" check.
  const [showContext, setShowContext] = useState(false);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [questionsToday, setQuestionsToday] = useState<number | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const ctxRes = await api.getBusinessContext();
      setContext(ctxRes.onboarded ? ctxRes.context : null);

      if (ctxRes.onboarded) {
        const [atoms, logs, audit] = await Promise.all([
          api.getAtoms(undefined, 200),
          api.getLogs(undefined, 200),
          api.getAuditTrail(undefined, 20),
        ]);
        setAgentCount(atoms.items.length);
        const today = new Date().toDateString();
        setQuestionsToday(logs.items.filter((l) => new Date(l.timestamp).toDateString() === today).length);
        const deniedRecently = audit.items.find((a) => a.action.includes('denied'));
        setIssue(
          deniedRecently
            ? `An automated request was blocked for policy reasons on ${new Date(deniedRecently.timestamp).toLocaleString()}. This is your safeguards working, not a system failure.`
            : null
        );
      }
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || 'Could not reach Curatom right now. Try refreshing in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-96">
        <Loader2 size={28} className="animate-spin text-ink-secondary" />
      </div>
    );
  }

  if (loadError && !context) {
    return (
      <div className="max-w-2xl mx-auto text-center py-64 space-y-12">
        <AlertTriangle size={28} className="text-accent mx-auto" />
        <p className="text-14 text-ink-secondary font-prose">{loadError}</p>
      </div>
    );
  }

  if (!context || editing) {
    return (
      <BusinessContextForm
        initial={context}
        onSaved={(saved) => {
          setContext(saved);
          setEditing(false);
          load();
        }}
      />
    );
  }

  const stats: Stat[] = [
    { label: 'AI agents connected', value: agentCount === null ? '—' : String(agentCount), icon: Bot },
    { label: 'Questions answered today', value: questionsToday === null ? '—' : String(questionsToday), icon: MessageCircleQuestion },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-24">
      <div className="flex items-start justify-between gap-16">
        <div>
          <h1 className="font-display text-28 text-ink-primary">{context.business_name}</h1>
          <p className="text-14 text-ink-secondary mt-6 font-prose">
            This is what every AI agent connected to Curatom knows about your business.
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-6 px-12 py-8 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded-md border border-surface-400 transition-colors text-12 shrink-0"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 flex items-center gap-16">
        {issue ? (
          <>
            <AlertTriangle size={28} className="text-accent shrink-0" />
            <div>
              <div className="text-16 text-ink-primary font-medium">Worth a look</div>
              <div className="text-13 text-ink-secondary font-prose mt-2">{issue}</div>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 size={28} className="text-accent shrink-0" />
            <div>
              <div className="text-16 text-ink-primary font-medium">Everything is running normally</div>
              <div className="text-13 text-ink-secondary font-prose">Nothing needs your attention right now.</div>
            </div>
          </>
        )}
      </div>

      {agentCount === 0 && <RegisterAtomForm title="Connect your first AI agent" onConnected={load} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-16">
        <Link
          to="/registry"
          className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 flex flex-col gap-10 hover:bg-surface-200 hover:border-accent/40 transition-colors"
        >
          <Bot size={18} className="text-accent" />
          <div className="font-display text-24 text-ink-primary">{stats[0].value}</div>
          <div className="text-12 text-ink-secondary font-prose">{stats[0].label}</div>
        </Link>
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 flex flex-col gap-10">
          <MessageCircleQuestion size={18} className="text-accent" />
          <div className="font-display text-24 text-ink-primary">{stats[1].value}</div>
          <div className="text-12 text-ink-secondary font-prose">{stats[1].label}</div>
        </div>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24">
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          className="flex w-full items-center justify-between text-15 text-ink-primary font-medium"
        >
          The White Paper
          <span className="text-12 text-ink-secondary font-mono">{showContext ? 'Hide' : 'Show'}</span>
        </button>
        {showContext && (
          <div className="space-y-16 mt-16">
            <ContextField label="What you do" value={context.what_you_do} />
            <ContextField label="Customers" value={context.customers} />
            <ContextField label="Current stack" value={context.current_stack} />
            <ContextField label="Priorities" value={context.priorities} />
            {context.constraints && <ContextField label="Constraints" value={context.constraints} />}
            {context.voice_and_tone && <ContextField label="Voice & tone" value={context.voice_and_tone} />}
            {context.anything_else && <ContextField label="Anything else" value={context.anything_else} />}
          </div>
        )}
      </div>

      {localStorage.getItem('curatom_role') === 'Owner' && <WhitePaperHistory onRestored={load} />}

      <BackupCode />
    </div>
  );
};

// The repository has snapshotted every superseded White Paper version
// since before this existed - nothing ever surfaced it. A founder who
// approves an agent's draft (replacing their own answers wholesale, as
// happened live) had no way to see what changed or get a field back.
// Owner-only: as sensitive as the document itself.
const WhitePaperHistory: React.FC<{ onRestored: () => void }> = ({ onRestored }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<(BusinessContext & { superseded_at: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBusinessContextHistory();
      setEntries(res.history);
    } catch (e: any) {
      setError(e.message || 'Could not load version history.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && entries.length === 0) load();
  };

  const handleRestore = async (supersededAt: string) => {
    if (!confirm('Restore this version? The version currently live will itself be saved to history first, so nothing is lost.')) return;
    setRestoring(supersededAt);
    try {
      await api.restoreBusinessContext(supersededAt);
      await load();
      onRestored();
    } catch (e: any) {
      alert(`Could not restore: ${e.message}`);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-15 text-ink-primary font-medium"
      >
        White Paper version history
        <span className="text-12 text-ink-secondary font-mono">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-16 space-y-12">
          {loading ? (
            <div className="flex justify-center py-24"><Loader2 size={18} className="animate-spin text-ink-secondary" /></div>
          ) : error ? (
            <div className="text-13 text-accent font-prose">~ {error} ~</div>
          ) : entries.length === 0 ? (
            <p className="text-13 text-ink-secondary font-prose">
              No earlier versions yet — this is the only one on record.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.superseded_at} className="bg-surface-200 border border-surface-400 rounded-md p-14 space-y-8">
                <div className="flex items-center justify-between">
                  <span className="text-11 font-mono text-ink-secondary">
                    Replaced {new Date(entry.superseded_at).toLocaleString()}
                    {entry.version ? ` · v${entry.version}` : ''}
                  </span>
                  <button
                    onClick={() => handleRestore(entry.superseded_at)}
                    disabled={restoring === entry.superseded_at}
                    className="text-11 text-accent hover:underline disabled:opacity-50 flex items-center gap-4"
                  >
                    {restoring === entry.superseded_at ? <Loader2 size={11} className="animate-spin" /> : null}
                    Restore this version
                  </button>
                </div>
                <div className="text-12 text-ink-primary font-prose">
                  <span className="text-ink-secondary">What you do:</span> {entry.what_you_do || '—'}
                </div>
                <div className="text-12 text-ink-primary font-prose">
                  <span className="text-ink-secondary">Priorities:</span> {entry.priorities || '—'}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const ContextField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-11 text-ink-secondary font-mono uppercase tracking-wider mb-4">{label}</div>
    <div className="text-13 text-ink-primary font-prose leading-relaxed">{value}</div>
  </div>
);
