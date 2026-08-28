import React, { useRef, useState } from 'react';
import { Loader2, ArrowRight, Copy, Check, FileInput, Camera } from 'lucide-react';
import { api } from '../api';
import { BusinessContext } from '../types';

interface Question {
  key: keyof BusinessContext;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
}

const QUESTIONS: Question[] = [
  {
    key: 'business_name',
    label: 'What do you call your business?',
    placeholder: 'Your business name',
    required: true,
  },
  {
    key: 'what_you_do',
    label: 'In your own words, what does your business actually do?',
    placeholder: "e.g. We build accounting software for small retailers — or run a logistics fleet, or manage a chain of clinics. Whatever it actually is.",
    required: true,
    multiline: true,
  },
  {
    key: 'customers',
    label: 'Who are your customers, and what do they come to you for?',
    placeholder: 'e.g. Small business owners who need X, or enterprise buyers evaluating Y.',
    required: true,
    multiline: true,
  },
  {
    key: 'current_stack',
    label: "What tools, accounts, or platforms does your business already run on? List anything that matters — AI tools included.",
    placeholder: 'e.g. AWS, Cloudflare, Zoho, GitHub, Claude, Gemini, your own internal systems...',
    required: true,
    multiline: true,
  },
  {
    key: 'priorities',
    label: 'Right now, what actually matters most to you? What should an AI assistant never lose sight of?',
    placeholder: 'e.g. Customer trust above all, then growth, then cost — whatever your actual order is.',
    required: true,
    multiline: true,
  },
  {
    key: 'constraints',
    label: "Anything an AI should never do, or always check with you first about? (optional)",
    placeholder: 'e.g. Never quote a price without my sign-off, never contact a customer directly.',
    required: false,
    multiline: true,
  },
  {
    key: 'voice_and_tone',
    label: 'How should an AI sound when it speaks on behalf of your business? (optional)',
    placeholder: 'e.g. Warm but concise, never salesy — or formal and precise, whatever fits.',
    required: false,
  },
  {
    key: 'brands',
    label: 'What brands do you operate under? (optional)',
    placeholder: 'e.g. One parent brand, or several — list them.',
    required: false,
  },
  {
    key: 'domains',
    label: 'What domains/websites are yours? (optional)',
    placeholder: 'e.g. example.com, example.io',
    required: false,
  },
  {
    key: 'founders',
    label: 'Who founded this business? (optional)',
    placeholder: 'Name(s), and role if it matters.',
    required: false,
  },
  {
    key: 'no_of_employees',
    label: 'How many people work here? (optional)',
    placeholder: 'e.g. ~50, or a rough range.',
    required: false,
  },
  {
    key: 'countries_covered',
    label: 'What countries or regions do you operate in? (optional)',
    placeholder: 'List as many as apply.',
    required: false,
  },
  {
    key: 'key_associations',
    label: 'Any key associations, partnerships, or affiliations worth knowing? (optional)',
    placeholder: 'e.g. Industry bodies, major partners, certifications.',
    required: false,
    multiline: true,
  },
  {
    key: 'spine_of_business',
    label: 'What is the actual spine of this business — the one thing everything else depends on? (optional)',
    placeholder: 'What would break the whole business if it stopped working.',
    required: false,
    multiline: true,
  },
  {
    key: 'business_model_evolution',
    label: 'How has your business model changed since incorporation? (optional)',
    placeholder: "What you started as vs. what you are now, if it's changed.",
    required: false,
    multiline: true,
  },
  {
    key: 'key_events_and_principles',
    label: 'Any key events or founding principles an AI should know about? (optional)',
    placeholder: 'A turning point, an incident, a principle you never compromise on.',
    required: false,
    multiline: true,
  },
  {
    key: 'user_base',
    label: 'Describe your actual user base, if different from "customers" above. (optional)',
    placeholder: 'e.g. Registered users vs. paying customers, if that distinction matters here.',
    required: false,
    multiline: true,
  },
  {
    key: 'softwares_involved',
    label: 'What software is directly or indirectly involved in running this business? (optional)',
    placeholder: 'Beyond the stack above — vendor tools, internal systems, anything integrated.',
    required: false,
    multiline: true,
  },
  {
    key: 'hardwares_firmware',
    label: 'Any hardware or firmware involved? (optional)',
    placeholder: 'e.g. IoT devices, POS terminals, embedded firmware — leave blank if none.',
    required: false,
  },
  {
    key: 'future_goals_or_deadlines',
    label: 'Any future goals or deadlines an AI should be aware of? (optional)',
    placeholder: 'A launch date, a target, a deadline that matters.',
    required: false,
    multiline: true,
  },
  {
    key: 'things_missing_to_ask',
    label: "What haven't we asked that we should have? (optional)",
    placeholder: 'Anything this form missed about your business.',
    required: false,
    multiline: true,
  },
  {
    key: 'who_is_writing_and_reliability',
    label: 'Who is answering these questions, and how reliable is what they know? (optional)',
    placeholder: 'e.g. Founder, first-hand and current — or an assistant working from old notes.',
    required: false,
  },
  {
    key: 'anything_else',
    label: 'Anything else worth knowing? (optional)',
    placeholder: 'Whatever comes to mind.',
    required: false,
    multiline: true,
  },
];

// The premade prompt a founder can hand to their own AI or developer instead
// of typing every field by hand. Deliberately factual-only - the same
// discipline the rest of this app applies to itself (see main.py's business
// context comment: "No synthetic or pre-filled data").
const buildPremadePrompt = (): string => {
  const lines = QUESTIONS.map((q) => `${q.key}: ""  # ${q.label.replace(/\s*\(optional\)$/, '')}`);
  return [
    '# Curatom business context — fill in what you can verify, leave the rest blank.',
    '# Kindly provide factual data you can verify; else leave blank.',
    '# Fields like countries_covered or key_associations can list more than one value',
    '# in the same string — as many times, locations, and at whatever scale applies.',
    '# Reply in this same YAML shape so it can be pasted straight back into Curatom.',
    '',
    ...lines,
  ].join('\n');
};

// Minimal parser for the flat "key: value" shape above - no nesting, no
// lists, because that's the only shape this form's prompt ever produces or
// expects back. Strips a trailing "# comment", surrounding quotes, and
// ignores blank/comment-only lines.
const parsePastedYaml = (text: string): Partial<BusinessContext> => {
  const result: Record<string, string> = {};
  const validKeys = new Set(QUESTIONS.map((q) => q.key as string));
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, rest] = match;
    if (!validKeys.has(key)) continue;
    const withoutComment = rest.replace(/\s+#.*$/, '').trim();
    const unquoted = withoutComment.replace(/^["']|["']$/g, '');
    if (unquoted) result[key] = unquoted;
  }
  return result as Partial<BusinessContext>;
};

interface Props {
  initial?: BusinessContext | null;
  onSaved: (ctx: BusinessContext) => void;
}

export const BusinessContextForm: React.FC<Props> = ({ initial, onSaved }) => {
  const [values, setValues] = useState<Partial<BusinessContext>>(initial || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [imageExtracting, setImageExtracting] = useState(false);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // First run shows only the 5 fields that actually gate saving - the other
  // 17 are optional both here and in the backend's BusinessContextPayload,
  // but rendering all 22 at once read as "fill this whole form before you
  // can use the dashboard," which it never technically was. Editing an
  // existing context still shows everything, since by then there's real
  // content in those optional fields worth seeing and adjusting.
  const [showOptional, setShowOptional] = useState(!!initial);
  const optionalCount = QUESTIONS.filter((q) => !q.required).length;

  const update = (key: keyof BusinessContext, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPremadePrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Clipboard access was denied. Copy the text manually from a secure browser context.');
    }
  };

  const handleApplyPaste = () => {
    const parsed = parsePastedYaml(pasteText);
    if (Object.keys(parsed).length === 0) {
      setPasteMessage('Nothing recognizable in that text — check it matches the field: value shape.');
      return;
    }
    setValues((v) => ({ ...v, ...parsed }));
    setPasteMessage(`Filled in ${Object.keys(parsed).length} field(s) below — review before saving.`);
    setPasteText('');
  };

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageExtracting(true);
    setImageMessage(null);
    try {
      const res = await api.extractContextFromImage(file);
      const count = Object.keys(res.extracted).length;
      if (count === 0) {
        setImageMessage("Couldn't make out anything usable in that photo — try a clearer shot, or type it in below.");
        return;
      }
      setValues((v) => ({ ...v, ...res.extracted }));
      setImageMessage(`Filled in ${count} field(s) below from the photo — review before saving.`);
    } catch (e: any) {
      setImageMessage(`Could not read that photo: ${e.message}`);
    } finally {
      setImageExtracting(false);
    }
  };

  const missingRequired = QUESTIONS.filter((q) => q.required && !values[q.key]?.toString().trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingRequired.length > 0) {
      setError(`A couple of these still need an answer: ${missingRequired.map((q) => q.label).join(', ')}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Only what this form actually owns - `values` also carries whatever
      // metadata (org_id, tenant_id, created_at, updated_at) rode in on
      // `initial` when editing an existing context. The backend silently
      // discards unknown fields, so this was harmless, but there's no
      // reason for a form to send fields it doesn't ask about or use.
      const payload = Object.fromEntries(
        QUESTIONS.map((q) => [q.key, values[q.key] ?? '']).filter(([, v]) => v !== '')
      ) as BusinessContext;
      const res = await api.setBusinessContext(payload);
      onSaved(res.context);
    } catch (e: any) {
      setError(e.message || 'Could not save — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-24">
      <div>
        <h1 className="font-display text-28 text-ink-primary">Tell Curatom about your business</h1>
        <p className="text-14 text-ink-secondary mt-6 font-prose leading-relaxed">
          No pre-filled demo data, no jargon to wade through — just answer these in your own words. Once you save,
          this is what every AI agent connected to Curatom checks before it acts on your behalf, so you only have
          to explain your business once instead of re-explaining it to every LLM you talk to.
        </p>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20 space-y-12">
        <p className="text-13 text-ink-primary font-medium">Write your heart out below, or hand this off instead</p>
        <p className="text-12 text-ink-secondary font-prose leading-relaxed">
          All options are always available. Copy a starter prompt for your own AI or developer to fill in — factual,
          verifiable answers only, blank where they don't know — then paste what comes back here. Or if it's easier
          to grab paper and a pen, photograph what you wrote and it'll read it straight into the form below.
        </p>
        <div className="flex flex-wrap gap-8">
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="flex items-center gap-6 px-12 py-7 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded text-12 font-mono transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy prompt for your AI/developer'}
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="flex items-center gap-6 px-12 py-7 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded text-12 font-mono transition-colors"
          >
            <FileInput size={13} /> {pasteOpen ? 'Hide paste-back box' : 'Paste their answer back in'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageExtracting}
            className="flex items-center gap-6 px-12 py-7 bg-surface-200 hover:bg-surface-300 text-ink-primary rounded text-12 font-mono transition-colors disabled:opacity-50"
          >
            {imageExtracting ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {imageExtracting ? 'Reading photo...' : 'Photograph handwritten notes'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={handleImageSelected}
          />
        </div>
        {imageMessage && <p className="text-11 text-ink-secondary font-prose">{imageMessage}</p>}
        {pasteOpen && (
          <div className="space-y-8 pt-4">
            <textarea
              className="w-full bg-surface-200 border border-surface-400 rounded p-10 text-12 text-ink-primary focus:border-accent outline-none font-mono"
              style={{ minHeight: '6rem' }}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the filled-in YAML here..."
            />
            <button
              type="button"
              onClick={handleApplyPaste}
              disabled={!pasteText.trim()}
              className="px-12 py-6 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded text-12 font-medium disabled:opacity-50"
            >
              Fill the form below from this
            </button>
            {pasteMessage && <p className="text-11 text-ink-secondary font-prose">{pasteMessage}</p>}
          </div>
        )}
      </div>

      <div className="space-y-20">
        {QUESTIONS.filter((q) => q.required || showOptional).map((q) => (
          <div key={q.key} className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-20">
            <label className="block text-14 text-ink-primary font-medium mb-10">
              {q.label}
              {!q.required && <span className="text-ink-secondary font-normal text-12"> (optional)</span>}
            </label>
            {q.multiline ? (
              <textarea
                className="w-full bg-surface-200 border border-surface-400 rounded p-12 text-13 text-ink-primary focus:border-accent outline-none h-24 font-prose leading-relaxed"
                style={{ minHeight: '4.5rem' }}
                value={values[q.key] || ''}
                onChange={(e) => update(q.key, e.target.value)}
                placeholder={q.placeholder}
              />
            ) : (
              <input
                className="w-full bg-surface-200 border border-surface-400 rounded p-12 text-13 text-ink-primary focus:border-accent outline-none font-prose"
                value={values[q.key] || ''}
                onChange={(e) => update(q.key, e.target.value)}
                placeholder={q.placeholder}
              />
            )}
          </div>
        ))}
        {!showOptional && (
          <button
            type="button"
            onClick={() => setShowOptional(true)}
            className="w-full text-13 text-accent hover:underline font-prose text-left"
          >
            + Add more detail ({optionalCount} more optional fields — none of this blocks saving)
          </button>
        )}
      </div>

      {error && (
        <div className="text-13 text-accent font-prose bg-surface-200 border border-surface-400 rounded-md p-12">
          ~ {error} ~
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full flex justify-center items-center gap-8 px-16 py-12 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md transition-colors text-14 font-medium disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        {initial ? 'Save changes' : 'Save and start using Curatom'}
      </button>
    </form>
  );
};
