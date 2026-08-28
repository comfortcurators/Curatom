import React, { useState, useEffect } from 'react';
import { TerminalSquare, Play, Loader2, Database, XCircle } from 'lucide-react';
import { api } from '../api';
import { Atom, Memory } from '../types';

export const Playground: React.FC = () => {
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

  const [selectedAtomId, setSelectedAtomId] = useState<string>('');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string>('');
  const [query, setQuery] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const initData = async () => {
    try {
      const [a, m] = await Promise.all([api.getAtoms(), api.getMemories()]);
      setAtoms(a.items);
      setMemories(m.items);
      if (a.items.length > 0 && !selectedAtomId) setSelectedAtomId(a.items[0].id);
      if (m.items.length > 0 && !selectedMemoryId) setSelectedMemoryId(m.items[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    initData();
  }, []);

  const handleRecall = async () => {
    if (!selectedAtomId || !selectedMemoryId || !query) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await api.recall(selectedAtomId, selectedMemoryId, query);
      setResult(res);
    } catch (e: any) {
      // A policy refusal throws a real HTTP 403 - it never reaches this
      // page as {error: ...} in a 200 body, so the styled violation panel
      // below was dead code until this routed it here instead of an alert.
      // Found live: classification_denied (an atom's classification
      // ceiling too low for the memory) hit this same catch block but the
      // regex only matched "residency", so an equally real ABAC refusal
      // fell through to a jarring native alert() instead of the panel
      // this page exists to demonstrate.
      if (/residency|classification/i.test(e.message || '')) {
        setResult({ error: e.message });
      } else {
        alert(`Recall error: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-24">
      <div className="border-b border-surface-300 pb-16">
        <h1 className="font-display text-24 text-ink-primary">Proving Ground</h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          Execute a real recall against an agent and a memory record you've actually created — the Atom Registry and
          Memory Bank sections create those. There's no seeded demo data here anymore.
        </p>
      </div>

      {atoms.length === 0 || memories.length === 0 ? (
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-32 text-center text-13 text-ink-secondary font-prose">
          {atoms.length === 0 && memories.length === 0 && "You don't have any agents or memory records yet. "}
          {atoms.length === 0 && memories.length > 0 && "You don't have any agents registered yet. "}
          {atoms.length > 0 && memories.length === 0 && "You don't have any memory records yet. "}
          Create them under Atom Registry and Memory Bank first, then come back here to test a recall.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
          <div className="lg:col-span-1 space-y-16 bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20">
            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Requester Atom</label>
              <select
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-mono"
                value={selectedAtomId}
                onChange={(e) => setSelectedAtomId(e.target.value)}
              >
                {atoms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model_family})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Target Memory Record</label>
              <select
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-mono"
                value={selectedMemoryId}
                onChange={(e) => setSelectedMemoryId(e.target.value)}
              >
                {memories.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.region}] {m.topic}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Recall Context Query</label>
              <textarea
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none h-28 font-prose"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Extract peak booking throughput and multi-cloud topology specifications."
              />
            </div>

            <button
              onClick={handleRecall}
              disabled={loading || !query || !selectedAtomId || !selectedMemoryId}
              className="w-full flex justify-center items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50 mt-8"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              Execute Recall
            </button>
          </div>

          <div className="lg:col-span-2 bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 flex flex-col">
            <div className="flex justify-between items-center mb-16">
              <h2 className="text-11 text-ink-secondary uppercase tracking-wider font-mono flex items-center gap-8">
                <TerminalSquare size={14} className="text-accent" /> Side-by-Side Output & Grounding
              </h2>
              {result && !result.error && (
                <span className="text-11 font-mono text-ink-secondary">
                  Latency: <strong className="text-ink-primary">{result.latency_ms}ms</strong> {result.was_cached && '(CACHED)'}
                </span>
              )}
            </div>

            {!result && !loading && (
              <div className="flex-1 flex items-center justify-center text-ink-secondary text-13 font-prose border border-dashed border-surface-400 rounded-md p-32 text-center">
                Execute a recall to inspect adaptive memory reshaping or a residency refusal.
              </div>
            )}

            {loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-ink-secondary space-y-16 border border-dashed border-surface-400 rounded-md p-32">
                <Loader2 className="animate-spin text-accent" size={28} />
                <div className="text-12 font-mono animate-pulse">Evaluating ABAC policy & retrieving embeddings...</div>
              </div>
            )}

            {result && !loading && (
              <div className="flex-1 flex flex-col space-y-16">
                {result.error ? (
                  <div className="bg-danger-soft border border-danger-border rounded p-16 space-y-6 text-12 font-mono text-danger">
                    <div className="flex items-center gap-6 font-medium">
                      <XCircle size={16} />
                      {/residency/i.test(result.error) ? 'DATA RESIDENCY VIOLATION' : 'CLASSIFICATION CEILING VIOLATION'}
                    </div>
                    <p className="font-prose text-ink-primary">{result.error}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16 flex-1">
                    <div className="flex flex-col">
                      <div className="text-11 font-mono text-ink-secondary mb-6 flex items-center gap-4">
                        <Database size={12} /> Redacted Memory Record
                      </div>
                      <div className="flex-1 bg-surface-200 border border-surface-400 rounded p-14 overflow-y-auto font-prose text-13 text-ink-secondary leading-relaxed">
                        {result.raw_memory}
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="text-11 font-mono text-accent mb-6 flex justify-between items-center">
                        <span>Target Atom Reshaped Output</span>
                        {result.is_stale && (
                          <span className="bg-accent/20 px-6 py-1 rounded text-10">STALE (+{result.staleness_hours}h)</span>
                        )}
                      </div>
                      <div className="flex-1 bg-surface-200 border border-accent/30 rounded p-14 overflow-y-auto font-mono text-12 text-ink-primary whitespace-pre-wrap leading-relaxed">
                        {result.response}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
