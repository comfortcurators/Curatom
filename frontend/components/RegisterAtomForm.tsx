import React, { useState } from 'react';
import { Loader2, Plug, Copy, Check, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

const MODEL_FAMILIES = ['Claude', 'GPT', 'Gemini', 'Other'];
const ALL_REGIONS = ['IN', 'EU', 'UK', 'CN', 'US', 'SG', 'AU'];
const DEFAULT_REGIONS = ['SG', 'US', 'IN', 'EU'];
// YAML costs fewer tokens per response than JSON (no repeated quotes/braces/
// commas) for the same information, and every agent response already knows
// how to render either (backend's render_for_principal). YAML is the
// sensible default; JSON stays available for a caller that specifically
// expects it.
const RESPONSE_FORMATS = ['YAML', 'JSON', 'Markdown'];

interface Props {
  title?: string;
  onConnected?: () => void;
}

// Used to be Overview-only, and only ever shown before the first agent
// existed - there was no way to add a second key anywhere in the app once
// that one form disappeared. Now shared between Overview's first-run
// prompt and the Keys section, which always shows it.
export const RegisterAtomForm: React.FC<Props> = ({ title = 'Add an agent key', onConnected }) => {
  const [name, setName] = useState('');
  const [modelFamily, setModelFamily] = useState('Claude');
  const [responseFormat, setResponseFormat] = useState('YAML');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [regions, setRegions] = useState<string[]>(DEFAULT_REGIONS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [atomId, setAtomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regions.length === 0) {
      setError('Pick at least one permitted region — a key with none could never read anything.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.registerAtom({
        name,
        model_family: modelFamily,
        description: `Connected from ${title}.`,
        requires_approval: requiresApproval,
        profile: { permitted_regions: regions, format: responseFormat },
      });
      setApiKey(res.api_key);
      setAtomId(res.atom.id);
      onConnected?.();
    } catch (e: any) {
      setError(e.message || 'Could not connect that agent — try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setName('');
    setModelFamily('Claude');
    setResponseFormat('YAML');
    setRequiresApproval(false);
    setRegions(DEFAULT_REGIONS);
    setApiKey(null);
    setAtomId(null);
    setError(null);
  };

  // Credential-file shape, same idea as a GCP service-account JSON: every
  // field an agent needs to actually call the endpoint, in one pasteable
  // block, instead of a bare key an agent still had to know how to use.
  const credentialJson = apiKey
    ? JSON.stringify(
        {
          type: 'curatom_atom_key',
          atom_id: atomId,
          name,
          endpoint: `${window.location.origin}/context`,
          method: 'GET',
          header: 'X-Atom-Key',
          key: apiKey,
        },
        null,
        2
      )
    : '';

  if (apiKey) {
    return (
      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-14">
        <div className="flex items-center gap-10">
          <CheckCircle2 size={22} className="text-accent" />
          <h2 className="text-15 text-ink-primary font-medium">{name} is connected</h2>
        </div>
        <p className="text-13 text-ink-secondary font-prose">
          Give it this — it's shown once and can't be retrieved again. Anywhere that key is used can now read
          your White Paper and act within its permissions.
          {requiresApproval && (
            <> Every write it attempts is queued, not executed — approve or deny each one from the Team page before it takes effect.</>
          )}
        </p>
        <div className="flex items-start gap-8 bg-surface-200 border border-surface-400 rounded-md p-12">
          <pre className="flex-1 text-12 font-mono text-ink-primary whitespace-pre-wrap break-all">
            {credentialJson}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(credentialJson);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300 shrink-0"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={reset} className="text-13 text-accent hover:underline">
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-14">
      <div className="flex items-center gap-10">
        <Plug size={20} className="text-accent" />
        <h2 className="text-15 text-ink-primary font-medium">{title}</h2>
      </div>
      <p className="text-13 text-ink-secondary font-prose">
        Give it a name and which model family it is. That's it — no fleets, roles, or configuration to understand.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
        <div>
          <label className="block text-11 font-mono text-ink-secondary mb-6">Name</label>
          <input
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-prose"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Customer support assistant"
            required
          />
        </div>
        <div>
          <label className="block text-11 font-mono text-ink-secondary mb-6">Model family</label>
          <select
            className="w-full bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
            value={modelFamily}
            onChange={(e) => setModelFamily(e.target.value)}
          >
            {MODEL_FAMILIES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-11 font-mono text-ink-secondary mb-6">Response format</label>
        <select
          className="w-full sm:w-1/2 bg-surface-200 border border-surface-400 rounded p-8 text-13 text-ink-primary focus:border-accent outline-none font-mono"
          value={responseFormat}
          onChange={(e) => setResponseFormat(e.target.value)}
        >
          {RESPONSE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <p className="text-11 text-ink-secondary font-prose mt-6">
          YAML costs this key fewer tokens per call than JSON for the same data — keep it unless something on the
          other end specifically needs JSON.
        </p>
      </div>
      <div>
        <label className="block text-11 font-mono text-ink-secondary mb-6">
          Permitted regions — where this key is allowed to read data from
        </label>
        <div className="flex flex-wrap gap-8">
          {ALL_REGIONS.map((r) => {
            const checked = regions.includes(r);
            return (
              <label
                key={r}
                className={`flex items-center gap-6 px-10 py-6 rounded-md border cursor-pointer text-12 font-mono ${
                  checked ? 'border-accent text-accent bg-surface-200' : 'border-surface-400 text-ink-secondary bg-surface-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setRegions((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                  }
                  className="sr-only"
                />
                {r}
              </label>
            );
          })}
        </div>
        <p className="text-11 text-ink-secondary font-prose mt-6">
          A request from this key for data outside these regions is refused, not just logged.
        </p>
      </div>
      <label className="flex items-start gap-8 p-10 rounded-md border border-surface-400 bg-surface-200 cursor-pointer">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
          className="mt-2"
        />
        <span className="text-12 text-ink-secondary font-prose">
          <span className="text-ink-primary font-medium">Require my approval before this key can write anything.</span>{' '}
          It can still do everything it's capable of, but nothing it adds or changes takes effect until you approve it — you'll see every attempt in the Team page.
        </span>
      </label>
      {error && <div className="text-13 text-accent font-prose">~ {error} ~</div>}
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-8 px-14 py-8 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-13 font-medium disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
        Connect
      </button>
    </form>
  );
};
