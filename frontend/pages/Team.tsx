import React, { useState, useEffect } from 'react';
import { Loader2, UserPlus, Trash2, ShieldAlert, Users } from 'lucide-react';
import { api } from '../api';
import { TeamUser, Role } from '../types';

const ROLE_OPTIONS: Role[] = ['Owner', 'Tech Lead', 'Software Designer', 'Technical Reviewer', 'Auditor'];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  Owner: 'Full access — everything, including managing the team.',
  'Tech Lead': 'Operational access to agents, memory, recall and policy simulation.',
  'Software Designer': 'Same operational access as Tech Lead.',
  'Technical Reviewer': 'Read-only across everything.',
  Auditor: 'Read-only, restricted to audit logs and the model directory.',
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
                  {r}
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
                    <div className="text-13 text-ink-primary font-medium">{u.display_name}</div>
                    <div className="text-11 text-ink-secondary font-mono">
                      {u.username} · {u.role}
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
