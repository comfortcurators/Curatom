import React, { useState, useEffect } from 'react';
import { Layers, Activity, AlertCircle, Shield, CheckCircle2, Loader2, Play } from 'lucide-react';
import { api } from '../api';
import { Fleet } from '../types';

export const Fleets: React.FC = () => {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFleet, setSelectedFleet] = useState<Fleet | null>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    const fetchFleets = async () => {
      try {
        const res = await api.getFleets();
        setFleets(res.items);
        if (res.items.length > 0) {
          setSelectedFleet(res.items[0]);
          const h = await api.getFleetHealth(res.items[0].fleet_id);
          setHealth(h);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchFleets();
  }, []);

  const handleSelectFleet = async (f: Fleet) => {
    setSelectedFleet(f);
    try {
      const h = await api.getFleetHealth(f.fleet_id);
      setHealth(h);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-24">
      <div>
        <h1 className="font-display text-24 text-ink-primary">Fleet Topology & Governance</h1>
        <p className="text-13 text-ink-secondary mt-4 font-prose">
          Cohort-level configuration, residency boundaries, and lifecycle control across agent cohorts.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-48 text-ink-secondary">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
          <div className="lg:col-span-1 space-y-12">
            <h2 className="text-11 font-mono text-ink-secondary uppercase tracking-wider">Tenant Fleets</h2>
            {fleets.length === 0 && (
              <div className="text-center py-32 text-ink-secondary text-13 font-prose">
                No fleets yet. Connecting your first agent creates one automatically.
              </div>
            )}
            {fleets.map(f => (
              <div 
                key={f.fleet_id}
                onClick={() => handleSelectFleet(f)}
                className={`p-16 rounded-md border cursor-pointer transition-colors ${
                  selectedFleet?.fleet_id === f.fleet_id 
                    ? 'bg-surface-300 border-accent' 
                    : 'bg-surface-100 border-surface-300 hover:bg-surface-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-14 text-ink-primary">{f.name}</span>
                  <span className="text-10 font-mono px-6 py-2 bg-surface-400 rounded text-ink-secondary">
                    {f.status}
                  </span>
                </div>
                <div className="text-11 font-mono text-ink-secondary mt-6">{f.fleet_id}</div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-20">
            {selectedFleet && health && (
              <div className="bg-surface-100 border border-surface-300 rounded-lg p-20 space-y-20">
                <div className="flex justify-between items-start border-b border-surface-300 pb-16">
                  <div>
                    <h3 className="text-16 font-medium text-ink-primary font-display">{selectedFleet.name}</h3>
                    <p className="text-12 text-ink-secondary mt-2">{selectedFleet.description}</p>
                  </div>
                  <div className="flex gap-6">
                    {selectedFleet.residency_regions.map(r => (
                      <span key={r} className="text-10 font-mono px-6 py-2 bg-surface-300 border border-surface-400 rounded text-accent">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-16">
                  <div className="bg-surface-200 p-16 rounded border border-surface-300">
                    <span className="text-11 text-ink-secondary block font-mono">Active Atoms</span>
                    <span className="text-20 font-display text-ink-primary mt-4 block">{health.total_atoms}</span>
                  </div>
                  <div className="bg-surface-200 p-16 rounded border border-surface-300">
                    <span className="text-11 text-ink-secondary block font-mono">Error Rate</span>
                    <span className="text-20 font-display text-ink-primary mt-4 block">
                      {health.error_rate_pct === null || health.error_rate_pct === undefined ? (
                        <span className="text-13 text-ink-secondary font-prose">Not yet tracked</span>
                      ) : (
                        `${health.error_rate_pct}%`
                      )}
                    </span>
                  </div>
                  <div className="bg-surface-200 p-16 rounded border border-surface-300">
                    <span className="text-11 text-ink-secondary block font-mono">Status</span>
                    <span className="text-20 font-display text-accent mt-4 block capitalize">{selectedFleet.status}</span>
                  </div>
                </div>

                <div className="space-y-10 text-12">
                  <h4 className="font-mono text-11 text-ink-secondary uppercase tracking-wider">Default Inherited Profile</h4>
                  <div className="bg-surface-200 p-16 rounded border border-surface-400 space-y-6">
                    <div><span className="text-ink-secondary">Format:</span> <span className="text-ink-primary font-mono ml-4">{selectedFleet.default_profile.format}</span></div>
                    <div><span className="text-ink-secondary">Retention:</span> <span className="text-ink-primary font-mono ml-4">{selectedFleet.default_profile.retention_window_hours}h</span></div>
                    <div><span className="text-ink-secondary">Classification Ceiling:</span> <span className="text-ink-primary font-mono ml-4 uppercase">{selectedFleet.default_profile.classification_ceiling}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
