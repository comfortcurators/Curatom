import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, ShieldCheck, Database, Cpu, Radio, Lock } from 'lucide-react';

interface GcpProof {
  version?: string;
  google_cloud?: {
    running_on_cloud_run?: boolean;
    service?: string;
    revision?: string;
    project_id?: string;
    firestore?: string;
    vertex_ai?: boolean;
    model?: string;
    cloud_tasks_callback_configured?: boolean;
  };
  agent_framework?: {
    framework?: string;
    version?: string;
    agents?: string[];
  };
  hackathon?: {
    category?: string;
    required_model?: string;
  };
}

export const Architecture: React.FC = () => {
  const [proof, setProof] = useState<GcpProof | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/ops/gcp-proof')
      .then((r) => r.json())
      .then(setProof)
      .catch((e) => setError(e.message || 'Could not load live proof'));
  }, []);

  const gc = proof?.google_cloud;
  const fw = proof?.agent_framework;

  return (
    <div className="space-y-24 max-w-5xl mx-auto py-24 px-16">
      <div className="flex items-center justify-between gap-16">
        <a href="#/reception" className="text-12 font-mono text-ink-secondary hover:text-accent">
          ← Sign in
        </a>
        <p className="label-caps text-11">All Things Agentic · Fortified Enterprise Fleet</p>
      </div>
      <div className="border-b border-surface-300 pb-16">
        <h1 className="font-display text-32 text-ink-primary">Architecture</h1>
        <p className="text-13 text-ink-secondary mt-8 font-prose max-w-2xl">
          Curatom is a tenant-scoped agent registry with policy-aware, residency-enforced, grounded
          memory recall. The diagram below is the running system — not a slide. Live Google Cloud
          evidence is loaded from this same origin.
        </p>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-16 overflow-x-auto">
        <svg viewBox="0 0 960 560" className="w-full min-w-[720px]" role="img" aria-label="Curatom architecture on Google Cloud">
          <rect width="960" height="560" fill="#0a0a0c" />
          <text x="32" y="36" fill="#c7c7cc" fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="3">
            GOOGLE CLOUD · PROJECT {gc?.project_id || 'rajvansh'}
          </text>

          <rect x="32" y="56" width="200" height="88" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="48" y="84" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Operators / Agents</text>
          <text x="48" y="108" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Browser · Atom API key</text>
          <text x="48" y="126" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">HTTPS</text>

          <rect x="280" y="48" width="400" height="464" rx="12" fill="#1c1c1e" stroke="#48484a" />
          <text x="300" y="76" fill="#c7c7cc" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing="2">CLOUD RUN · curatom-backend</text>
          <text x="300" y="96" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="14">FastAPI + React (one service)</text>

          <rect x="300" y="120" width="360" height="70" rx="8" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="316" y="148" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Agent Gateway · Policy Engine</text>
          <text x="316" y="170" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Identity, classification, residency. Fail closed.</text>

          <rect x="300" y="206" width="360" height="88" rx="8" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="316" y="232" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Google ADK Fleet</text>
          <text x="316" y="254" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">gateway → memory_specialist → orchestrator</text>
          <text x="316" y="274" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">{fw?.framework || 'google-adk'} · gemini-3.5-flash</text>

          <rect x="300" y="310" width="170" height="70" rx="8" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="316" y="338" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="12">Memory Bank</text>
          <text x="316" y="358" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="11">Grounded recall</text>

          <rect x="490" y="310" width="170" height="70" rx="8" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="506" y="338" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="12">Agent Registry</text>
          <text x="506" y="358" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="11">Atoms · keys · lifecycle</text>

          <rect x="300" y="400" width="360" height="88" rx="8" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="316" y="428" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Audit + Telemetry</text>
          <text x="316" y="450" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Every mutating action. Recall logs separate.</text>
          <text x="316" y="470" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">OpenTelemetry-shaped request ids</text>

          <rect x="720" y="56" width="208" height="88" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="736" y="84" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Vertex AI</text>
          <text x="736" y="108" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Gemini 3.5 Flash</text>
          <text x="736" y="126" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">ADC · no API key</text>

          <rect x="720" y="168" width="208" height="88" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="736" y="196" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Firestore</text>
          <text x="736" y="220" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Docs + 768-d vectors</text>
          <text x="736" y="238" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">gemini-embedding-001</text>

          <rect x="720" y="280" width="208" height="88" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="736" y="308" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Cloud Tasks</text>
          <text x="736" y="332" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">Durable fleet runtime</text>
          <text x="736" y="350" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">/tasks/execute</text>

          <rect x="720" y="392" width="208" height="88" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="736" y="420" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Secret Manager</text>
          <text x="736" y="444" fill="rgba(245,245,247,.72)" fontFamily="Newsreader, serif" fontSize="12">JWT · demo · worker</text>
          <text x="736" y="462" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">never plaintext env</text>

          <path d="M232 100 H280" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M680 100 H720" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M680 212 H720" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M680 324 H720" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M680 436 H720" stroke="#c7c7cc" strokeWidth="1.2" />

          <text x="32" y="540" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">
            Comfort Curators Private Limited · AGPL-3.0-only · rv0.3.0
          </text>
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-16">
        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-12">
          <div className="flex items-center gap-8 text-ink-primary">
            <Cloud size={16} className="text-accent" />
            <h2 className="text-15 font-medium">Live Google Cloud proof</h2>
          </div>
          {error && <p className="text-13 text-accent font-prose">{error}</p>}
          {!proof && !error && <p className="text-13 text-ink-secondary font-mono">Loading /ops/gcp-proof…</p>}
          {gc && (
            <dl className="text-12 font-mono space-y-8 text-ink-secondary">
              <div className="flex justify-between gap-12"><dt>Cloud Run</dt><dd className="text-ink-primary">{gc.running_on_cloud_run ? 'yes' : 'this process is not on Cloud Run'}</dd></div>
              <div className="flex justify-between gap-12"><dt>Service</dt><dd className="text-ink-primary">{gc.service || '—'}</dd></div>
              <div className="flex justify-between gap-12"><dt>Revision</dt><dd className="text-ink-primary break-all text-right">{gc.revision || '—'}</dd></div>
              <div className="flex justify-between gap-12"><dt>Project</dt><dd className="text-ink-primary">{gc.project_id}</dd></div>
              <div className="flex justify-between gap-12"><dt>Firestore</dt><dd className="text-ink-primary">{gc.firestore}</dd></div>
              <div className="flex justify-between gap-12"><dt>Vertex AI</dt><dd className="text-ink-primary">{gc.vertex_ai ? 'ADC / keyless' : 'Developer API key'}</dd></div>
              <div className="flex justify-between gap-12"><dt>Model</dt><dd className="text-ink-primary">{gc.model}</dd></div>
              <div className="flex justify-between gap-12"><dt>Cloud Tasks</dt><dd className="text-ink-primary">{gc.cloud_tasks_callback_configured ? 'configured' : 'inline fallback'}</dd></div>
              <div className="flex justify-between gap-12"><dt>ADK</dt><dd className="text-ink-primary">{fw?.framework} {fw?.version}</dd></div>
            </dl>
          )}
          <a href="/ops/gcp-proof" className="text-12 font-mono text-accent underline" target="_blank" rel="noreferrer">
            Open raw JSON
          </a>
        </div>

        <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-24 space-y-14">
          <h2 className="text-15 font-medium text-ink-primary">Fleet mapping</h2>
          <ul className="space-y-10 text-13 font-prose text-ink-secondary">
            <li className="flex gap-10"><Radio size={14} className="text-accent mt-2 shrink-0" /> Discovery & lifecycle — Atom Registry</li>
            <li className="flex gap-10"><Cpu size={14} className="text-accent mt-2 shrink-0" /> Runtime — ADK orchestrator + Cloud Tasks</li>
            <li className="flex gap-10"><Database size={14} className="text-accent mt-2 shrink-0" /> Memory Bank — Firestore 768-d vectors</li>
            <li className="flex gap-10"><Lock size={14} className="text-accent mt-2 shrink-0" /> Identity — per-atom keys, human sessions</li>
            <li className="flex gap-10"><ShieldCheck size={14} className="text-accent mt-2 shrink-0" /> Gateway — route authorize() + residency</li>
          </ul>
          <Link to="/task-worker-status" className="text-12 font-mono text-accent underline">
            Run a durable fleet task →
          </Link>
        </div>
      </div>
    </div>
  );
};
