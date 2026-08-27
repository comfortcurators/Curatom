import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus, Trash2, ShieldAlert, Users, Check, X, Clock } from 'lucide-react';
import { api } from '../api';
import { TeamUser, Role, PendingApproval } from '../types';

const ROLE_OPTIONS: Role[] = ['Owner', 'Tech Lead', 'Software Designer', 'Technical Reviewer', 'Auditor'];

// The role picker speaks in titles a founder actually uses; the value sent
// to the backend is unchanged (it's what policy.py and every existing
// record already key off). Display only — no schema change.
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Owner: 'Owner',
  'Tech Lead': 'CTO',
  'Software Designer': 'Manager',
  'Technical Reviewer': 'Reviewer',
  Auditor: 'Auditor',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  Owner: 'Full access — everything, including managing the team.',
  'Tech Lead': 'Can run and configure agents, add memory, and simulate policy — the technical operator role.',
  'Software Designer': 'Same day-to-day access as CTO — for a second technical operator, whatever you call them.',
  'Technical Reviewer': 'Can see everything, change nothing.',
  Auditor: 'Read-only, limited to the audit log and the model directory — for compliance review.',
};

export const Team: React.FC = () => {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('Tech Lead');

  const currentUsername = localStorage.getItem('curatom_principal_id');

  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await api.getApprovals('pending');
      setApprovals(res.items);
    } catch (e) {
      console.error(e);
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApprovals();
    const interval = setInterval(loadApprovals, 10000);
    return () => clearInterval(interval);
  }, [loadApprovals]);

  const handleDecide = async (id: string, decision: 'approve' | 'deny') => {
    setDecidingId(id);
    try {
      if (decision === 'approve') {
        await api.approveAction(id);
      } else {
        await api.denyAction(id);
      }
      await loadApprovals();
    } catch (e: any) {
      alert(`Could not ${decision} that action: ${e.message}`);
    } finally {
      setDecidingId(null);
    }
  };

  const describeApproval = (a: PendingApproval): string => {
    switch (a.action) {
      case 'context.write':
        return 'wants to update your business context';
      case 'decision.write':
        return `wants to log a decision: "${a.payload.claim || ''}"`;
      case 'memory.write':
        return `wants to add a memory on "${a.payload.topic || ''}"`;
      default:
        return `wants to run ${a.action}`;
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listUsers();
      setUsers(res);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load the team roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.createUser({ username, password, role, display_name: displayName });
      setUsername('');
      setPassword('');
      setDisplayName('');
      setRole('Tech Lead');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not add that teammate.');
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (targetUsername: string) => {
    if (!confirm(`Remove ${targetUsername}'s access? They'll no longer be able to log in.`)) return;
    try {
      await api.deactivateUser(targetUsername);
      await load();
    } catch (e: any) {
      alert(`Could not remove that teammate: ${e.message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-24">
      <div>
        <h1 className="font-display text-24 text-ink-primary flex items-center gap-10">
          <Users size={22} className="text-accent" /> Team
        </h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          Give your CTO, a manager, or anyone else their own login and role — instead of everyone sharing one
          account. What they see is scoped to what their role is cleared for.
        </p>
      </div>

      {(approvalsLoading || approvals.length > 0) && (
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated overflow-hidden">
          <div className="p-16 border-b border-surface-300 flex items-center gap-8">
            <Clock size={16} className="text-accent" />
            <h2 className="text-14 text-ink-primary font-medium">Waiting on your approval</h2>
          </div>
          {approvalsLoading ? (
            <div className="flex justify-center py-24 text-ink-secondary">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : (
            <div className="divide-y divide-surface-300">
              {approvals.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-12 p-14">
                  <div className="min-w-0">
                    <div className="text-13 text-ink-primary font-prose truncate">
                      <span className="font-mono text-11 text-ink-secondary">{a.requested_by}</span> {describeApproval(a)}
                    </div>
                    <div className="text-11 text-ink-secondary font-mono mt-2">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <button
                      onClick={() => handleDecide(a.id, 'approve')}
                      disabled={decidingId === a.id}
                      className="flex items-center gap-4 px-10 py-6 bg-accent hover:bg-accent/90 text-canvas rounded text-12 font-medium transition-colors disabled:opacity-50"
                    >
                      {decidingId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecide(a.id, 'deny')}
                      disabled={decidingId === a.id}
                      className="flex items-center gap-4 px-10 py-6 bg-surface-300 hover:bg-surface-400 text-ink-primary rounded text-12 font-medium transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 space-y-16">
        <h2 className="text-14 text-ink-primary font-medium">Add a teammate</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Display name</label>
            <input
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-prose"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Username</label>
            <input
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. priya"
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Password</label>
            <input
              type="password"
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-11 font-mono text-ink-secondary mb-6">Role</label>
            <select
              className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_DISPLAY_NAMES[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-11 text-ink-secondary font-prose">{ROLE_DESCRIPTIONS[role]}</p>

        {error && (
          <div className="text-13 text-accent font-prose bg-surface-200 border border-surface-400 rounded-md p-10">{error}</div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Add teammate
        </button>
      </form>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated overflow-hidden">
        <div className="p-16 border-b border-surface-300">
          <h2 className="text-14 text-ink-primary font-medium">Everyone with access</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-32 text-ink-secondary">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-32 text-ink-secondary text-13 font-prose">Nobody else has a real account yet.</div>
        ) : (
          <div className="divide-y divide-surface-300">
            {users
              .filter((u) => u.is_active)
              .map((u) => (
                <div key={u.username} className="flex items-center justify-between p-14">
                  <div>
                    <div className="text-13 text-ink-primary font-medium flex items-center gap-6">
                      {u.display_name}
                      {u.email_verified === false && (
                        <span className="text-10 font-mono text-accent bg-accent/10 px-6 py-1 rounded uppercase">Email unverified</span>
                      )}
                    </div>
                    <div className="text-11 text-ink-secondary font-mono">
                      {u.username} · {ROLE_DISPLAY_NAMES[u.role] || u.role}
                    </div>
                  </div>
                  {u.username !== currentUsername && (
                    <button
                      onClick={() => handleRemove(u.username)}
                      className="text-ink-secondary hover:text-accent transition-colors p-6 rounded hover:bg-surface-300"
                      title="Remove access"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-10 text-12 text-ink-secondary font-prose bg-surface-200/60 border border-surface-400 rounded-lg p-14">
        <ShieldAlert size={16} className="text-accent shrink-0 mt-1" />
        <p>Only the Owner can see or manage this page. A teammate you add logs in with their own username and password, scoped to their role.</p>
      </div>
    </div>
  );
};
