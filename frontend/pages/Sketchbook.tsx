import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, NotebookPen, Plus, Eye, Users } from 'lucide-react';
import { api } from '../api';
import { SketchbookEntry, SketchbookActivity } from '../types';

const formatDate = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const EntryCard: React.FC<{ entry: SketchbookEntry; showOwner?: boolean }> = ({ entry, showOwner }) => (
  <div className="bg-surface-100 border border-surface-300 rounded-lg p-16 space-y-8">
    <div className="flex items-center justify-between">
      <span className="text-14 text-ink-primary font-medium">{entry.topic}</span>
      <span className="text-11 text-ink-secondary font-mono">{formatDate(entry.created_at)}</span>
    </div>
    {showOwner && (
      <span className="text-11 font-mono text-accent bg-accent/10 px-6 py-1 rounded inline-block">{entry.owner_id}</span>
    )}
    <p className="text-13 text-ink-secondary font-prose leading-relaxed whitespace-pre-wrap">{entry.content}</p>
  </div>
);

export const Sketchbook: React.FC = () => {
  const [tab, setTab] = useState<'mine' | 'all' | 'feed'>('mine');
  const isOwner = localStorage.getItem('curatom_role') === 'Owner';

  const [mine, setMine] = useState<SketchbookEntry[]>([]);
  const [all, setAll] = useState<SketchbookEntry[]>([]);
  const [feed, setFeed] = useState<SketchbookActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'mine') {
        const res = await api.getOwnSketchbook();
        setMine(res.items);
      } else if (tab === 'all' && isOwner) {
        const res = await api.getAllSketchbooks();
        setAll(res.items);
      } else if (tab === 'feed') {
        const res = await api.getSketchbookFeed();
        setFeed(res.items);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load the sketchbook.');
    } finally {
      setLoading(false);
    }
  }, [tab, isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.writeSketchbook(topic, content);
      setTopic('');
      setContent('');
      await load();
    } catch (e: any) {
      alert(`Could not write to your sketchbook: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-24">
      <div>
        <h1 className="font-display text-24 text-ink-primary flex items-center gap-10">
          <NotebookPen size={22} className="text-accent" /> Sketchbooks
        </h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          Every key — yours or an agent's — gets its own notebook, free to write whatever it wants, no approval
          gate. Isolated from every other sketchbook except yours, which sees all of them. Every stroke is audited.
        </p>
      </div>

      <div className="flex gap-4 bg-surface-200 border border-surface-300 rounded-md p-4 w-fit">
        <button
          onClick={() => setTab('mine')}
          className={`flex items-center gap-6 px-12 py-6 rounded text-12 font-mono transition-colors ${
            tab === 'mine' ? 'bg-surface-400 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <NotebookPen size={13} /> Your Sketchbook
        </button>
        {isOwner && (
          <button
            onClick={() => setTab('all')}
            className={`flex items-center gap-6 px-12 py-6 rounded text-12 font-mono transition-colors ${
              tab === 'all' ? 'bg-surface-400 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Eye size={13} /> All Sketchbooks
          </button>
        )}
        <button
          onClick={() => setTab('feed')}
          className={`flex items-center gap-6 px-12 py-6 rounded text-12 font-mono transition-colors ${
            tab === 'feed' ? 'bg-surface-400 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <Users size={13} /> Activity Feed
        </button>
      </div>

      {tab === 'mine' && (
        <form onSubmit={handleSubmit} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 space-y-12">
          <input
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-prose outline-none focus:border-accent"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic"
            required
          />
          <textarea
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-prose outline-none focus:border-accent"
            style={{ minHeight: '4.5rem' }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write anything. It's yours."
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add entry
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
      ) : error ? (
        <div className="text-center py-32 text-danger text-13 font-prose">{error}</div>
      ) : tab === 'mine' ? (
        mine.length === 0 ? (
          <div className="text-center py-32 text-ink-secondary text-13 font-prose">Nothing written yet.</div>
        ) : (
          <div className="space-y-12">{mine.map((e) => <EntryCard key={e.id} entry={e} />)}</div>
        )
      ) : tab === 'all' ? (
        all.length === 0 ? (
          <div className="text-center py-32 text-ink-secondary text-13 font-prose">No sketchbook has anything in it yet.</div>
        ) : (
          <div className="space-y-12">{all.map((e) => <EntryCard key={e.id} entry={e} showOwner />)}</div>
        )
      ) : feed.length === 0 ? (
        <div className="text-center py-32 text-ink-secondary text-13 font-prose">No activity yet.</div>
      ) : (
        <div className="bg-surface-100 border border-surface-300 rounded-lg divide-y divide-surface-300">
          {feed.map((a, i) => (
            <div key={i} className="flex items-center justify-between p-14 text-13">
              <span className="text-ink-primary font-mono">{a.owner_id}</span>
              <span className="text-ink-secondary font-prose">{a.topic}</span>
              <span className="text-11 text-ink-secondary font-mono">{formatDate(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
