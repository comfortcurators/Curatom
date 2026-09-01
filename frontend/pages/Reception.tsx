import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Cpu, ArrowRight, Loader2, Lock, Building2, KeyRound } from 'lucide-react';
import { AtomProfile } from '../types';
import { APP_NAME, COMPANY_LEGAL_NAME } from '../constants';
import { api } from '../api';
// WovenLocusField is now mounted once at the app root (App.tsx), beneath
// every route, not just this one.

export const Reception: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'select' | 'human' | 'agent' | 'register' | 'recover' | 'verify-email'>('select');

  // Human Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Registration State (any business signs up here, gets its own tenant)
  const [regFounderName, setRegFounderName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regBusinessName, setRegBusinessName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Email verification (post-registration)
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verificationEmailSent, setVerificationEmailSent] = useState(true);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Recovery State (backup code -> new password)
  const [recUsername, setRecUsername] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  // Agent Handshake State
  const [agentHint, setAgentHint] = useState('');
  const [agentSample, setAgentSample] = useState('');
  const [loading, setLoading] = useState(false);
  const [inferredProfile, setInferredProfile] = useState<{profile: AtomProfile, sources: any[]} | null>(null);
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    if (searchParams.get('start') === 'register') {
      setMode('register');
    }
  }, [searchParams]);

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);
    try {
      const res = await api.register({
        username: regUsername,
        founder_name: regFounderName,
        business_name: regBusinessName,
        email: regEmail,
        phone: regPhone || undefined,
        password: regPassword,
      });
      localStorage.setItem('curatom_session_token', res.session_token);
      localStorage.setItem('curatom_role', res.role);
      localStorage.setItem('curatom_tenant_id', res.tenant_id);
      localStorage.setItem('curatom_principal_id', res.principal_id);
      localStorage.removeItem('curatom_atom_key');
      setVerificationEmailSent(res.verification_email_sent);
      setMode('verify-email');
    } catch (err: any) {
      setRegError(err.message || 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      await api.verifyEmail(regUsername, verifyCode);
      navigate('/');
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendMessage(null);
    try {
      const res = await api.resendVerification(regUsername, regEmail);
      setVerificationEmailSent(!!res.verification_email_sent);
      setResendMessage(res.verification_email_sent ? 'A new code is on its way.' : 'Could not send an email right now — email delivery is not configured in this deployment.');
    } catch (err: any) {
      setResendMessage(err.message || 'Could not resend the code.');
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecLoading(true);
    setRecError(null);
    try {
      const res = await api.recoverAccount({
        username: recUsername,
        recovery_code: recCode,
        new_password: recNewPassword,
      });
      localStorage.setItem('curatom_session_token', res.session_token);
      localStorage.setItem('curatom_role', res.role);
      localStorage.setItem('curatom_tenant_id', res.tenant_id);
      localStorage.setItem('curatom_principal_id', res.principal_id);
      localStorage.removeItem('curatom_atom_key');
      navigate('/');
    } catch (err: any) {
      setRecError(err.message || 'Recovery failed');
    } finally {
      setRecLoading(false);
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
        // No fleet_id: a hardcoded "fleet_core_apac" here 404'd for every
        // real tenant, since fleets are auto-created per-tenant with a
        // real generated id (see get_or_create_default_fleet in
        // repository.py), never that literal string. Omitting it lets the
        // backend assign the tenant's actual default fleet, same as the
        // Overview quick-start form already does correctly.
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
    // No bg-canvas here: WovenLocusField now renders as an earlier DOM
    // sibling (mounted at the App root, not nested inside this div like
    // before), so an opaque background here would paint over it instead of
    // being painted under it as it was when the field was a child.
    <div className="min-h-screen flex flex-col items-center justify-center relative font-ui p-24 overflow-hidden">
      <div className="text-center mb-36 relative z-10">
        <h1 className="font-display text-48 font-light text-ink-primary mb-8 tracking-tight">
          {APP_NAME}
        </h1>
        <p className="text-12 text-ink-secondary uppercase tracking-[0.2em] font-mono">
          By {COMPANY_LEGAL_NAME}
        </p>
      </div>

      <div className="glass relative z-10 rounded-lg p-32 w-full max-w-xl">
        {mode === 'select' && (
          <div className="space-y-16">
            <h2 className="text-15 font-medium text-ink-primary mb-8 text-center font-display">
              Start here
            </h2>
            <button
              onClick={() => setMode('register')}
              className="w-full flex items-center justify-center gap-8 px-16 py-12 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md text-14 font-medium transition-colors"
            >
              <Building2 size={16} />
              Create your workspace
            </button>
            <p className="text-11 text-ink-secondary font-mono text-center">
              Isolated tenant. No shared demo data. You become the Owner.
            </p>

            <p className="text-11 font-mono text-ink-secondary text-center uppercase tracking-wider pt-8">
              or sign in
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <button
                onClick={() => setMode('human')}
                className="flex flex-col items-center gap-16 p-32 rounded-md border border-surface-300 bg-surface-200 hover:bg-surface-300 hover:border-ink-secondary transition-all group text-center"
              >
                <Shield size={32} className="text-ink-secondary group-hover:text-accent transition-colors" />
                <div>
                  <span className="text-15 font-medium text-ink-primary block">I'm a person</span>
                  <span className="text-11 text-ink-secondary mt-4 block">Sign in with your username and password</span>
                </div>
              </button>
              <button
                onClick={() => setMode('agent')}
                className="flex flex-col items-center gap-16 p-32 rounded-md border border-surface-300 bg-surface-200 hover:bg-surface-300 hover:border-ink-secondary transition-all group text-center"
              >
                <Cpu size={32} className="text-ink-secondary group-hover:text-accent transition-colors" />
                <div>
                  <span className="text-15 font-medium text-ink-primary block">I'm an AI agent</span>
                  <span className="text-11 text-ink-secondary mt-4 block">Connect and get set up automatically</span>
                </div>
              </button>
            </div>
            <a
              href="#/architecture"
              className="block text-center text-11 font-mono text-ink-secondary hover:text-accent underline pt-8"
            >
              Architecture · live Google Cloud proof · no login required
            </a>
          </div>
        )}

        {mode === 'human' && (
          <form onSubmit={handleHumanLogin} className="space-y-16">
            <div className="flex items-center justify-between mb-16">
              <button type="button" onClick={() => setMode('select')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display flex items-center gap-6">
                <Lock size={14} className="text-accent" /> Sign In
              </h2>
            </div>

            {loginError && (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Password</label>
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
                Sign In
              </button>
            </div>

            <p className="text-11 text-ink-secondary font-mono text-center pt-8">
              Your role and access are set by your account, not anything typed here.
            </p>
            <button
              type="button"
              onClick={() => setMode('recover')}
              className="w-full text-center text-12 text-ink-secondary hover:text-accent underline"
            >
              Forgot your password? Use your backup code
            </button>
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={handleRecover} className="space-y-16">
            <div className="flex items-center justify-between mb-16">
              <button type="button" onClick={() => setMode('human')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display flex items-center gap-6">
                <KeyRound size={14} className="text-accent" /> Recover With Backup Code
              </h2>
            </div>

            {recError && (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                {recError}
              </div>
            )}

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Username</label>
              <input
                type="text"
                value={recUsername}
                onChange={e => setRecUsername(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Backup Code</label>
              <input
                type="text"
                value={recCode}
                onChange={e => setRecCode(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">New Password</label>
              <input
                type="password"
                value={recNewPassword}
                onChange={e => setRecNewPassword(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                minLength={8}
                required
              />
            </div>

            <div className="pt-8">
              <button
                type="submit"
                disabled={recLoading}
                className="w-full flex items-center justify-center gap-8 px-16 py-10 bg-accent hover:bg-accent/90 text-canvas rounded text-13 font-medium transition-colors disabled:opacity-50"
              >
                {recLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Reset Password & Sign In
              </button>
            </div>

            <p className="text-11 text-ink-secondary font-mono text-center pt-8">
              This code only works once. You'll need to generate a new one after this.
            </p>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-16">
            <div className="flex items-center justify-between mb-16">
              <button type="button" onClick={() => setMode('select')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display flex items-center gap-6">
                <Building2 size={14} className="text-accent" /> Register Your Business
              </h2>
            </div>

            {regError && (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                {regError}
              </div>
            )}

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Your Name</label>
              <input
                type="text"
                value={regFounderName}
                onChange={e => setRegFounderName(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Business Name</label>
              <input
                type="text"
                value={regBusinessName}
                onChange={e => setRegBusinessName(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Username</label>
              <input
                type="text"
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Email</label>
              <input
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Phone (optional)</label>
              <input
                type="tel"
                value={regPhone}
                onChange={e => setRegPhone(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">Password</label>
              <input
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent"
                minLength={8}
                required
              />
            </div>

            <div className="pt-8">
              <button
                type="submit"
                disabled={regLoading}
                className="w-full flex items-center justify-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-13 font-medium transition-colors disabled:opacity-50"
              >
                {regLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Create Workspace & Sign In
              </button>
            </div>

            <p className="text-11 text-ink-secondary font-mono text-center pt-8">
              You become the Owner of a new, fully isolated workspace. No data is shared with any other business on Curatom.
            </p>
          </form>
        )}

        {mode === 'verify-email' && (
          <form onSubmit={handleVerifyEmail} className="space-y-16">
            <h2 className="text-15 font-medium text-ink-primary font-display flex items-center gap-6">
              <Lock size={14} className="text-accent" /> Verify Your Email
            </h2>

            {verificationEmailSent ? (
              <p className="text-13 text-ink-secondary font-prose leading-relaxed">
                We sent a 6-digit code to <span className="text-ink-primary">{regEmail}</span>. Enter it below — it expires in 30 minutes.
              </p>
            ) : (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                Couldn't send a verification email — email delivery isn't configured in this deployment. Your account still works; you can verify later.
              </div>
            )}

            {verifyError && (
              <div className="p-10 bg-accent/10 border border-accent/30 rounded text-12 text-accent font-mono">
                {verifyError}
              </div>
            )}

            {resendMessage && (
              <div className="p-10 bg-surface-200 border border-surface-400 rounded text-12 text-ink-secondary font-mono">
                {resendMessage}
              </div>
            )}

            <div>
              <label className="block text-11 font-mono text-ink-secondary mb-6">6-Digit Code</label>
              <input
                type="text"
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value)}
                className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary font-mono outline-none focus:border-accent tracking-widest text-center"
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>

            <div className="pt-8">
              <button
                type="submit"
                disabled={verifyLoading}
                className="w-full flex items-center justify-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-13 font-medium transition-colors disabled:opacity-50"
              >
                {verifyLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Verify
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button type="button" onClick={handleResendVerification} className="text-12 text-ink-secondary hover:text-accent underline">
                Resend code
              </button>
              <button type="button" onClick={() => navigate('/')} className="text-12 text-ink-secondary hover:text-ink-primary underline">
                Skip for now
              </button>
            </div>
          </form>
        )}

        {mode === 'agent' && (
          <div>
            <div className="flex items-center gap-16 mb-24">
              <button onClick={() => setMode('select')} className="text-ink-secondary hover:text-ink-primary text-12 font-mono">← Back</button>
              <h2 className="text-15 font-medium text-ink-primary font-display">Connect an AI Agent</h2>
            </div>

            {!inferredProfile ? (
              <div className="space-y-16">
                <p className="text-13 text-ink-secondary font-prose leading-relaxed">
                  Tell us which AI model this is, or paste something it wrote. Curatom checks real documentation to
                  work out the right settings automatically.
                </p>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">AI Model</label>
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
                  className="w-full flex justify-center items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />}
                  Look Up Settings
                </button>
              </div>
            ) : (
              <div className="space-y-16">
                <div className="p-16 bg-surface-200 border border-surface-400 rounded-md space-y-10 text-12">
                  <h3 className="text-11 text-accent font-mono uppercase tracking-wider">Settings found</h3>
                  <div><span className="text-ink-secondary">Output Format:</span> <span className="text-ink-primary font-mono ml-4">{inferredProfile.profile.format}</span></div>
                  <div><span className="text-ink-secondary">Accuracy Tolerance:</span> <span className="text-ink-primary ml-4">{inferredProfile.profile.accuracy_tolerance}</span></div>
                  <div><span className="text-ink-secondary">Retention Window:</span> <span className="text-ink-primary font-mono ml-4">{inferredProfile.profile.retention_window_hours}h</span></div>
                  <div className="pt-8 border-t border-surface-300">
                    <span className="text-ink-secondary block mb-4">Sources:</span>
                    <ul className="space-y-2 text-11 font-mono text-ink-secondary">
                      {inferredProfile.sources.map((s, i) => (
                        <li key={i} className="truncate">
                          {/^https?:\/\//.test(s.uri) ? (
                            <a href={s.uri} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.uri}</a>
                          ) : (
                            // Styled like a link before but never was one -
                            // clicking it did nothing. Only make it a real
                            // link when it's actually a navigable URL.
                            <span>{s.uri}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <label className="block text-11 font-mono text-ink-secondary mb-6">Give it a name</label>
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
                  className="w-full flex justify-center items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Connect & Get Key
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-36 text-11 text-ink-secondary font-mono opacity-50 relative z-10">
        Every sign-in is verified by the server — nothing your browser sends is trusted on its own.
      </div>
      {/* AGPL-3.0 §13 source offer - this is the network-reachable entry
          point before a session exists, so the offer has to live here too,
          not only behind the authenticated Layout shell. */}
      <div className="mt-8 text-11 relative z-10">
        <a
          href="https://github.com/comfortcurators/Curatom"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-secondary hover:text-ink-primary transition-colors underline decoration-surface-400 underline-offset-2"
        >
          Source Code (AGPL-3.0)
        </a>
      </div>
    </div>
  );
};
