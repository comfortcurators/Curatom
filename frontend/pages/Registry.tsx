import React, { useState, useEffect } from 'react';
import { Check, Copy, Cpu, Key, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { Atom } from '../types';
import { RegisterAtomForm } from '../components/RegisterAtomForm';

// Mirrors the backend's real state machine (main.py's transition_atom
// `legal` map). Only 'active' <-> 'quarantined' had buttons before - an
// atom transitioned to 'draining' or 'suspended' had no button anywhere
// to move it again, even though the backend fully supports recovering
// from both. Label is what the button does, not the state it leads to.
const LEGAL_TRANSITIONS: Record<string, { transition: string; label: string }[]> = {
  provisioning: [{ transition: 'activate', label: 'Activate' }, { transition: 'retire', label: 'Retire' }],
  active: [
    { transition: 'suspend', label: 'Suspend' },
    { transition: 'quarantine', label: 'Quarantine' },
    { transition: 'drain', label: 'Drain' },
    { transition: 'retire', label: 'Retire' },
  ],
  suspended: [{ transition: 'activate', label: 'Reactivate' }, { transition: 'quarantine', label: 'Quarantine' }, { transition: 'retire', label: 'Retire' }],
  quarantined: [{ transition: 'activate', label: 'Unquarantine' }, { transition: 'retire', label: 'Retire' }],
  draining: [{ transition: 'activate', label: 'Reactivate' }, { transition: 'retire', label: 'Retire' }],
  retired: [],
};

export const Registry: React.FC = () => {
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<{
    atomId: string;
    value: string;
    gracePeriodHours: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const fetchAtoms = async () => {
    try {
      const data = await api.getAtoms();
      setAtoms(data.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAtoms();
  }, []);

  const handleRotateKey = async (atomId: string) => {
    setActionLoading(atomId);
    try {
      const res = await api.rotateKey(atomId);
      setRotatedKey({
        atomId,
        value: res.api_key,
        gracePeriodHours: res.grace_period_hours,
      });
      setCopied(false);
      await fetchAtoms();
    } catch (e: any) {
      alert(`Key rotation refused: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyKey = async () => {
    if (!rotatedKey) return;
    // Same credential-file shape as connect time (RegisterAtomForm) - a
    // JSON block with every field an agent needs, not just the bare key.
    const atom = atoms.find((a) => a.id === rotatedKey.atomId);
    const credentialJson = JSON.stringify(
      {
        type: 'curatom_atom_key',
        atom_id: rotatedKey.atomId,
        name: atom?.name,
        endpoint: `${window.location.origin}/context`,
        method: 'GET',
        header: 'X-Atom-Key',
        key: rotatedKey.value,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(credentialJson);
      setCopied(true);
    } catch {
      alert('Clipboard access was denied. Copy the key from a secure browser context.');
    }
  };

  const closeKeyDialog = () => {
    setRotatedKey(null);
    setCopied(false);
  };

  const maskedKey = rotatedKey
    ? `${rotatedKey.value.slice(0, 12)}${'•'.repeat(20)}${rotatedKey.value.slice(-4)}`
    : '';

  const handleTransition = async (atomId: string, transition: string) => {
    setActionLoading(atomId);
    try {
      await api.transitionAtom(atomId, transition, 'Operator manual state transition');
      await fetchAtoms();
    } catch (e: any) {
      alert(`State transition error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
      <div className="space-y-24">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-24 text-ink-primary">Atom Registry</h1>
          <p className="text-13 text-ink-secondary mt-4 font-prose">
            Fleet agents with per-atom profiles, residency boundaries, and verified cryptographic credentials.
          </p>
        </div>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium shrink-0"
        >
          <Plus size={15} /> {addOpen ? 'Close' : 'Add key'}
        </button>
      </div>

      {addOpen && (
        <RegisterAtomForm title="Add another agent key" onConnected={fetchAtoms} />
      )}

      {!loading && atoms.length > 0 && <UsageByModelFamily atoms={atoms} />}

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : atoms.length === 0 ? (
        <div className="text-center py-48 text-ink-secondary text-13 font-prose bg-surface-100 border border-surface-300 rounded-lg">
          No agents connected yet. Connect one from the Overview page.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-20">
          {atoms.map(atom => (
            <div key={atom.id} className="bg-surface-100 border border-surface-300 rounded-lg p-20 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-12">
                  <div className="flex items-center gap-12">
                    <div className="p-8 bg-surface-300 rounded text-accent">
                      <Cpu size={18} />
                    </div>
                    <div>
                      <h3 className="text-14 font-medium text-ink-primary">{atom.name}</h3>
                      <div className="text-11 text-ink-secondary font-mono mt-2">{atom.id}</div>
                    </div>
                  </div>
                  <span className={`px-8 py-3 text-10 rounded font-mono uppercase ${
                    atom.status === 'active' ? 'bg-surface-300 text-accent border border-accent/40' :
                    atom.status === 'quarantined' ? 'bg-accent/20 text-accent' : 'bg-surface-400 text-ink-secondary'
                  }`}>
                    {atom.status}
                  </span>
                </div>
                
                <p className="text-13 text-ink-secondary mb-16 font-prose leading-relaxed">
                  {atom.description}
                </p>

                <div className="space-y-8 border-t border-surface-300 pt-12 text-12 font-mono">
                  <div className="flex justify-between">
                    <span className="text-ink-secondary">Model Family:</span>
                    <span className="text-ink-primary">{atom.model_family}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-secondary">Retention Window:</span>
                    <span className="text-ink-primary">{atom.profile.retention_window_hours}h</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-secondary">Permitted Regions:</span>
                    <div className="flex gap-4">
                      {atom.profile.permitted_regions.map(r => (
                        <span key={r} className="text-10 px-4 py-1 bg-surface-300 rounded text-accent">{r}</span>
                      ))}
                    </div>
                  </div>
                  <ActivityRow lastSeen={atom.last_seen} activity={atom.activity} />
                </div>
              </div>

              <div className="mt-16 pt-12 border-t border-surface-300 flex justify-between items-center">
                <button
                  onClick={() => handleRotateKey(atom.id)}
                  disabled={actionLoading === atom.id || atom.status !== 'active'}
                  className="flex items-center gap-6 px-10 py-5 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded text-11 font-mono transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={12} /> Rotate Key
                </button>
                <div className="flex gap-6">
                  {(LEGAL_TRANSITIONS[atom.status] || []).map(({ transition, label }) => (
                    <button
                      key={transition}
                      onClick={() => handleTransition(atom.id, transition)}
                      disabled={actionLoading === atom.id}
                      className="px-8 py-4 bg-surface-300 hover:bg-accent/20 text-ink-secondary hover:text-accent rounded text-10 font-mono transition-colors disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {rotatedKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-20 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rotated-key-title"
        >
          <div className="glass w-full max-w-lg rounded-lg p-24">
            <div className="flex items-start justify-between gap-16">
              <div className="flex items-center gap-10">
                <div className="rounded bg-surface-300 p-8 text-accent">
                  <Key size={18} />
                </div>
                <div>
                  <h2 id="rotated-key-title" className="font-display text-18 text-ink-primary">
                    New atom key issued
                  </h2>
                  <p className="mt-2 text-11 font-mono text-ink-secondary">
                    {rotatedKey.atomId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeKeyDialog}
                className="rounded p-6 text-ink-secondary hover:bg-surface-300 hover:text-ink-primary"
                aria-label="Close key dialog"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-20 text-13 leading-relaxed text-ink-secondary">
              The full key is kept in memory only for this dialog and will not be shown again.
              Store it in an approved secret manager before closing.
            </p>

            <div className="mt-16 break-all rounded border border-surface-300 bg-surface-200 p-14 font-mono text-12 text-ink-primary">
              {maskedKey}
            </div>

            <p className="mt-10 text-11 font-mono text-ink-secondary">
              Previous key grace period: {rotatedKey.gracePeriodHours} hours
            </p>

            <div className="mt-20 flex justify-end gap-8">
              <button
                type="button"
                onClick={closeKeyDialog}
                className="rounded bg-surface-200 px-12 py-7 text-12 text-ink-secondary hover:bg-surface-300"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopyKey}
                className="flex items-center gap-6 rounded bg-accent px-12 py-7 text-12 font-medium text-canvas"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy full key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Grouped from what /atoms already returns per key - no separate endpoint,
// no invented cost or accuracy figures (Curatom doesn't meter token cost or
// measure accuracy, so a real ROI number can't exist yet). This is real
// usage volume by model family, computed client-side from the same
// recency-window activity data the per-key rows already show.
const UsageByModelFamily: React.FC<{ atoms: Atom[] }> = ({ atoms }) => {
  const byFamily = new Map<string, { agents: number; calls: number; lastCallAt: string | null }>();
  for (const atom of atoms) {
    const family = atom.model_family || 'Other';
    const bucket = byFamily.get(family) || { agents: 0, calls: 0, lastCallAt: null };
    bucket.agents += 1;
    bucket.calls += atom.activity?.calls_in_window ?? 0;
    const candidate = atom.activity?.last_call_at || atom.last_seen;
    if (candidate && (!bucket.lastCallAt || new Date(candidate) > new Date(bucket.lastCallAt))) {
      bucket.lastCallAt = candidate;
    }
    byFamily.set(family, bucket);
  }
  const rows = Array.from(byFamily.entries()).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <div className="bg-surface-100 border border-surface-300 rounded-lg p-20">
      <h2 className="text-13 font-medium text-ink-primary mb-4">Usage by model family</h2>
      <p className="text-11 text-ink-secondary font-prose mb-16">
        Real call volume from your connected keys, grouped by the model family each was registered with — not a cost
        or accuracy estimate, since Curatom doesn't meter either yet.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-12">
          <thead>
            <tr className="text-left text-11 font-mono text-ink-secondary uppercase tracking-wider border-b border-surface-300">
              <th className="pb-8 pr-16">Model family</th>
              <th className="pb-8 pr-16">Agents</th>
              <th className="pb-8 pr-16">Recent calls</th>
              <th className="pb-8">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([family, stats]) => (
              <tr key={family} className="border-b border-surface-300/60 last:border-0">
                <td className="py-8 pr-16 text-ink-primary font-medium">{family}</td>
                <td className="py-8 pr-16 text-ink-secondary font-mono">{stats.agents}</td>
                <td className="py-8 pr-16 text-ink-secondary font-mono">{stats.calls}</td>
                <td className="py-8 text-ink-secondary font-mono">
                  {stats.lastCallAt ? new Date(stats.lastCallAt).toLocaleDateString() : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const IDLE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Which key is expensive/idle was previously invisible - agent count and a
// last_seen that never updated were all the Registry had. Activity is a
// recency-window aggregate (see backend get_atom_activity), not a lifetime
// count - said honestly rather than implying more precision than it has.
const ActivityRow: React.FC<{ lastSeen: string; activity?: { calls_in_window: number; last_call_at: string | null } }> = ({
  lastSeen,
  activity,
}) => {
  const lastActiveAt = activity?.last_call_at || lastSeen;
  const lastActiveMs = lastActiveAt ? new Date(lastActiveAt).getTime() : NaN;
  const isIdle = !Number.isNaN(lastActiveMs) && Date.now() - lastActiveMs > IDLE_THRESHOLD_MS;
  const relativeLabel = Number.isNaN(lastActiveMs)
    ? 'never called'
    : (() => {
        const days = Math.floor((Date.now() - lastActiveMs) / (24 * 60 * 60 * 1000));
        if (days <= 0) return 'active today';
        if (days === 1) return 'active 1 day ago';
        return `active ${days} days ago`;
      })();

  return (
    <div className="flex justify-between items-center">
      <span className="text-ink-secondary">Activity:</span>
      <span className={`text-10 px-6 py-2 rounded font-mono ${isIdle ? 'bg-accent/20 text-accent' : 'bg-surface-300 text-ink-primary'}`}>
        {activity ? `${activity.calls_in_window} recent calls · ` : ''}
        {relativeLabel}
        {isIdle ? ' · idle' : ''}
      </span>
    </div>
  );
};
