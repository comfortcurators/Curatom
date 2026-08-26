import React, { useState, useEffect } from 'react';
import { TerminalSquare, Play, Loader2, ArrowRight, Database, ShieldAlert, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import { Atom, Memory } from '../types';
import { COMPANY_NAME } from '../constants';

export const Playground: React.FC = () => {
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  
  const [selectedAtomId, setSelectedAtomId] = useState<string>('');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const role = localStorage.getItem('curatom_role');

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
      alert(`Recall error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFixture = async () => {
    setFixtureLoading(true);
    try {
      const res = await api.loadSyntheticFixture();
      alert(`Loaded ${res.loaded_records} synthetic Comfort Curators enterprise fixture records.`);
      await initData();
    } catch (e: any) {
      alert(`Fixture loading failed: ${e.message}`);
    } finally {
      setFixtureLoading(false);
    }
  };

  const runScenario = async (scenario: string) => {
    setLoading(true);
    setResult(null);
    try {
      if (scenario === 'cross_border_denial') {
        const cnMem = memories.find(m => m.region === 'CN') || memories[0];
        if (cnMem && selectedAtomId) {
          setQuery('Extract Mainland China passenger booking manifests for audit under PIPL data localization.');
          setSelectedMemoryId(cnMem.id);
          const res = await api.recall(selectedAtomId, cnMem.id, 'Extract China passenger booking records.');
          setResult(res);
        }
      } else if (scenario === 'cache_demonstration') {
        const mem = memories[0];
        if (mem && selectedAtomId) {
          setQuery('Summarize Comfort Curators architecture scale metrics and internal engine throughput.');
          setSelectedMemoryId(mem.id);
          await api.recall(selectedAtomId, mem.id, 'Summarize Comfort Curators architecture scale metrics.');
          const cachedRes = await api.recall(selectedAtomId, mem.id, 'Summarize Comfort Curators architecture scale metrics.');
          setResult(cachedRes);
        }
      } else if (scenario === 'flash_sale_surge') {
        const mem = memories.find(m => m.topic.includes('Architecture')) || memories[0];
        if (mem && selectedAtomId) {
          setQuery('Evaluate Helios dynamic pricing updates (2.8M/min) and Titan fraud scoring latency during 6.1M/day peak surge.');
          setSelectedMemoryId(mem.id);
          const res = await api.recall(selectedAtomId, mem.id, 'Evaluate Helios dynamic pricing updates and Titan fraud scoring latency.');
          setResult(res);
        }
      }
    } catch (e: any) {
      setResult({ error: e.message, residency_denied: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-16 border-b border-surface-300 pb-16">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Proving Ground & Stress Scenarios</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Execute adaptive recalls against the Comfort Curators enterprise fixture and verify cross-border residency enforcement.
          </p>
        </div>
        {role === 'Owner' && (
          <button
            onClick={handleLoadFixture}
            disabled={fixtureLoading}
            className="flex items-center gap-8 px-14 py-8 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded-md border border-surface-400 transition-colors text-11 font-mono disabled:opacity-50"
          >
            {fixtureLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-accent" />}
            Seed Synthetic Proving Ground Fixture
          </button>
        )}
      </div>

      {/* Mandatory Synthetic Notice */}
      <div className="bg-surface-200/60 border border-surface-400 rounded-lg p-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-12">
        <div className="flex items-center gap-8 text-11 font-mono text-accent">
          <ShieldAlert size={15} />
          <span>SYNTHETIC PROVING GROUND FIXTURE — NOT REAL COMPANY DATA</span>
        </div>
        <div className="flex flex-wrap gap-8">
          <button
            onClick={() => runScenario('cross_border_denial')}
            className="px-10 py-5 bg-surface-300 hover:bg-surface-400 text-ink-primary text-11 font-mono rounded border border-surface-400 transition-colors"
          >
            Scenario: Cross-Border Residency Refusal (PIPL)
          </button>
          <button
            onClick={() => runScenario('cache_demonstration')}
            className="px-10 py-5 bg-surface-300 hover:bg-surface-400 text-ink-primary text-11 font-mono rounded border border-surface-400 transition-colors"
          >
            Scenario: Cache Hit Latency Delta
          </button>
          <button
            onClick={() => runScenario('flash_sale_surge')}
            className="px-10 py-5 bg-surface-300 hover:bg-surface-400 text-ink-primary text-11 font-mono rounded border border-surface-400 transition-colors"
          >
            Scenario: Flash Sale 6.1M Peak Surge
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
        <div className="lg:col-span-1 space-y-16 bg-surface-100 border border-surface-300 rounded-lg p-20">
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Requester Atom</label>
            <select 
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-mono"
              value={selectedAtomId}
              onChange={e => setSelectedAtomId(e.target.value)}
            >
              {atoms.map(a => <option key={a.id} value={a.id}>{a.name} ({a.model_family})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Target Memory Record</label>
            <select 
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none font-mono"
              value={selectedMemoryId}
              onChange={e => setSelectedMemoryId(e.target.value)}
            >
              {memories.map(m => <option key={m.id} value={m.id}>[{m.region}] {m.topic}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Recall Context Query</label>
            <textarea 
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none h-28 font-prose"
              value={query}
              onChange={e => setQuery(e.target.value)}
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

        <div className="lg:col-span-2 bg-surface-100 border border-surface-300 rounded-lg p-20 flex flex-col">
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
              Execute a recall to inspect adaptive memory reshaping or run a compliance stress test.
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
                <div className="bg-surface-200 border border-accent/40 rounded p-16 space-y-6 text-12 font-mono text-accent">
                  <div className="flex items-center gap-6 font-medium">
                    <XCircle size={16} /> DATA RESIDENCY VIOLATION
                  </div>
                  <p className="font-prose text-ink-primary">{result.error}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 flex-1">
                  <div className="flex flex-col">
                    <div className="text-11 font-mono text-ink-secondary mb-6 flex items-center gap-4">
                      <Database size={12}/> Redacted Memory Record
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
    </div>
  );
};
