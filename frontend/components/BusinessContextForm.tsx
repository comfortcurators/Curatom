import React, { useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
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
    key: 'anything_else',
    label: 'Anything else worth knowing? (optional)',
    placeholder: 'Whatever comes to mind.',
    required: false,
    multiline: true,
  },
];

interface Props {
  initial?: BusinessContext | null;
  onSaved: (ctx: BusinessContext) => void;
}

export const BusinessContextForm: React.FC<Props> = ({ initial, onSaved }) => {
  const [values, setValues] = useState<Partial<BusinessContext>>(initial || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof BusinessContext, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
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
      const res = await api.setBusinessContext(values as BusinessContext);
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

      <div className="space-y-20">
        {QUESTIONS.map((q) => (
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
      </div>

      {error && (
        <div className="text-13 text-accent font-prose bg-surface-200 border border-surface-400 rounded-md p-12">
          {error}
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
