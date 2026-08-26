import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Bot, MessageCircleQuestion, Loader2, Pencil } from 'lucide-react';
import { api } from '../api';
import { BusinessContext } from '../types';
import { BusinessContextForm } from '../components/BusinessContextForm';

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
