import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Bot, MessageCircleQuestion, BookOpen, Loader2 } from 'lucide-react';
import { api } from '../api';

interface Stat {
  label: string;
  value: string;
  icon: React.ElementType;
}

export const Overview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [questionsToday, setQuestionsToday] = useState<number | null>(null);
  const [knowledgeSources, setKnowledgeSources] = useState<number | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [atoms, logs, dirStatus, audit] = await Promise.all([
          api.getAtoms(undefined, 200),
          api.getLogs(undefined, 200),
          api.getDirectoryStatus(),
          api.getAuditTrail(undefined, 20),
        ]);
        if (cancelled) return;

        setAgentCount(atoms.items.length);

        const today = new Date().toDateString();
        const todaysLogs = logs.items.filter((l) => new Date(l.timestamp).toDateString() === today);
        setQuestionsToday(todaysLogs.length);

        setKnowledgeSources(dirStatus.total_models);
        setIngesting(dirStatus.is_ingesting);

        const deniedRecently = audit.items.find((a) => a.action.includes('denied'));
        if (deniedRecently) {
          setIssue(
            `An automated request was blocked for policy reasons on ${new Date(deniedRecently.timestamp).toLocaleString()}. This is your safeguards working as intended, not a system failure — see Audit & Telemetry if you want the detail.`
          );
        } else {
          setIssue(null);
        }
      } catch (e) {
        if (!cancelled) setIssue('Could not reach the business status service. Everything else in the app may still work — try refreshing in a minute.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: Stat[] = [
    { label: 'AI agents connected', value: agentCount === null ? '—' : String(agentCount), icon: Bot },
    { label: 'Questions answered today', value: questionsToday === null ? '—' : String(questionsToday), icon: MessageCircleQuestion },
    { label: 'Knowledge sources indexed', value: knowledgeSources === null ? '—' : String(knowledgeSources), icon: BookOpen },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-24">
      <div>
        <h1 className="font-display text-28 text-ink-primary">Your business, at a glance</h1>
        <p className="text-14 text-ink-secondary mt-6 font-prose">
          No jargon here — this is what Curatom is doing for you right now.
        </p>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 flex items-center gap-16">
        {loading ? (
          <>
            <Loader2 size={28} className="animate-spin text-ink-secondary shrink-0" />
            <div>
              <div className="text-16 text-ink-primary font-medium">Checking in on things…</div>
              <div className="text-13 text-ink-secondary font-prose">One moment.</div>
            </div>
          </>
        ) : issue ? (
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
              <div className="text-13 text-ink-secondary font-prose">No blocked requests, no failed jobs, nothing needs your attention.</div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-16">
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

      {ingesting && (
        <div className="text-12 text-ink-secondary font-prose bg-surface-200 border border-surface-300 rounded-md p-12">
          Curatom is currently learning about new AI models in the background. This doesn't affect anything you're doing — it'll finish on its own.
        </div>
      )}

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24">
        <h2 className="text-15 text-ink-primary font-medium mb-8">What Curatom actually does for you</h2>
        <p className="text-13 text-ink-secondary font-prose leading-relaxed">
          Curatom is the system your AI agents and developer tools check in with before they act — it decides what
          each one is allowed to see and do, keeps a record of every decision, and never lets an agent make something
          up when it isn't sure. You don't need to configure any of this day to day; it's here so that when you ask
          "what did our AI actually do," there's a real, checkable answer.
        </p>
        <p className="text-13 text-ink-secondary font-prose leading-relaxed mt-12">
          Looking for the engineering-level detail — API routes, policy rules, raw logs? That lives under{' '}
          <span className="text-ink-primary">Technical</span> in the sidebar. You shouldn't need to go there unless
          your technical team asks you to.
        </p>
      </div>
    </div>
  );
};
