import React from 'react';
import { Clock, ShieldCheck } from 'lucide-react';

export const Missions: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto py-32">
      <div className="bg-surface-100 border border-surface-300 rounded-lg p-28 space-y-20">
        <div className="flex items-center gap-10">
          <Clock size={22} className="text-accent" />
          <div>
            <h1 className="font-display text-24 text-ink-primary">Durable task execution not deployed</h1>
            <p className="text-13 text-ink-secondary mt-4 font-prose">
              Curatom does not fabricate autonomous mission execution. The task API returns HTTP 501 until a durable Cloud Tasks/Pub/Sub worker is implemented and deployed.
            </p>
          </div>
        </div>

        <div className="p-16 bg-surface-200 border border-surface-300 rounded-md space-y-8">
          <div className="flex items-center gap-6 text-12 font-mono text-ink-primary">
            <ShieldCheck size={14} className="text-accent" /> Current boundary
          </div>
          <ul className="text-12 text-ink-secondary font-prose space-y-6 list-disc pl-18">
            <li>Planning code is not exposed as successful task execution.</li>
            <li>No task is marked queued or completed without a durable worker.</li>
            <li>Worker implementation must add retries, atomic status updates, dead-letter handling, and auditable completion evidence.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
