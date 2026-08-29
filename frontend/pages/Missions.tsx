import React, { useEffect, useState } from 'react';
import { Play, Loader2, ShieldCheck, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import { AutonomousTask } from '../types';
import { PlainExplain } from '../components/PlainExplain';

export const Missions: React.FC = () => {
  const [goal, setGoal] = useState('What does this business actually do, and which registered agents are allowed to recall it?');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<AutonomousTask[]>([]);
  const [active, setActive] = useState<AutonomousTask | null>(null);

  const load = async () => {
    try {
      const res = await api.listTasks();
      setTasks(res.items || []);
    } catch (e: any) {
      setError(e.message || 'Could not list tasks');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!active || (active.status !== 'queued' && active.status !== 'executing' && active.status !== 'planning')) {
      return;
    }
    const id = window.setInterval(async () => {
      try {
        const latest = await api.getTask(active.task_id);
        setActive(latest);
        setTasks((prev) => prev.map((t) => (t.task_id === latest.task_id ? latest : t)));
      } catch {
        /* keep last known */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [active?.task_id, active?.status]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createTask(goal);
      const record = created as unknown as AutonomousTask;
      setActive(record);
      await load();
    } catch (e: any) {
      setError(e.message || 'Fleet task failed to start');
    } finally {
      setSubmitting(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 size={14} className="text-accent" />;
    if (status === 'failed' || status === 'denied') return <XCircle size={14} className="text-danger" />;
    return <Clock size={14} className="text-ink-secondary" />;
  };

  return (
    <div className="space-y-24">
      <div className="border-b border-surface-300 pb-16">
        <h1 className="font-display text-24 text-ink-primary">Durable fleet runtime</h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          Submit a goal. Google ADK sequences the gateway and memory specialists against this
          tenant's real Firestore data. Cloud Tasks runs the work as its own request on Cloud Run
          so CPU is actually allocated; if the queue is not yet bound, the same fleet runs inline
          in this request — still durable, still audited.
        </p>
        <PlainExplain>
          This is the long-running agent path. It does not pretend a background job finished if it
          did not. You get a task id, a status, the specialists that ran, and any grounded memories
          they cited.
        </PlainExplain>
      </div>

      <form onSubmit={handleRun} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-16">
        <label className="block text-11 font-mono text-ink-secondary">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          className="w-full bg-surface-200 border border-surface-400 rounded p-12 text-13 text-ink-primary font-prose outline-none focus:border-accent"
        />
        {error && <p className="text-13 text-accent font-prose">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !goal.trim()}
          className="flex items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-13 font-medium disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Run ADK fleet
        </button>
      </form>

      {active && (
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-16">
          <div className="flex items-center justify-between gap-12">
            <div className="flex items-center gap-8">
              {statusIcon(active.status)}
              <h2 className="text-15 text-ink-primary font-medium">{active.status}</h2>
            </div>
            <code className="text-11 font-mono text-ink-secondary">{active.task_id}</code>
          </div>
          {active.plan_summary && (
            <p className="text-13 font-prose text-ink-secondary">{active.plan_summary}</p>
          )}
          {active.final_result && (
            <p className="text-13 font-prose text-ink-primary whitespace-pre-wrap">{active.final_result}</p>
          )}
          {active.error && <p className="text-13 text-danger font-prose">{active.error}</p>}
          <ul className="space-y-8">
            {(active.steps || []).map((step) => (
              <li key={step.step_number} className="border border-surface-300 rounded-md p-12">
                <div className="flex items-center gap-8 text-12 font-mono text-ink-primary">
                  {statusIcon(step.status)}
                  <span>{step.assigned_specialist}</span>
                  <span className="text-ink-secondary">· {step.title}</span>
                </div>
                {step.output != null && (
                  <pre className="mt-8 text-11 font-mono text-ink-secondary whitespace-pre-wrap">
                    {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-12">
        <div className="flex items-center gap-8 text-ink-primary">
          <ShieldCheck size={16} className="text-accent" />
          <h2 className="text-15 font-medium">Recent tasks</h2>
        </div>
        {tasks.length === 0 && (
          <p className="text-13 text-ink-secondary font-prose">None yet in this tenant.</p>
        )}
        <ul className="space-y-8">
          {tasks.map((t) => (
            <li key={t.task_id}>
              <button
                type="button"
                onClick={() => setActive(t)}
                className="w-full text-left border border-surface-300 hover:border-ink-secondary rounded-md p-12 flex items-center justify-between gap-12"
              >
                <span className="text-13 text-ink-primary truncate">{t.goal}</span>
                <span className="text-11 font-mono text-ink-secondary shrink-0">{t.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
