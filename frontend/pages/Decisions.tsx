import React, { useState, useEffect } from 'react';
import { Loader2, ScrollText, Plus, CheckCircle2, XCircle, MinusCircle, Circle } from 'lucide-react';
import { api } from '../api';
import { Decision } from '../types';

const OUTCOME_META: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  positive: { icon: CheckCircle2, className: 'text-accent', label: 'Held up' },
  negative: { icon: XCircle, className: 'text-accent', label: 'Regressed' },
  neutral: { icon: MinusCircle, className: 'text-ink-secondary', label: 'Mixed / neutral' },
};

const formatDate = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export const Decisions: React.FC = () => {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [claim, setClaim] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [saving, setSaving] = useState(false);

  const [outcomeDraft, setOutcomeDraft] = useState<Record<string, { summary: string; result: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listDecisions();
      setDecisions(res.items);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load the decision log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createDecision({ claim, decision: decisionText, reasoning: reasoning || undefined });
      setClaim('');
      setDecisionText('');
      setReasoning('');
      setShowForm(false);
      await load();
    } catch (e: any) {
      alert(`Could not record that: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordOutcome = async (id: string) => {
    const draft = outcomeDraft[id];
    if (!draft?.summary || !draft?.result) return;
    try {
      await api.recordDecisionOutcome(id, { outcome_summary: draft.summary, outcome_result: draft.result });
      await load();
    } catch (e: any) {
      alert(`Could not record the outcome: ${e.message}`);
    }
  };

  return (
    <div className="space-y-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-16 border-b border-surface-300 pb-16">
        <div>
          <h1 className="font-display text-24 text-ink-primary flex items-center gap-10">
            <ScrollText size={20} className="text-accent" /> Decision Log
          </h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Every claim-backed choice, and what actually happened afterward — so the next similar choice weighs this
            company's own track record, not just whatever a model or vendor claims about itself.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-8 px-14 py-8 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded-md border border-surface-400 transition-colors text-12 shrink-0 self-start"
        >
          <Plus size={14} /> Record a decision
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 space-y-14">
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">What was claimed</label>
            <textarea
              className="w-full bg-surface-200 border border-surface-400 rounded p-10 text-13 text-ink-primary focus:border-accent outline-none h-20 font-prose"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="e.g. Claude said Sonnet 5 can do 20 minutes of work for the same usage as 2 minutes of Fable 5."
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">What was decided</label>
            <textarea
              className="w-full bg-surface-200 border border-surface-400 rounded p-10 text-13 text-ink-primary focus:border-accent outline-none h-16 font-prose"
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              placeholder="e.g. Switched the nightly batch job to Sonnet 5."
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Reasoning (optional)</label>
            <textarea
              className="w-full bg-surface-200 border border-surface-400 rounded p-10 text-13 text-ink-primary focus:border-accent outline-none h-16 font-prose"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Anything else worth remembering about why."
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : error ? (
        <div className="text-center py-48 text-accent text-13 font-prose">{error}</div>
      ) : decisions.length === 0 ? (
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-32 text-center text-13 text-ink-secondary font-prose">
          No decisions recorded yet. Record one whenever a model or vendor's claim shapes a real choice — the value
          is in tying it to what actually happens afterward.
        </div>
      ) : (
        <div className="space-y-12">
          {decisions.map((d) => {
            const meta = d.outcome_result ? OUTCOME_META[d.outcome_result] : null;
            const draft = outcomeDraft[d.id] || { summary: '', result: '' };
            return (
              <div key={d.id} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-18 space-y-10">
                <div className="flex justify-between items-start gap-12">
                  <div>
                    <div className="text-11 font-mono text-ink-secondary uppercase tracking-wider mb-2">Claim</div>
                    <div className="text-13 text-ink-primary font-prose">{d.claim}</div>
                  </div>
                  <div className="text-10 font-mono text-ink-secondary shrink-0 text-right">
                    {formatDate(d.recorded_at)}
                    <br />by {d.recorded_by}
                  </div>
                </div>
                <div>
                  <div className="text-11 font-mono text-ink-secondary uppercase tracking-wider mb-2">Decision</div>
                  <div className="text-13 text-ink-primary font-prose">{d.decision}</div>
                </div>
                {d.reasoning && (
                  <div>
                    <div className="text-11 font-mono text-ink-secondary uppercase tracking-wider mb-2">Reasoning</div>
                    <div className="text-12 text-ink-secondary font-prose">{d.reasoning}</div>
                  </div>
                )}

                {d.outcome_result ? (
                  <div className="flex items-start gap-8 bg-surface-200 border border-surface-400 rounded-md p-12">
                    {meta && <meta.icon size={16} className={`${meta.className} shrink-0 mt-1`} />}
                    <div>
                      <div className="text-12 text-ink-primary font-medium">{meta?.label || d.outcome_result}</div>
                      <div className="text-12 text-ink-secondary font-prose mt-2">{d.outcome_summary}</div>
                      <div className="text-10 font-mono text-ink-secondary mt-4">
                        {d.outcome_recorded_at && formatDate(d.outcome_recorded_at)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-surface-300 pt-10 space-y-8">
                    <div className="text-11 font-mono text-ink-secondary flex items-center gap-6">
                      <Circle size={10} /> No outcome recorded yet
                    </div>
                    <div className="flex flex-col sm:flex-row gap-8">
                      <select
                        className="bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-mono"
                        value={draft.result}
                        onChange={(e) => setOutcomeDraft((s) => ({ ...s, [d.id]: { ...draft, result: e.target.value } }))}
                      >
                        <option value="">What happened?</option>
                        <option value="positive">Held up</option>
                        <option value="negative">Regressed</option>
                        <option value="neutral">Mixed / neutral</option>
                      </select>
                      <input
                        className="flex-1 bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-prose"
                        placeholder="Briefly, what actually happened"
                        value={draft.summary}
                        onChange={(e) => setOutcomeDraft((s) => ({ ...s, [d.id]: { ...draft, summary: e.target.value } }))}
                      />
                      <button
                        onClick={() => handleRecordOutcome(d.id)}
                        disabled={!draft.summary || !draft.result}
                        className="px-12 py-8 bg-surface-300 hover:bg-surface-400 text-ink-primary text-12 rounded border border-surface-400 transition-colors disabled:opacity-40 shrink-0"
                      >
                        Record
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
