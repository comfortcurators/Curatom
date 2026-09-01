import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, ShieldCheck, Database, Cpu, Radio, Lock, Activity, ArrowRight } from 'lucide-react';

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
  model_armor?: {
    engine?: string;
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
        <Link to="/reception" className="text-12 font-mono text-ink-secondary hover:text-accent">
          ← Sign in
        </Link>
        <p className="label-caps text-11">All Things Agentic · Fortified Enterprise Fleet</p>
      </div>
      <div className="border-b border-surface-300 pb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-16">
        <div>
          <h1 className="font-display text-32 text-ink-primary">Architecture</h1>
          <p className="text-13 text-ink-secondary mt-8 font-prose max-w-2xl">
            Curatom is a tenant-scoped agent registry with policy-aware, residency-enforced, grounded
            memory recall. The diagram below is the running system — not a slide. Live Google Cloud
            evidence is loaded from this same origin.
          </p>
        </div>
        <Link
          to="/reception?start=register"
          className="flex items-center justify-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md text-13 font-medium shrink-0"
        >
          Create a workspace <ArrowRight size={14} />
        </Link>
      </div>

      <div className="bg-surface-100 border border-surface-300 rounded-lg card-elevated p-16 overflow-x-auto">
        <svg viewBox="0 0 960 540" className="w-full min-w-[720px]" role="img" aria-label="Curatom architecture as it actually runs">
          <rect width="960" height="540" fill="#0a0a0c" />
          <text x="32" y="32" fill="#c7c7cc" fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="2.4">
            GOOGLE CLOUD · {gc?.project_id || 'rajvansh'} · WHAT ACTUALLY RUNS
          </text>

          <rect x="32" y="56" width="176" height="64" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="48" y="82" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Human</text>
          <text x="48" y="102" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">session JWT</text>

          <rect x="32" y="132" width="176" height="64" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="48" y="158" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Agent</text>
          <text x="48" y="178" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">X-Atom-Key</text>

          <rect x="248" y="56" width="428" height="368" rx="12" fill="#1c1c1e" stroke="#48484a" />
          <text x="268" y="80" fill="#c7c7cc" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing="1.8">CLOUD RUN · one service</text>
          <text x="268" y="100" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="14">FastAPI + React</text>
          <text x="268" y="118" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">{gc?.service || 'curatom-backend'} · {gc?.revision ? 'live' : 'us-central1'}</text>

          <rect x="268" y="136" width="388" height="44" rx="6" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="284" y="163" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">1  authorize() · JWT or atom key. No SSO.</text>

          <rect x="268" y="190" width="388" height="44" rx="6" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="284" y="217" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">2  Model Armor · our heuristic, not Google’s product</text>

          <rect x="268" y="244" width="388" height="44" rx="6" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="284" y="271" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">3  Policy + residency · 403 by name, never empty</text>

          <rect x="268" y="302" width="186" height="100" rx="6" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="284" y="326" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">REST</text>
          <text x="284" y="348" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">registry · memory</text>
          <text x="284" y="366" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">recall · decisions</text>
          <text x="284" y="384" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">all tenant-scoped</text>

          <rect x="466" y="302" width="190" height="100" rx="6" fill="#2c2c2e" stroke="#3a3a3c" />
          <text x="482" y="326" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Fleet</text>
          <text x="482" y="348" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">{fw?.framework || 'google-adk'} · one Agent</text>
          <text x="482" y="366" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">tools, not a chain</text>
          <text x="482" y="384" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="11">POST /tasks</text>

          <rect x="716" y="56" width="212" height="80" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="732" y="82" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Vertex AI</text>
          <text x="732" y="102" fill="rgba(245,245,247,.72)" fontFamily="Inter, sans-serif" fontSize="12">{gc?.model || 'gemini-3.5-flash'}</text>
          <text x="732" y="120" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">ADC · location=global</text>

          <rect x="716" y="148" width="212" height="80" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="732" y="174" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Firestore</text>
          <text x="732" y="194" fill="rgba(245,245,247,.72)" fontFamily="Inter, sans-serif" fontSize="12">docs + 768-d vectors</text>
          <text x="732" y="212" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">gemini-embedding-001</text>

          <rect x="716" y="240" width="212" height="80" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="732" y="266" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Cloud Tasks</text>
          <text x="732" y="286" fill="rgba(245,245,247,.72)" fontFamily="Inter, sans-serif" fontSize="12">POST /tasks/execute</text>
          <text x="732" y="304" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">
            {gc?.cloud_tasks_callback_configured ? 'callback configured' : 'else the request runs inline'}
          </text>

          <rect x="716" y="332" width="212" height="80" rx="8" fill="#1c1c1e" stroke="#3a3a3c" />
          <text x="732" y="358" fill="#f5f5f7" fontFamily="Inter, sans-serif" fontSize="13">Secret Manager</text>
          <text x="732" y="378" fill="rgba(245,245,247,.72)" fontFamily="Inter, sans-serif" fontSize="12">JWT · worker secret</text>
          <text x="732" y="396" fill="#9a988f" fontFamily="JetBrains Mono, monospace" fontSize="10">not plaintext env</text>

          <path d="M208 88 H248" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M208 164 H248" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M676 96 H716" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M676 188 H716" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M676 280 H716" stroke="#c7c7cc" strokeWidth="1.2" />
          <path d="M676 372 H716" stroke="#c7c7cc" strokeWidth="1.2" />

          <text x="32" y="456" fill="#c7c7cc" fontFamily="Inter, sans-serif" fontSize="12">Honest, not the slide.</text>
          <text x="32" y="478" fill="#9a988f" fontFamily="Inter, sans-serif" fontSize="12">SequentialAgent 429’d Vertex quota. Live fleet is one google-adk Agent holding gateway / memory / decision tools.</text>
          <text x="32" y="498" fill="#9a988f" fontFamily="Inter, sans-serif" fontSize="12">Model Armor is a regex/heuristic in-process. Jailbreak goals are denied before Gemini runs.</text>
          <text x="32" y="518" fill="#9a988f" fontFamily="Inter, sans-serif" fontSize="12">Task record is in Firestore first. Cloud Tasks is the CPU callback. If the queue is unbound, the same fleet runs inline.</text>
        </svg>
        <div className="flex flex-wrap gap-12 mt-16 text-12 font-mono">
          <a href="/kit/curatom-architecture.png" className="text-accent hover:underline" target="_blank" rel="noreferrer">Download PNG</a>
          <a href="/kit/curatom-architecture.svg" className="text-accent hover:underline" target="_blank" rel="noreferrer">Download SVG</a>
          <a href="/kit/curatom-product-overview.mp4" className="text-accent hover:underline" target="_blank" rel="noreferrer">Product overview (MP4)</a>
          <a href="/kit/curatom-overview-kit.zip" className="text-accent hover:underline" target="_blank" rel="noreferrer">Zip of all three</a>
        </div>
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
              <div className="flex justify-between gap-12"><dt>Model Armor</dt><dd className="text-ink-primary">{proof?.model_armor?.engine || 'curatom-model-armor'}</dd></div>
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
            <li className="flex gap-10"><Cpu size={14} className="text-accent mt-2 shrink-0" /> Runtime — one ADK Agent with specialist tools. SequentialAgent 429’d.</li>
            <li className="flex gap-10"><Database size={14} className="text-accent mt-2 shrink-0" /> Memory Bank — Firestore 768-d vectors</li>
            <li className="flex gap-10"><Lock size={14} className="text-accent mt-2 shrink-0" /> Identity — per-atom keys, human sessions</li>
            <li className="flex gap-10"><ShieldCheck size={14} className="text-accent mt-2 shrink-0" /> Gateway — route authorize() + residency</li>
            <li className="flex gap-10"><ShieldCheck size={14} className="text-accent mt-2 shrink-0" /> Model Armor — first-party heuristic, not Google’s product</li>
            <li className="flex gap-10"><Activity size={14} className="text-accent mt-2 shrink-0" /> Observability — reasoning chain on every fleet task</li>
          </ul>
          <div className="flex flex-wrap gap-8 pt-4">
            <Link
              to="/task-worker-status"
              className="flex items-center gap-8 px-16 py-10 bg-ink-primary hover:bg-ink-primary/90 text-canvas rounded-md text-13 font-medium"
            >
              Run a durable fleet task
            </Link>
            <Link
              to="/reception?start=register"
              className="px-16 py-10 border border-surface-400 hover:border-accent text-ink-secondary hover:text-accent rounded-md text-13 font-medium"
            >
              Create a workspace first
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
