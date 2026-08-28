import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

// The "Jargon" nav group used to just tell a non-technical founder this
// whole section "isn't really for you" and leave it at that. Renamed to
// "Technical" (it genuinely is technical - an AI agent or a developer
// reads these pages directly), but the founder still needs a way in
// without wading through the technical framing. This is that way in:
// collapsed by default so it doesn't get in a technical reader's way,
// expandable for anyone who wants the plain-English version instead.
export const PlainExplain: React.FC<Props> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-6 text-11 font-mono text-ink-secondary hover:text-accent transition-colors"
      >
        <HelpCircle size={12} />
        What does this mean?
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-8 bg-surface-200 border border-surface-300 rounded-md p-14 text-13 text-ink-primary font-prose leading-relaxed max-w-2xl">
          {children}
        </div>
      )}
    </div>
  );
};
