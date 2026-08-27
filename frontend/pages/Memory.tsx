import React, { useState, useEffect } from 'react';
import { Database, Search, Tag, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Memory as MemoryType } from '../types';

export const Memory: React.FC = () => {
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [erasing, setErasing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetchMemories = async () => {
      setLoading(true);
      try {
        const data = await api.getMemories(search);
        setMemories(data.items);
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

  const handleEraseSubjects = async (subjectIds: string[], memoryId: string) => {
    const uniqueSubjectIds = [...new Set(subjectIds)];
    if (uniqueSubjectIds.length === 0) return;

    const subjectList = uniqueSubjectIds.join(', ');
    if (!confirm(`Execute DSR Right-to-Erasure for all linked subjects (${subjectList})? This cascades to derived embeddings, recalls, tasks, and cached reshapes.`)) return;

    setErasing(memoryId);
    try {
      let deletedMemories = 0;
      let purgedCacheEntries = 0;
      let purgedRecallLogs = 0;
      let purgedTaskRecords = 0;

      for (const subjectId of uniqueSubjectIds) {
        const result = await api.deleteSubject(subjectId);
        if (!result.verification_passed) {
          throw new Error(`Verification failed for subject ${subjectId}`);
        }
        deletedMemories += result.deleted_memories_count;
        purgedCacheEntries += result.purged_cache_entries;
        purgedRecallLogs += result.purged_recall_logs;
        purgedTaskRecords += result.purged_task_records;
      }

      alert(
        `Erasure complete for ${uniqueSubjectIds.length} subject(s): ` +
        `${deletedMemories} memories, ${purgedCacheEntries} cache entries, ` +
        `${purgedRecallLogs} recall logs, and ${purgedTaskRecords} task records purged.`
      );
      const data = await api.getMemories(search);
      setMemories(data.items);
    } catch (e: any) {
      alert(`Erasure refused: ${e.message}`);
    } finally {
      setErasing(null);
    }
  };

  const handleDeleteMemory = async (memoryId: string, topic: string) => {
    if (!confirm(`Delete "${topic}" outright? This removes the record and its cache entries, but nothing else linked to a data subject — use Erase Subject for that.`)) return;
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
          <h1 className="font-display text-24 text-ink-primary">Tenant Memory Store</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Vector-indexed memories with dual PII redaction, subject linkage, and residency tagging.
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search size={15} className="absolute left-12 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <input 
            type="text"
            placeholder="KNN Vector search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-100 border border-surface-300 rounded-md py-8 pl-36 pr-12 text-13 text-ink-primary focus:border-accent outline-none font-ui"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : memories.length === 0 ? (
        <div className="text-center py-48 text-ink-secondary text-13 font-prose bg-surface-100 border border-surface-300 rounded-lg">
          {search ? `No memories match "${search}".` : 'No memories yet. Agents and teammates with memory.write access add them here.'}
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
                      <span>Version: v{memory.version}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  {memory.metadata.subject_ids && memory.metadata.subject_ids.length > 0 && (
                    <button
                      onClick={() => handleEraseSubjects(memory.metadata.subject_ids, memory.id)}
                      disabled={erasing === memory.id}
                      className="flex items-center gap-4 px-8 py-4 bg-surface-200 hover:bg-accent/20 text-ink-secondary hover:text-accent rounded text-10 font-mono transition-colors"
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
                    className="flex items-center gap-4 px-8 py-4 bg-surface-200 hover:bg-accent/20 text-ink-secondary hover:text-accent rounded text-10 font-mono transition-colors"
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
