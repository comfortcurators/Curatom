import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Bot, MessageCircleQuestion, Loader2, Pencil, Plug, Copy, Check } from 'lucide-react';
import { api } from '../api';
import { BusinessContext } from '../types';
import { BusinessContextForm } from '../components/BusinessContextForm';

const MODEL_FAMILIES = ['Claude', 'GPT', 'Gemini', 'Other'];

const ConnectFirstAgent: React.FC<{ onConnected: () => void }> = ({ onConnected }) => {
  const [name, setName] = useState('');
  const [modelFamily, setModelFamily] = useState('Claude');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.registerAtom({
        name,
        model_family: modelFamily,
        description: `Connected from the Overview quick-start.`,
        requires_approval: requiresApproval,
      });
      setApiKey(res.api_key);
    } catch (e: any) {
      setError(e.message || 'Could not connect that agent — try again.');
    } finally {
      setSaving(false);
    }
  };

  if (apiKey) {
    return (
      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-14">
        <div className="flex items-center gap-10">
          <CheckCircle2 size={22} className="text-accent" />
          <h2 className="text-15 text-ink-primary font-medium">{name} is connected</h2>
        </div>
        <p className="text-13 text-ink-secondary font-prose">
          Give it this key — it's shown once and can't be retrieved again. Anywhere that key is used can now read
          your business context and act within its permissions.
          {requiresApproval && (
            <> Every write it attempts is queued, not executed — approve or deny each one from the Team page before it takes effect.</>
          )}
        </p>
        <div className="flex items-center gap-8 bg-surface-200 border border-surface-400 rounded-md p-12">
          <code className="flex-1 text-12 font-mono text-ink-primary break-all">{apiKey}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(apiKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300 shrink-0"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
          </button>
        </div>
        <button
          onClick={onConnected}
          className="text-13 text-accent hover:underline"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-14">
      <div className="flex items-center gap-10">
        <Plug size={20} className="text-accent" />
        <h2 className="text-15 text-ink-primary font-medium">Connect your first AI agent</h2>
      </div>
      <p className="text-13 text-ink-secondary font-prose">
        Give it a name and which model family it is. That's it — no fleets, roles, or configuration to understand.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
        <div>
          <label className="block text-11 font-mono text-ink-secondary mb-6">Name</label>
          <input
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-prose"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Guest support assistant"
            required
          />
        </div>
        <div>
          <label className="block text-11 font-mono text-ink-secondary mb-6">Model family</label>
          <select
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
            value={modelFamily}
            onChange={(e) => setModelFamily(e.target.value)}
          >
            {MODEL_FAMILIES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-8 p-10 rounded-md border border-surface-400 bg-surface-200 cursor-pointer">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
          className="mt-2"
        />
        <span className="text-12 text-ink-secondary font-prose">
          <span className="text-ink-primary font-medium">Require my approval before this key can write anything.</span>{' '}
          It can still do everything it's capable of, but nothing it adds or changes takes effect until you approve it — you'll see every attempt in the Team page.
        </span>
      </label>
      {error && <div className="text-13 text-accent font-prose">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
        Connect
      </button>
    </form>
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

      {agentCount === 0 && <ConnectFirstAgent onConnected={load} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-16">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 flex flex-col gap-10">
              <Icon size={18} className="text-accent" />
              <div className="font-display text-24 text-ink-primary">{s.value}</div>
              <div className="text-12 text-ink-secondary font-prose">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-16">
        <h2 className="text-15 text-ink-primary font-medium">What you told Curatom</h2>
        <ContextField label="What you do" value={context.what_you_do} />
        <ContextField label="Customers" value={context.customers} />
        <ContextField label="Current stack" value={context.current_stack} />
        <ContextField label="Priorities" value={context.priorities} />
        {context.constraints && <ContextField label="Constraints" value={context.constraints} />}
        {context.voice_and_tone && <ContextField label="Voice & tone" value={context.voice_and_tone} />}
        {context.anything_else && <ContextField label="Anything else" value={context.anything_else} />}
      </div>
    </div>
  );
};

const ContextField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-11 text-ink-secondary font-mono uppercase tracking-wider mb-4">{label}</div>
    <div className="text-13 text-ink-primary font-prose leading-relaxed">{value}</div>
  </div>
);
