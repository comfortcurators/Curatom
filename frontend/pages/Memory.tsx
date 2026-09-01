import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Database, Search, Tag, Loader2, ShieldAlert, Trash2, Plus, Cpu } from 'lucide-react';
import { api } from '../api';
import { Memory as MemoryType } from '../types';
import { PlainExplain } from '../components/PlainExplain';

const REGIONS = ['SG', 'IN', 'EU', 'UK', 'US', 'AU', 'CN'];
const CLASSES = ['public', 'internal', 'confidential', 'restricted'];

export const Memory: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [erasing, setErasing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(searchParams.get('add') === '1');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [region, setRegion] = useState('SG');
  const [classification, setClassification] = useState('internal');
  const [subjectIds, setSubjectIds] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('add') === '1') setAddOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const fetchMemories = async () => {
      setLoading(true);
      try {
        const data = await api.getMemories(search);
        setMemories(data.items);
        if (!search && data.items.length === 0) setAddOpen(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    const debounce = setTimeout(() => {
      fetchMemories();
    }, 400);
    
    return () => clearTimeout(debounce);
  }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setSavedNote(null);
    try {
      const ids = subjectIds.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await api.createMemory({
        topic,
        content,
        region,
        classification,
        subject_ids: ids.length ? ids : undefined,
      });
      const redacted = res.pii_classes?.length ? ` · PII redacted: ${res.pii_classes.join(', ')}` : '';
      setSavedNote(`Saved ${res.id}${redacted}`);
      setTopic('');
      setContent('');
      setSubjectIds('');
      const data = await api.getMemories(search);
      setMemories(data.items);
    } catch (e: any) {
      setFormError(e.message || 'Could not write that memory.');
    } finally {
      setSaving(false);
    }
  };

  const handleEraseSubjects = async (subjectIdsToErase: string[], memoryId: string) => {
    const uniqueSubjectIds = [...new Set(subjectIdsToErase)];
    if (uniqueSubjectIds.length === 0) return;

    const subjectList = uniqueSubjectIds.join(', ');
    if (!confirm(`Execute DSR Right-to-Erasure for all linked subjects (${subjectList})? This cascades to derived embeddings, recalls, tasks, cached reshapes, and any anonymized training-corpus copies.`)) return;

    setErasing(memoryId);
    try {
      let deletedMemories = 0;
      let purgedCacheEntries = 0;
      let purgedRecallLogs = 0;
      let purgedTaskRecords = 0;
      let purgedCorpusEntries = 0;

      for (const subjectId of uniqueSubjectIds) {
        const result = await api.deleteSubject(subjectId);
        if (!result.verification_passed) {
          throw new Error(`Verification failed for subject ${subjectId}`);
        }
        deletedMemories += result.deleted_memories_count;
        purgedCacheEntries += result.purged_cache_entries;
        purgedRecallLogs += result.purged_recall_logs;
        purgedTaskRecords += result.purged_task_records;
        purgedCorpusEntries += result.purged_training_corpus_entries;
      }

      alert(
        `Erasure complete for ${uniqueSubjectIds.length} subject(s): ` +
        `${deletedMemories} memories, ${purgedCacheEntries} cache entries, ` +
        `${purgedRecallLogs} recall logs, ${purgedTaskRecords} task records, ` +
        `and ${purgedCorpusEntries} training-corpus entries purged.`
      );
      const data = await api.getMemories(search);
      setMemories(data.items);
    } catch (e: any) {
      alert(`Erasure refused: ${e.message}`);
    } finally {
      setErasing(null);
    }
  };

  const handleDeleteMemory = async (memoryId: string, memoryTopic: string) => {
    if (!confirm(`Delete "${memoryTopic}" outright? This removes the record and its cache entries, but nothing else linked to a data subject — use Erase Subject for that.`)) return;
    setDeleting(memoryId);
    try {
      await api.deleteMemory(memoryId);
      const data = await api.getMemories(search);
      setMemories(data.items);
    } catch (e: any) {
      alert(`Delete refused: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-24">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-16">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Memory Bank</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Vector-indexed memories with dual PII redaction, subject linkage, and residency tagging.
          </p>
          <PlainExplain>
            Every fact your AI agents have stored and can recall later — like a shared filing cabinet. Each record
            carries its own rules for who's allowed to read it: how sensitive it is, which region it's tagged to,
            and how long before it's considered too old to trust. Personal information is automatically stripped
            out before anything is stored.
          </PlainExplain>
        </div>
        <div className="flex items-center gap-8 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={15} className="absolute left-12 top-1/2 -translate-y-1/2 text-ink-secondary" />
            <input 
              type="text"
              placeholder="KNN Vector search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-100 border border-surface-300 rounded-md py-8 pl-36 pr-12 text-13 text-ink-primary focus:border-accent outline-none font-ui"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium shrink-0"
          >
            <Plus size={15} /> {addOpen ? 'Close' : 'Add memory'}
          </button>
        </div>
      </div>

      {addOpen && (
        <form onSubmit={handleCreate} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-16">
          <div>
            <h2 className="text-15 text-ink-primary font-medium">Write a grounded fact</h2>
            <p className="text-12 text-ink-secondary font-prose mt-4">
              Stored with a 768-d embedding, residency tag, and classification ceiling. PII is redacted before it lands.
            </p>
          </div>
          {formError && (
            <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">{formError}</div>
          )}
          {savedNote && (
            <div className="p-10 bg-surface-200 border border-surface-400 rounded text-12 text-ink-primary font-mono">{savedNote}</div>
          )}
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary outline-none focus:border-accent"
              placeholder="e.g. APAC booking ceiling Q3"
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-prose outline-none focus:border-accent"
              placeholder="A verifiable fact the fleet may cite. Personal names and emails are stripped automatically."
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Residency region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Classification</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Subject IDs (optional, comma-separated)</label>
            <input
              type="text"
              value={subjectIds}
              onChange={(e) => setSubjectIds(e.target.value)}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
              placeholder="sub_jane, sub_acme"
            />
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <button
              type="submit"
              disabled={saving || !topic.trim() || !content.trim()}
              className="flex items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-13 font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Save to Memory Bank
            </button>
            <Link
              to="/task-worker-status"
              className="flex items-center gap-8 px-16 py-10 border border-surface-400 hover:border-accent text-ink-secondary hover:text-accent rounded text-13 font-medium"
            >
              <Cpu size={14} /> Then run the fleet
            </Link>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : memories.length === 0 ? (
        <div className="text-center py-48 text-ink-secondary text-13 font-prose bg-surface-100 border border-surface-300 rounded-lg space-y-12">
          <p>{search ? `No memories match "${search}".` : 'No memories yet. Write one above — the fleet cannot cite what is not here.'}</p>
          {!addOpen && !search && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md text-13 font-medium"
            >
              <Plus size={15} /> Add a memory
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-16">
          {memories.map(memory => (
            <div key={memory.id} className="bg-surface-100 border border-surface-300 rounded-lg p-20 space-y-12">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-12">
                  <div className="p-8 bg-surface-200 rounded text-ink-secondary">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="text-14 font-medium text-ink-primary font-mono">{memory.topic}</h3>
                    <div className="text-11 text-ink-secondary mt-2 flex items-center gap-6">
                      <span>Residency: <strong className="text-accent">{memory.region}</strong></span>
                      <span>•</span>
                      <span>Class: {memory.classification}</span>
                      <span>•</span>
                      <span>Version: v{memory.version}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  {memory.metadata.subject_ids && memory.metadata.subject_ids.length > 0 && (
                    <button
                      onClick={() => handleEraseSubjects(memory.metadata.subject_ids, memory.id)}
                      disabled={erasing === memory.id}
                      className="flex items-center gap-4 px-8 py-4 bg-surface-200 hover:bg-danger-soft text-ink-secondary hover:text-danger rounded text-10 font-mono transition-colors"
                      title="Execute Right-to-Erasure for every linked subject"
                    >
                      <Trash2 size={12} /> Erase {memory.metadata.subject_ids.length > 1 ? 'All Subjects' : 'Subject'}
                    </button>
                  )}
                  <span className="px-8 py-3 bg-surface-200 text-ink-secondary text-10 rounded font-mono border border-surface-300">
                    {memory.id}
                  </span>
                  <button
                    onClick={() => handleDeleteMemory(memory.id, memory.topic)}
                    disabled={deleting === memory.id}
                    className="flex items-center gap-4 px-8 py-4 bg-surface-200 hover:bg-danger-soft text-ink-secondary hover:text-danger rounded text-10 font-mono transition-colors"
                    title="Delete this memory record outright"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
              
              <div className="bg-surface-200/60 rounded p-14 border border-surface-300 font-prose text-13 text-ink-primary leading-relaxed">
                {memory.content_redacted}
              </div>

              <div className="flex flex-wrap items-center gap-16 text-11 font-mono text-ink-secondary pt-6">
                <div className="flex items-center gap-6">
                  <Tag size={12} />
                  {memory.metadata.tags.map(tag => (
                    <span key={tag} className="px-6 py-1 bg-surface-300 rounded-sm text-10">{tag}</span>
                  ))}
                </div>
                {memory.metadata.pii_classes && memory.metadata.pii_classes.length > 0 && (
                  <div className="flex items-center gap-4 text-accent">
                    <ShieldAlert size={12} />
                    <span>Redacted Spans: {memory.metadata.pii_classes.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
