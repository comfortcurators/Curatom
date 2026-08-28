import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Zap, ShieldCheck, ShieldAlert, History, KeyRound, Trash2, RefreshCcw, FileEdit, DatabaseZap, FlaskConical, Eye, MessageCircleQuestion } from 'lucide-react';
import { api } from '../api';
import { RecallLog, AuditLogEntry } from '../types';

type FeedTab = 'recall' | 'audit';

const ACTION_META: Record<string, { icon: React.ElementType; tone: 'neutral' | 'accent' | 'warning' }> = {
  'atom.create': { icon: KeyRound, tone: 'accent' },
  'atom.transition': { icon: RefreshCcw, tone: 'neutral' },
  'key.rotate': { icon: KeyRound, tone: 'accent' },
  'memory.write': { icon: FileEdit, tone: 'neutral' },
  'subject.erase': { icon: Trash2, tone: 'warning' },
  'directory.ingest': { icon: DatabaseZap, tone: 'accent' },
  'fixtures.load-synthetic': { icon: FlaskConical, tone: 'neutral' },
  'recall.residency_denied': { icon: ShieldAlert, tone: 'warning' },
  'context.read': { icon: Eye, tone: 'neutral' },
  'decision.read': { icon: Eye, tone: 'neutral' },
  'ask.query': { icon: MessageCircleQuestion, tone: 'neutral' },
};

const actionMeta = (action: string) => {
  const exact = ACTION_META[action];
  if (exact) return exact;
  const prefix = Object.keys(ACTION_META).find((k) => action.startsWith(k));
  if (prefix) return ACTION_META[prefix];
  return { icon: History, tone: 'neutral' as const };
};

// The raw action string (e.g. "training_corpus.export") is precise and
// correct - the right thing for an engineer to see. It's also the only
// thing this page showed, and Changes is one of the founder-facing
// buckets, not Jargon. The raw string is still there, in the tooltip -
// this just puts a plain label in front of it.
const ACTION_LABELS: Record<string, string> = {
  'atom.create': 'Added an agent key',
  'atom.read': 'Viewed agents',
  'key.rotate': 'Rotated an agent key',
  'memory.write': 'Added a memory',
  'memory.write.queued': 'Agent asked to add a memory (awaiting approval)',
  'memory.delete': 'Deleted a memory',
  'subject.erase': 'Erased a person’s data (right to erasure)',
  'directory.ingest': 'Synced model documentation',
  'recall.residency_denied': 'Blocked a recall for crossing a data-residency boundary',
  'context.read': 'Viewed the White Paper',
  'context.write': 'Updated the White Paper',
  'context.write.queued': 'Agent proposed a White Paper update (awaiting approval)',
  'context.delete': 'Reset the White Paper',
  'context.extract_from_image': 'Read business details from a photo',
  'decision.read': 'Viewed the decision log',
  'decision.create': 'Recorded a decision',
  'decision.write.queued': 'Agent asked to record a decision (awaiting approval)',
  'decision.outcome_recorded': 'Recorded what actually happened after a decision',
  'ask.query': 'Asked a question',
  'sketchbook.write': 'Wrote a Notepad entry',
  'sketchbook.read': 'Read a Notepad',
  'sketchbook.read_all': 'Viewed every Notepad (Owner)',
  'user.create': 'Added a teammate',
  'user.deactivate': 'Removed a teammate’s access',
  'tenant.register': 'Registered this workspace',
  'tenant.rename': 'Renamed the workspace',
  'tenant.training_consent': 'Changed the training-data consent setting',
  'training_corpus.export': 'Exported the training corpus to storage',
  'policy.create': 'Added a custom policy',
  'policy.delete': 'Removed a custom policy',
};

const actionLabel = (action: string): string => {
  const exact = ACTION_LABELS[action];
  if (exact) return exact;
  if (action.startsWith('atom.transition.')) {
    const transition = action.slice('atom.transition.'.length);
    return `Changed an agent's status to ${transition}`;
  }
  if (action.endsWith('.approved')) return 'Approved a pending agent action';
  if (action.endsWith('.denied')) return 'Denied a pending agent action';
  const prefix = Object.keys(ACTION_LABELS).find((k) => action.startsWith(k));
  if (prefix) return ACTION_LABELS[prefix];
  return action;
};

const toneClasses: Record<'neutral' | 'accent' | 'warning', string> = {
  neutral: 'text-ink-secondary',
  accent: 'text-accent',
  warning: 'text-danger',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const auditDetail = (entry: AuditLogEntry): string => {
  // details is the actually-informative field when present (e.g. the query
  // text on ask.query) - it used to lose to a boilerplate "Decision:
  // PERMITTED" whenever an entry carried both, hiding the one thing worth
  // reading behind a label every permitted action already has.
  if (entry.reason) return entry.reason;
  if (entry.details) return JSON.stringify(entry.details);
  if (entry.decision) return `Decision: ${entry.decision}`;
  return '—';
};

export const Feed: React.FC = () => {
  const [tab, setTab] = useState<FeedTab>('recall');

  const [logs, setLogs] = useState<RecallLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [auditItems, setAuditItems] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api.getLogs();
      setLogs(data.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const data = await api.getAuditTrail();
      setAuditItems(data.items);
      setAuditError(null);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : 'Failed to load audit trail');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    fetchAudit();
    const interval = setInterval(fetchAudit, 5000);
    return () => clearInterval(interval);
  }, [fetchAudit]);

  return (
    <div className="space-y-24 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Recall Observability & Audit Log</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            {tab === 'recall'
              ? 'Append-only telemetry recording real execution latency, residency clearances, and cache hits.'
              : 'Append-only record of every mutating operator action — who did what, to which resource, and why.'}
          </p>
        </div>
        <div className="flex items-center gap-8 text-11 text-accent font-mono bg-surface-200 px-10 py-4 rounded-full border border-surface-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          {tab === 'recall' ? 'RECALL FEED ACTIVE' : 'AUDIT FEED ACTIVE'}
        </div>
      </div>

      <div className="flex gap-4 shrink-0 bg-surface-200 border border-surface-300 rounded-md p-4 w-fit">
        <button
          onClick={() => setTab('recall')}
          className={`flex items-center gap-6 px-12 py-6 rounded text-12 font-mono transition-colors ${
            tab === 'recall' ? 'bg-surface-400 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <Zap size={13} /> Recall Telemetry
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`flex items-center gap-6 px-12 py-6 rounded text-12 font-mono transition-colors ${
            tab === 'audit' ? 'bg-surface-400 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <ShieldCheck size={13} /> Audit Trail
        </button>
      </div>

      {tab === 'recall' ? (
        <div className="flex-1 bg-surface-100 border border-surface-300 rounded-lg overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-12 gap-12 p-14 border-b border-surface-300 bg-surface-200 text-11 font-mono text-ink-secondary uppercase tracking-wider sticky top-0">
                <div className="col-span-2 truncate">Timestamp</div>
                <div className="col-span-3 truncate">Requester Atom</div>
                <div className="col-span-3 truncate">Topic</div>
                <div className="col-span-2 truncate">Residency & Status</div>
                <div className="col-span-2 text-right truncate">Latency</div>
              </div>

              <div className="p-8 space-y-4">
                {logsLoading && logs.length === 0 ? (
                  <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-48 text-ink-secondary text-13 font-prose">No recall events recorded yet.</div>
                ) : (
                  logs.map(log => (
                    <div key={log.recall_id} className="grid grid-cols-12 gap-12 p-10 rounded hover:bg-surface-200 transition-colors items-center text-12 border border-transparent hover:border-surface-300">
                      <div className="col-span-2 text-ink-secondary font-mono text-11 truncate">
                        {formatTime(log.timestamp)}
                      </div>
                      <div className="col-span-3 text-ink-primary font-mono truncate" title={log.atom_id}>
                        {log.atom_id}
                      </div>
                      <div className="col-span-3 text-ink-primary font-mono truncate" title={log.topic}>
                        {log.topic}
                      </div>
                      <div className="col-span-2 flex items-center gap-6 overflow-hidden">
                        {log.was_cached ? (
                          <span className="flex items-center gap-3 text-ink-primary text-10 font-mono bg-surface-400 px-6 py-1 rounded shrink-0">
                            <Zap size={10} className="text-accent" /> Cached
                          </span>
                        ) : log.is_stale ? (
                          <span className="flex items-center gap-3 text-accent text-10 font-mono bg-accent/10 px-6 py-1 rounded shrink-0">
                            <AlertTriangle size={10} /> Stale (+{log.staleness_overage_hours}h)
                          </span>
                        ) : (
                          <span className="flex items-center gap-3 text-ink-secondary text-10 font-mono shrink-0">
                            <CheckCircle2 size={10} /> Fresh
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-mono text-11 text-ink-secondary flex justify-end items-center gap-4">
                        <Clock size={11} className="shrink-0" />
                        <span className="truncate">{log.latency_ms}ms</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-surface-100 border border-surface-300 rounded-lg overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-12 gap-12 p-14 border-b border-surface-300 bg-surface-200 text-11 font-mono text-ink-secondary uppercase tracking-wider sticky top-0">
                <div className="col-span-2 truncate">Timestamp</div>
                <div className="col-span-2 truncate">Actor</div>
                <div className="col-span-3 truncate">Action</div>
                <div className="col-span-2 truncate">Resource</div>
                <div className="col-span-3 truncate">Detail</div>
              </div>

              <div className="p-8 space-y-4">
                {auditLoading && auditItems.length === 0 ? (
                  <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
                ) : auditError ? (
                  <div className="text-center py-48 text-danger text-13 font-prose flex flex-col items-center gap-8">
                    <ShieldAlert size={20} />
                    {auditError}
                  </div>
                ) : auditItems.length === 0 ? (
                  <div className="text-center py-48 text-ink-secondary text-13 font-prose">No audited actions recorded yet.</div>
                ) : (
                  auditItems.map((entry, idx) => {
                    const meta = actionMeta(entry.action);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={`${entry.timestamp}_${idx}`}
                        className="grid grid-cols-12 gap-12 p-10 rounded hover:bg-surface-200 transition-colors items-center text-12 border border-transparent hover:border-surface-300"
                      >
                        <div className="col-span-2 text-ink-secondary font-mono text-11 truncate">
                          {formatTime(entry.timestamp)}
                        </div>
                        <div className="col-span-2 text-ink-primary font-mono truncate" title={entry.actor}>
                          {entry.actor || '—'}
                        </div>
                        <div className={`col-span-3 flex items-center gap-6 truncate ${toneClasses[meta.tone]}`} title={entry.action}>
                          <Icon size={12} className="shrink-0" />
                          <span className="truncate font-prose">{actionLabel(entry.action)}</span>
                        </div>
                        <div className="col-span-2 text-ink-secondary font-mono truncate" title={entry.resource}>
                          {entry.resource}
                        </div>
                        <div className="col-span-3 text-ink-secondary font-prose truncate" title={auditDetail(entry)}>
                          {auditDetail(entry)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
