import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Zap, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import { RecallLog } from '../types';

export const Feed: React.FC = () => {
  const [logs, setLogs] = useState<RecallLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const data = await api.getLogs();
      setLogs(data.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-24 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Recall Observability & Audit Log</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Append-only audit trail recording real execution latency, residency clearances, and cache hits.
          </p>
        </div>
        <div className="flex items-center gap-8 text-11 text-accent font-mono bg-surface-200 px-10 py-4 rounded-full border border-surface-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          AUDIT FEED ACTIVE
        </div>
      </div>

      <div className="flex-1 bg-surface-100 border border-surface-300 rounded-lg overflow-hidden flex flex-col">
        <div className="grid grid-cols-12 gap-12 p-14 border-b border-surface-300 bg-surface-200 text-11 font-mono text-ink-secondary uppercase tracking-wider shrink-0">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-3">Requester Atom</div>
          <div className="col-span-3">Topic</div>
          <div className="col-span-2">Residency & Status</div>
          <div className="col-span-2 text-right">Latency</div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-4">
          {loading && logs.length === 0 ? (
            <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-48 text-ink-secondary text-13 font-prose">No recall events recorded yet.</div>
          ) : (
            logs.map(log => (
              <div key={log.recall_id} className="grid grid-cols-12 gap-12 p-10 rounded hover:bg-surface-200 transition-colors items-center text-12 border border-transparent hover:border-surface-300">
                <div className="col-span-2 text-ink-secondary font-mono text-11">
                  {formatTime(log.timestamp)}
                </div>
                <div className="col-span-3 text-ink-primary font-mono truncate" title={log.atom_id}>
                  {log.atom_id}
                </div>
                <div className="col-span-3 text-ink-primary font-mono truncate" title={log.topic}>
                  {log.topic}
                </div>
                <div className="col-span-2 flex items-center gap-6">
                  {log.was_cached ? (
                    <span className="flex items-center gap-3 text-ink-primary text-10 font-mono bg-surface-400 px-6 py-1 rounded">
                      <Zap size={10} className="text-accent" /> Cached
                    </span>
                  ) : log.is_stale ? (
                    <span className="flex items-center gap-3 text-accent text-10 font-mono bg-accent/10 px-6 py-1 rounded">
                      <AlertTriangle size={10} /> Stale (+{log.staleness_overage_hours}h)
                    </span>
                  ) : (
                    <span className="flex items-center gap-3 text-ink-secondary text-10 font-mono">
                      <CheckCircle2 size={10} /> Fresh
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-right font-mono text-11 text-ink-secondary flex justify-end items-center gap-4">
                  <Clock size={11} />
                  {log.latency_ms}ms
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
