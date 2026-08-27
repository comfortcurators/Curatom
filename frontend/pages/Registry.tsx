import React, { useState, useEffect } from 'react';
import { Check, Copy, Cpu, Key, Loader2, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { Atom } from '../types';

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
    try {
      await navigator.clipboard.writeText(rotatedKey.value);
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
      </div>

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
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
          <div className="w-full max-w-lg rounded-lg border border-surface-300 bg-surface-100 p-24 shadow-2xl">
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
