import React, { useState, useEffect } from 'react';
import { ShieldCheck, Play, Loader2, CheckCircle2, XCircle, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { PolicyRule, PolicySimulationResult } from '../types';
import { PlainExplain } from '../components/PlainExplain';

export const Policies: React.FC = () => {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEffect, setNewEffect] = useState<'allow' | 'deny'>('deny');
  const [newActions, setNewActions] = useState('');
  const [newPrincipals, setNewPrincipals] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Simulator state
  const [simPrincipal, setSimPrincipal] = useState('Technical Reviewer');
  const [simAction, setSimAction] = useState('atom.create');
  const [simResource, setSimResource] = useState('atoms/atom_apac_01');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<PolicySimulationResult | null>(null);

  const fetchPolicies = async () => {
    try {
      const data = await api.getPolicies();
      setPolicies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPolicy({
        name: newName,
        effect: newEffect,
        actions: newActions.split(',').map((a) => a.trim()).filter(Boolean),
        principals: newPrincipals.split(',').map((p) => p.trim()).filter(Boolean),
      });
      setNewName('');
      setNewEffect('deny');
      setNewActions('');
      setNewPrincipals('');
      setShowForm(false);
      await fetchPolicies();
    } catch (e: any) {
      alert(`Could not add that policy: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    if (!confirm('Remove this policy? Anything it was denying or allowing falls back to the baseline rules.')) return;
    setDeletingId(policyId);
    try {
      await api.deletePolicy(policyId);
      await fetchPolicies();
    } catch (e: any) {
      alert(`Could not remove that policy: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await api.simulatePolicy(simPrincipal, simAction, simResource);
      setSimResult(res);
    } catch (e: any) {
      alert(`Simulation error: ${e.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-24">
      <div>
        <h1 className="font-display text-24 text-ink-primary">Policy Engine & Permission Simulator</h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          ABAC rules evaluated on every operation. Default is Deny. Deny rules take strict precedence.
        </p>
        <PlainExplain>
          These are the rules for who — a person or an AI agent — is allowed to do what. Nothing is allowed by
          default; something only works if a rule explicitly permits it, and a "deny" rule always wins over an
          "allow" one, even a more specific one. The simulator below lets you test "what would happen if" before
          it happens for real, and you can add your own custom rules (e.g. "never let this agent delete anything").
        </PlainExplain>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
        {/* Simulator */}
        <div className="lg:col-span-1 bg-surface-100 border border-surface-300 rounded-lg p-20 space-y-16">
          <h2 className="text-13 font-mono text-ink-primary flex items-center gap-8 uppercase tracking-wider">
            <Play size={14} className="text-accent" /> Policy Simulator (Dry-Run)
          </h2>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Principal Role / Identity</label>
            <select 
              value={simPrincipal}
              onChange={e => setSimPrincipal(e.target.value)}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
            >
              <option value="Owner">Owner</option>
              <option value="Tech Lead">Tech Lead</option>
              <option value="Software Designer">Software Designer</option>
              <option value="Technical Reviewer">Technical Reviewer</option>
              <option value="Auditor">Auditor</option>
            </select>
          </div>

          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Action Verb</label>
            <select 
              value={simAction}
              onChange={e => setSimAction(e.target.value)}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
            >
              <option value="atom.create">atom.create</option>
              <option value="atom.retire">atom.retire</option>
              <option value="memory.write">memory.write</option>
              <option value="recall.execute">recall.execute</option>
              <option value="subject.erase">subject.erase</option>
              <option value="directory.ingest">directory.ingest</option>
            </select>
          </div>

          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Target Resource Path</label>
            <input 
              type="text" 
              value={simResource}
              onChange={e => setSimResource(e.target.value)}
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
            />
          </div>

          <button
            onClick={handleSimulate}
            disabled={simLoading}
            className="w-full flex items-center justify-center gap-8 px-16 py-10 bg-surface-300 hover:bg-surface-400 text-ink-primary rounded text-12 font-mono transition-colors disabled:opacity-40"
          >
            {simLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Evaluate Dry-Run
          </button>

          {simResult && (
            <div className={`p-16 rounded border text-12 font-mono space-y-6 ${
              simResult.allowed 
                ? 'bg-surface-200 border-accent/40 text-ink-primary' 
                : 'bg-surface-200 border-accent/20 text-accent'
            }`}>
              <div className="flex items-center gap-6 font-medium">
                {simResult.allowed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>{simResult.allowed ? 'ACTION PERMITTED' : 'ACTION DENIED'}</span>
              </div>
              <p className="text-11 text-ink-secondary font-prose">{simResult.reason}</p>
              {simResult.deciding_policy_id && (
                <div className="text-10 text-ink-secondary">Deciding Policy: {simResult.deciding_policy_id}</div>
              )}
            </div>
          )}
        </div>

        {/* Rules Table */}
        <div className="lg:col-span-2 space-y-16">
          <div className="flex items-center justify-between">
            <h2 className="text-13 font-mono text-ink-secondary uppercase tracking-wider">Active Policies</h2>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-6 px-10 py-5 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded text-11 font-mono transition-colors"
            >
              <Plus size={12} /> {showForm ? 'Close' : 'Add policy'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreatePolicy} className="bg-surface-100 border border-surface-300 rounded-lg p-16 space-y-12">
              <div>
                <label className="block text-11 font-mono text-ink-secondary mb-6">Name</label>
                <input
                  className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-prose"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Block auditors from key rotation"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Effect</label>
                  <select
                    className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
                    value={newEffect}
                    onChange={(e) => setNewEffect(e.target.value as 'allow' | 'deny')}
                  >
                    <option value="deny">deny</option>
                    <option value="allow">allow</option>
                  </select>
                </div>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Actions (comma-separated)</label>
                  <input
                    className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
                    value={newActions}
                    onChange={(e) => setNewActions(e.target.value)}
                    placeholder="key.rotate, atom.create"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-11 font-mono text-ink-secondary mb-6">Principals (comma-separated role names, principal ids, or *)</label>
                <input
                  className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary font-mono outline-none"
                  value={newPrincipals}
                  onChange={(e) => setNewPrincipals(e.target.value)}
                  placeholder="Auditor"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Save policy
              </button>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-48 text-ink-secondary"><Loader2 className="animate-spin" size={24} /></div>
          ) : policies.length === 0 ? (
            <div className="text-center py-32 text-ink-secondary text-13 font-prose bg-surface-100 border border-surface-300 rounded-lg">
              No custom policies yet. The baseline rules — Owner has full access, roles get their standard
              clearance, everything else is denied by default — are always on regardless. Add a policy above to
              tighten or extend that for a specific role or principal, or use the simulator to check what already
              applies without adding anything.
            </div>
          ) : (
            <div className="space-y-12">
              {policies.map(p => (
                <div key={p.policy_id} className="bg-surface-100 border border-surface-300 rounded p-16 space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium text-14 text-ink-primary">{p.name}</span>
                      <span className="text-11 font-mono text-ink-secondary ml-8">{p.policy_id}</span>
                    </div>
                    <div className="flex items-center gap-8">
                      <span className={`text-10 font-mono px-6 py-2 rounded uppercase ${
                        p.effect === 'allow' ? 'bg-surface-300 text-ink-primary' : 'bg-accent/20 text-accent'
                      }`}>
                        {p.effect}
                      </span>
                      <button
                        onClick={() => handleDeletePolicy(p.policy_id)}
                        disabled={deletingId === p.policy_id}
                        className="text-ink-secondary hover:text-danger transition-colors p-4 rounded hover:bg-danger-soft disabled:opacity-40"
                        title="Remove this policy"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 text-11 font-mono">
                    <span className="text-ink-secondary">Actions: {p.actions.join(', ')}</span>
                    <span className="text-ink-secondary">|</span>
                    <span className="text-ink-secondary">Principals: {p.principals.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
