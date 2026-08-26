import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Code, Eye, Briefcase, Cpu, ArrowRight, Loader2, FileSearch, Lock } from 'lucide-react';
import { Role, AtomProfile } from '../types';
import { APP_NAME, COMPANY_NAME } from '../constants';
import { api } from '../api';

export const Reception: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'select' | 'human' | 'agent'>('select');
  
  // Human Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('Tech Lead');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Agent Handshake State
  const [agentHint, setAgentHint] = useState('');
  const [agentSample, setAgentSample] = useState('');
  const [loading, setLoading] = useState(false);
  const [inferredProfile, setInferredProfile] = useState<{profile: AtomProfile, sources: any[]} | null>(null);
  const [agentName, setAgentName] = useState('');

  const handleHumanLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.login(username, password);
      localStorage.setItem('curatom_session_token', res.session_token);
      localStorage.setItem('curatom_role', res.role);
      localStorage.setItem('curatom_tenant_id', res.tenant_id);
      localStorage.setItem('curatom_principal_id', res.principal_id);
      localStorage.removeItem('curatom_atom_key');
      navigate('/');
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAgentIdentify = async () => {
    setLoading(true);
    try {
      const res = await api.identifyAtom({ model_family_hint: agentHint, sample_response: agentSample });
      setInferredProfile(res);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentRegister = async () => {
    if (!inferredProfile || !agentName) return;
    setLoading(true);
    try {
      const res = await api.registerAtom({
        name: agentName,
        fleet_id: 'fleet_core_apac',
        model_family: agentHint || 'inferred',
        role: 'Requester',
        description: 'Auto-registered via Reception Agent Handshake',
        labels: { env: 'prod', origin: 'handshake' },
        profile: inferredProfile.profile
      });
      localStorage.setItem('curatom_atom_key', res.api_key);
      localStorage.setItem('curatom_principal_id', res.atom.id);
      localStorage.removeItem('curatom_session_token');
      localStorage.removeItem('curatom_role');
      navigate('/');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative z-10 font-ui p-24 bg-canvas">
      <div className="text-center mb-36">
        <h1 className="font-display text-48 font-light text-ink-primary mb-8 tracking-tight">
          {APP_NAME}
        </h1>
        <p className="text-12 text-ink-secondary uppercase tracking-[0.2em] font-mono">
          {COMPANY_NAME}
        </p>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg p-32 w-full max-w-xl shadow-2xl">
        {mode === 'select' && (
          <div className="space-y-16">
            <h2 className="text-15 font-medium text-ink-primary mb-24 text-center font-display">
              Enterprise Identity Verification
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <button 
                onClick={() => setMode('human')} 
                className="flex flex-col items-center gap-16 p-32 rounded-md border border-surface-300 bg-surface-200 hover:bg-surface-300 hover:border-ink-secondary transition-all group text-center"
              >
                <Shield size={32} className="text-ink-secondary group-hover:text-accent transition-colors" />
                <div>
                  <span className="text-15 font-medium text-ink-primary block">Human Principal</span>
                  <span className="text-11 text-ink-secondary mt-4 block">Authenticate with server-signed token</span>
                </div>
              </button>
              <button 
                onClick={() => setMode('agent')} 
                className="flex flex-col items-center gap-16 p-32 rounded-md border border-surface-300 bg-surface-200 hover:bg-surface-300 hover:border-ink-secondary transition-all group text-center"
              >
                <Cpu size={32} className="text-ink-secondary group-hover:text-accent transition-colors" />
                <div>
                  <span className="text-15 font-medium text-ink-primary block">Agent Principal</span>
                  <span className="text-11 text-ink-secondary mt-4 block">Handshake and profile derivation</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {mode === 'human' && (
          <form onSubmit={handleHumanLogin} className="space-y-16">
            <div className="flex items-center justify-between mb-16">
              <button type="button" onClick={() => setMode('select')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display flex items-center gap-6">
                <Lock size={14} className="text-accent" /> Principal Sign-In
              </h2>
            </div>

            {loginError && (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Principal Identifier (Username)</label>
              <input 
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Password / Secret</label>
              <input 
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div className="pt-8">
              <button 
                type="submit"
                disabled={loginLoading}
                className="w-full flex items-center justify-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-13 font-medium transition-colors disabled:opacity-50"
              >
                {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Authenticate Session
              </button>
            </div>

            <p className="text-11 text-ink-secondary font-mono text-center pt-8">
              Roles and grants are verified and resolved server-side from your authenticated principal record.
            </p>
          </form>
        )}

        {mode === 'agent' && (
          <div>
            <div className="flex items-center gap-16 mb-24">
              <button onClick={() => setMode('select')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display">Agent Principal Identification</h2>
            </div>
            
            {!inferredProfile ? (
              <div className="space-y-16">
                <p className="text-13 text-ink-secondary font-prose leading-relaxed">
                  Provide a model family hint or paste a sample response. Curatom queries grounded documentation to derive format, persona, and accuracy parameters.
                </p>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Model Family Identifier</label>
                  <input 
                    type="text" 
                    value={agentHint}
                    onChange={e => setAgentHint(e.target.value)}
                    className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
                    placeholder="e.g. meta-llama/Llama-3.3-70B-Instruct, claude-3-5-sonnet"
                  />
                </div>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Sample Output</label>
                  <textarea 
                    value={agentSample}
                    onChange={e => setAgentSample(e.target.value)}
                    className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-12 text-ink-primary focus:border-accent outline-none h-28 font-mono"
                    placeholder="Paste sample output here..."
                  />
                </div>
                <button 
                  onClick={handleAgentIdentify}
                  disabled={loading || (!agentHint && !agentSample)}
                  className="w-full flex justify-center items-center gap-8 px-16 py-10 bg-surface-300 hover:bg-surface-400 text-ink-primary rounded-md transition-colors text-13 font-medium disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />}
                  Derive Grounded Profile
                </button>
              </div>
            ) : (
              <div className="space-y-16">
                <div className="p-16 bg-surface-200 border border-surface-400 rounded-md space-y-10 text-12">
                  <h3 className="text-11 text-accent font-mono uppercase tracking-wider">Derived Profile (Grounded)</h3>
                  <div><span className="text-ink-secondary">Output Format:</span> <span className="text-ink-primary font-mono ml-4">{inferredProfile.profile.format}</span></div>
                  <div><span className="text-ink-secondary">Accuracy Tolerance:</span> <span className="text-ink-primary ml-4">{inferredProfile.profile.accuracy_tolerance}</span></div>
                  <div><span className="text-ink-secondary">Retention Window:</span> <span className="text-ink-primary font-mono ml-4">{inferredProfile.profile.retention_window_hours}h</span></div>
                  <div className="pt-8 border-t border-surface-300">
                    <span className="text-ink-secondary block mb-4">Grounded Citations:</span>
                    <ul className="space-y-2 text-11 font-mono text-ink-secondary">
                      {inferredProfile.sources.map((s, i) => (
                        <li key={i} className="truncate text-accent hover:underline">{s.uri}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Assign Atom Name</label>
                  <input 
                    type="text" 
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none"
                    placeholder="e.g. Booking Orchestrator APAC"
                  />
                </div>
                <button 
                  onClick={handleAgentRegister}
                  disabled={loading || !agentName}
                  className="w-full flex justify-center items-center gap-8 px-16 py-10 bg-accent hover:bg-accent/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Register & Issue Key
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="mt-36 text-11 text-ink-secondary font-mono opacity-50">
        SERVER-SIDE IDENTITY RESOLUTION • ZERO CLIENT SPOOFING
      </div>
    </div>
  );
};
