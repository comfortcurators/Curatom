import React, { useState, useEffect } from 'react';
import { BookOpen, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { DirectoryEntry, DirectoryStatus } from '../types';
import { PlainExplain } from '../components/PlainExplain';

export const Directory: React.FC = () => {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [status, setStatus] = useState<DirectoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dirData, statData] = await Promise.all([
        api.getDirectory(),
        api.getDirectoryStatus()
      ]);
      setEntries(dirData);
      setStatus(statData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      await api.ingestDirectory();
      await fetchData();
    } catch (e: any) {
      alert(`Ingestion error: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-24">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Model Documentation Directory</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Global third-party documentation excerpts ingested once and queried to ground adaptive reshaping.
          </p>
          <PlainExplain>
            A library of real documentation about the AI models your agents might use (Claude, GPT, Gemini, and
            others) — synced from the vendors themselves, not guessed. When you ask Curatom something about how a
            specific model works, it checks this library first instead of making something up. Shared across every
            account, not specific to your business.
          </PlainExplain>
        </div>
        <button
          onClick={handleIngest}
          disabled={ingesting || (status?.is_ingesting && !status?.is_stale)}
          className="flex items-center gap-8 px-14 py-7 bg-surface-200 hover:bg-surface-300 text-ink-secondary hover:text-ink-primary rounded-md border border-surface-400 transition-colors text-12 font-mono disabled:opacity-50"
        >
          {(ingesting || (status?.is_ingesting && !status?.is_stale)) ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {ingesting
            ? 'Ingesting...'
            : status?.is_ingesting
              ? (status.is_stale ? 'Retry (previous run stalled)' : 'Ingesting...')
              : 'Sync Directory'}
        </button>
      </div>

      {status?.is_ingesting && status.is_stale && (
        <div className="text-12 text-accent font-prose bg-surface-200 border border-surface-400 rounded-md p-12">
          The last ingestion run never finished — likely interrupted by a deploy — and has been sitting stuck for
          over 2 hours. It's safe to retry.
        </div>
      )}

      {status && (
        <div className="bg-surface-200 border border-surface-300 rounded-lg p-16 flex flex-wrap items-center justify-between text-11 font-mono text-ink-secondary gap-12">
          <div className="flex gap-20">
            <span>Models: <strong className="text-ink-primary">{status.total_models}</strong></span>
            <span>Excerpts: <strong className="text-ink-primary">{status.total_excerpts}</strong></span>
            <span>Cache Hit Rate: <strong className="text-accent">{status.cache_hit_rate_pct}%</strong></span>
          </div>
          <div>
            Last Run: {status.last_run ? new Date(status.last_run).toLocaleString() : 'Never'}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-48 text-ink-secondary text-13 font-prose bg-surface-100 border border-surface-300 rounded-lg">
          Nothing ingested yet. Sync Directory above, or wait for the next scheduled run.
        </div>
      ) : (
        <div className="space-y-20">
          {entries.map(entry => (
            <div key={entry.model_family} className="bg-surface-100 border border-surface-300 rounded-lg overflow-hidden">
              <div className="p-16 border-b border-surface-300 bg-surface-200/50 flex justify-between items-center">
                <div className="flex items-center gap-10">
                  <BookOpen size={18} className="text-accent" />
                  <h2 className="text-15 font-medium text-ink-primary font-display">{entry.model_family}</h2>
                </div>
                <span className="text-10 font-mono text-ink-secondary bg-surface-300 px-6 py-2 rounded">
                  Source: {entry.source}
                </span>
              </div>
              <div className="p-16 space-y-12">
                <p className="text-13 text-ink-secondary font-prose">{entry.summary || 'Summary not derived.'}</p>
                <div className="pt-8 border-t border-surface-300 text-11 font-mono space-y-4">
                  <span className="text-ink-secondary block">Grounded Vendor Documentation:</span>
                  <ul className="space-y-2">
                    {entry.sources.map((s, i) => (
                      <li key={i} className="flex items-center gap-6">
                        <ExternalLink size={11} className="text-accent" />
                        <a href={s.uri} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate">
                          {s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
