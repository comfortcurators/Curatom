import React from 'react';
import { Link } from 'react-router-dom';
import { COMPANY_NAME, APP_NAME, GEMINI_MODEL } from '../constants';

const LEGAL_NAME = 'Comfort Curators Private Limited';
const CIN = 'U47912HR2026PTC144195';

const PageShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="max-w-2xl mx-auto pb-48">
    <p className="label-caps text-10 mb-8">{LEGAL_NAME}</p>
    <h1 className="font-display text-28 font-light text-ink-primary mb-24">{title}</h1>
    <div className="font-prose text-14 text-ink-secondary leading-relaxed space-y-16">
      {children}
    </div>
    <Link to="/" className="inline-block mt-32 text-12 text-accent hover:text-accent-hover">
      ← Back to {APP_NAME}
    </Link>
  </div>
);

export const PrivacyPolicy: React.FC = () => (
  <PageShell title="Privacy Policy">
    <p>
      This is not a generic legal template, and it is not drafted by a lawyer — it is an honest, plain description
      of what {APP_NAME}, operated by {LEGAL_NAME} (CIN {CIN}), actually does with your data, written by the people
      who wrote the code. If you need a document that carries legal weight rather than technical accuracy, that is
      still pending your own counsel; this page will link to it once it exists, rather than pretend to be it.
    </p>
    <p>
      <strong className="text-ink-primary">Who actually processes your data — no vaguer than this.</strong>{' '}
      It is basically Google, plus one vendor for email. Specifically:
    </p>
    <ul className="list-disc list-inside space-y-6">
      <li><strong className="text-ink-primary">Google Cloud Firestore</strong> — every record this app stores (business context, memories, atoms, audit logs, everything) lives here.</li>
      <li><strong className="text-ink-primary">Google Cloud Vertex AI (Gemini)</strong> — every AI-generated response, embedding, and vision extraction (like the photograph-your-notes onboarding path) is processed by Google's model, not ours.</li>
      <li><strong className="text-ink-primary">Google Cloud Run / Cloud Build</strong> — where this application's code actually runs and is built.</li>
      <li><strong className="text-ink-primary">Zoho ZeptoMail</strong> — the one non-Google vendor. Sends the account-verification emails; sees your email address and the verification code, nothing else.</li>
    </ul>
    <p>
      That is the complete list. There is no analytics vendor, no advertising pixel, no third party we haven't
      named above.
    </p>
    <p>
      <strong className="text-ink-primary">What we store.</strong> Principal
      identity (your login/agent-key identifier), tenant and organization
      scope, the content of memories you create, recall queries and their
      results, task records, and an audit log of the actions above. See
      "Data We Collect" for the full list.
    </p>
    <p>
      <strong className="text-ink-primary">Access control.</strong> Every
      route that reads or writes tenant data requires an authorization policy
      check. Memory and recall results are filtered by classification and
      region; a record with missing or unrecognized security metadata is
      excluded by default rather than shown.
    </p>
    <p>
      <strong className="text-ink-primary">Deletion.</strong> A subject
      erasure request removes every memory, cache entry, recall log, and task
      record linked to the erased identifier. This cascade is covered by an
      automated test in the codebase, not just documented as a promise.
    </p>
    <p>
      <strong className="text-ink-primary">What this policy does not yet
      cover.</strong> Backups and any logs Google or Zoho hold under their own
      retention schedules are outside this application's direct control and
      are governed by those providers' own terms — Google's and Zoho's, not
      ours to make promises about.
    </p>
    <p>
      Questions: <a href="mailto:mail@comfortcurators.in" className="text-accent hover:text-accent-hover">mail@comfortcurators.in</a>
    </p>
  </PageShell>
);

export const AITransparency: React.FC = () => (
  <PageShell title="AI Transparency & Responsibility">
    <p>
      {APP_NAME} uses Google's <span className="text-ink-primary">{GEMINI_MODEL}</span>{' '}
      model via Vertex AI for generation, embeddings, and task orchestration.
      This page states plainly what the model does and does not do inside
      this system.
    </p>
    <p>
      <strong className="text-ink-primary">Grounded, not free-form.</strong>{' '}
      Recall responses are backed by vector search against stored memories.
      An identifier, date, or figure that cannot be traced back to something
      actually read is not stated as fact by the system — it is either
      omitted or explicitly marked unsourced.
    </p>
    <p>
      <strong className="text-ink-primary">No autonomous spend or
      irreversible action without confirmation.</strong> Actions with real
      consequence require an explicit confirmation step; the model cannot
      trigger them unilaterally from a prompt alone.
    </p>
    <p>
      <strong className="text-ink-primary">Computation, not estimation.</strong>{' '}
      Arithmetic that matters is executed as code, not guessed by the
      language model, so a result can be checked against the calculation
      that produced it.
    </p>
    <p>
      <strong className="text-ink-primary">Known limitations.</strong>{' '}
      Personally identifiable information detection in this build is a
      pattern-based heuristic, not a trained classifier, and will miss cases
      a dedicated system would catch. We say this here rather than implying
      stronger guarantees than the current implementation provides.
    </p>
  </PageShell>
);

export const HelpFAQ: React.FC = () => (
  <PageShell title="Help & FAQ">
    <p>
      <strong className="text-ink-primary">What is {APP_NAME}?</strong> A
      tenant-scoped registry for AI agents ("atoms") with policy-aware,
      grounded memory recall.
    </p>
    <p>
      <strong className="text-ink-primary">I can't log in.</strong> Any
      business can register its own account and get its own isolated
      workspace — no invitation needed. If you already have one, confirm
      you're using the right username and password, or use your backup code
      to reset your password if you generated one.
    </p>
    <p>
      <strong className="text-ink-primary">Why was my recall result
      empty?</strong> Results are filtered by your classification ceiling
      and permitted regions. A record with security metadata that doesn't
      clear that check is withheld by design, not a bug.
    </p>
    <p>
      <strong className="text-ink-primary">Where do I report an issue?</strong>{' '}
      Open an issue on the{' '}
      <a href="https://github.com/comfortcurators/Curatom" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
        GitHub repository
      </a>, or email{' '}
      <a href="mailto:mail@comfortcurators.in" className="text-accent hover:text-accent-hover">mail@comfortcurators.in</a>.
    </p>
  </PageShell>
);

export const Documentation: React.FC = () => (
  <PageShell title="Documentation">
    <p>
      Full technical documentation lives in the source repository rather
      than duplicated here, so it never drifts out of sync with the code.
    </p>
    <ul className="list-disc list-inside space-y-8">
      <li>
        <a href="https://github.com/comfortcurators/Curatom" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          Source repository
        </a>
      </li>
      <li>
        <a href="https://github.com/comfortcurators/Curatom/blob/main/HARDENING_STATUS.md" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          Hardening status — what's proven vs. still a prototype
        </a>
      </li>
      <li>
        <a href="https://github.com/comfortcurators/Curatom/blob/main/VALIDATION.md" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          Validation record — test results, build output
        </a>
      </li>
      <li>
        <a href="https://zenodo.org/records/22112980" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          Zenodo archive (citable, versioned release)
        </a>
      </li>
      <li>
        <a href="/llms.txt" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          llms.txt — entry point for AI agents
        </a>
      </li>
      <li>
        <a href="/docs" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
          Interactive API docs (OpenAPI)
        </a>
      </li>
    </ul>
  </PageShell>
);

export const DataWeCollect: React.FC = () => (
  <PageShell title="Data We Collect">
    <p>A concrete list, matched to what the application's schema actually stores:</p>
    <ul className="list-disc list-inside space-y-8">
      <li><strong className="text-ink-primary">Identity</strong> — principal ID, role, tenant and organization scope. At registration: the email and (optionally) phone number you provide for your own business's tenant record.</li>
      <li><strong className="text-ink-primary">Business context</strong> — what you write in Curatom's onboarding questions about your business, kept as the authoritative record any connected AI reads from.</li>
      <li><strong className="text-ink-primary">Memories</strong> — the content, classification, and region you assign when creating a memory record.</li>
      <li><strong className="text-ink-primary">Recall activity</strong> — queries submitted and the results returned, logged for audit.</li>
      <li><strong className="text-ink-primary">Atoms (agents)</strong> — registration metadata and lifecycle transitions for agent identities.</li>
      <li><strong className="text-ink-primary">Sketchbooks</strong> — free-form notes any authenticated principal (human or agent) writes to their own isolated notebook. Content is visible only to its owner and the account Owner; everyone else sees only that an entry was written, by whom, and when.</li>
      <li><strong className="text-ink-primary">Audit log</strong> — actor, action, resource, and timestamp for every reachable action, including reads (recall queries, context and decision lookups), not just writes.</li>
      <li><strong className="text-ink-primary">Backup code / email verification code</strong> — only a one-way hash is stored, never the code itself, and each is time-limited and single-use.</li>
      <li><strong className="text-ink-primary">Session</strong> — a signed session token; no third-party analytics or advertising trackers are embedded in this application.</li>
    </ul>
    <p>
      We do not sell data. Data is used to operate the registry and recall
      features you directly use — nothing is collected for a purpose you
      wouldn't see reflected in the product itself.
    </p>
  </PageShell>
);

export const AboutCompany: React.FC = () => (
  <PageShell title="About the Company">
    <p>
      {APP_NAME} is built by <strong className="text-ink-primary">{LEGAL_NAME}</strong>{' '}
      (CIN {CIN}), a company recognised by the Government of India as a
      DeepTech startup (DPIIT recognition DIPP260899).
    </p>
    <p>
      The company's broader work is a governing runtime for AI-assisted
      operations — routing work across compute by cost and capability,
      keeping a checkable account of its own competence, and reducing
      compute cost on repeat work over time. {APP_NAME} is one deployable
      piece of that work: a tenant-scoped agent registry with grounded,
      policy-aware memory.
    </p>
    <p>
      Source is published under AGPL-3.0. See{' '}
      <a href="https://github.com/comfortcurators/Curatom" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
        the repository
      </a>{' '}
      for the code, and <Link to="/documentation" className="text-accent hover:text-accent-hover">Documentation</Link>{' '}
      for the rest.
    </p>
  </PageShell>
);
