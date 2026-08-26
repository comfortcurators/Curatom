import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Database, 
  Network, 
  BookOpen, 
  Activity, 
  MessageSquare, 
  LogOut,
  ShieldAlert, 
  Cpu, 
  TerminalSquare, 
  Globe, 
  Building2, 
  ShieldCheck, 
  Layers, 
  Sparkles,
} from 'lucide-react';
import { Role } from '../types';
import { APP_NAME, APP_VERSION, COMPANY_NAME, DEFAULT_TENANT_ID } from '../constants';

const LEGAL_NAME = 'Comfort Curators Private Limited';
const CIN = 'U47912HR2026PTC144195';

const COMPLIANCE_LINKS = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/ai-transparency', label: 'AI Transparency & Responsibility' },
  { to: '/help', label: 'Help & FAQ' },
  { to: '/documentation', label: 'Documentation' },
  { to: '/data-we-collect', label: 'Data We Collect' },
  { to: '/about', label: 'About Company' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [tenantId, setTenantId] = useState<string>(DEFAULT_TENANT_ID);
  const [principalName, setPrincipalName] = useState<string>('guest');

  useEffect(() => {
    const token = localStorage.getItem('curatom_session_token');
    const storedAtomKey = localStorage.getItem('curatom_atom_key');
    const storedRole = localStorage.getItem('curatom_role') as Role;
    const storedTenant = localStorage.getItem('curatom_tenant_id') || DEFAULT_TENANT_ID;
    const storedPrincipal = localStorage.getItem('curatom_principal_id') || 'guest';
    
    setTenantId(storedTenant);
    setPrincipalName(storedPrincipal);
    setRole(storedRole);
    setIsAgent(!!storedAtomKey);

    if (!token && !storedAtomKey && location.pathname !== '/reception') {
      navigate('/reception');
    }
  }, [location, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('curatom_session_token');
    localStorage.removeItem('curatom_role');
    localStorage.removeItem('curatom_atom_key');
    localStorage.removeItem('curatom_principal_id');
    navigate('/reception');
  };

  if (location.pathname === '/reception') {
    return <>{children}</>;
  }

  const navItems = [
    { path: '/', icon: Sparkles, label: 'Task Worker Status' },
    { path: '/chat', icon: MessageSquare, label: 'Fleet Control Plane' },
    { path: '/fleets', icon: Layers, label: 'Fleet Topology' },
    { path: '/registry', icon: Network, label: 'Atom Registry' },
    { path: '/policies', icon: ShieldCheck, label: 'Policy Engine' },
    { path: '/memory', icon: Database, label: 'Memory Bank' },
    { path: '/directory', icon: BookOpen, label: 'Model Directory' },
    { path: '/feed', icon: Activity, label: 'Audit & Telemetry' },
    { path: '/playground', icon: TerminalSquare, label: 'Proving Ground' },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden font-ui text-ink-primary bg-canvas">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-100 border-r border-surface-300 flex flex-col z-10 shrink-0">
        <div className="p-24 border-b border-surface-300">
          <h1 className="font-display text-24 font-light tracking-tight text-ink-primary">
            {APP_NAME}
          </h1>
          <p className="label-caps text-10 mt-4">
            {COMPANY_NAME}
          </p>
          <p className="mt-4 text-10 font-mono text-ink-secondary">{APP_VERSION}</p>
        </div>

        {/* Active Context */}
        <div className="px-16 py-12 border-b border-surface-300 bg-surface-200/50">
          <label className="text-10 font-mono text-ink-secondary uppercase tracking-wider block mb-4 flex items-center gap-4">
            <Building2 size={12} /> Bound Tenant Scope
          </label>
          <div className="text-12 font-mono text-ink-primary truncate">
            {tenantId}
          </div>
        </div>
        
        <nav className="flex-1 py-16 px-12 space-y-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-12 px-12 py-8 rounded-md transition-colors duration-150 ${
                  isActive 
                    ? 'bg-surface-300 text-accent font-medium' 
                    : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
                }`}
              >
                <Icon size={16} />
                <span className="text-13">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-16 border-t border-surface-300 bg-surface-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8 truncate max-w-[170px]">
              {isAgent ? (
                <Cpu size={16} className="text-accent shrink-0" />
              ) : (
                <ShieldAlert size={16} className="text-ink-secondary shrink-0" />
              )}
              <div className="truncate">
                <span className="text-11 text-ink-primary font-mono block truncate">{principalName}</span>
                <span className="text-10 text-ink-secondary font-mono block">{isAgent ? 'Agent Key' : role}</span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300 shrink-0"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
        <header className="h-56 border-b border-surface-300 bg-surface-100/60 backdrop-blur-md flex items-center justify-between px-24 shrink-0">
          <h2 className="font-display text-15 text-ink-primary capitalize">
            {location.pathname === '/' ? 'Task Worker Status' : location.pathname.replace(/^\/+/, '').replace(/-/g, ' ')}
          </h2>
          <div className="flex items-center gap-16 text-11 font-mono text-ink-secondary">
            <span className="flex items-center gap-4 bg-surface-200 px-8 py-3 rounded border border-surface-300">
              <Globe size={12} className="text-accent" />
              <span>Tenant policy controls active</span>
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-24">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>

          {/* Compliance footer — full legal entity name, on every page. */}
          <footer className="max-w-6xl mx-auto mt-48 pt-24 border-t border-surface-300">
            <div className="flex flex-col gap-16 md:flex-row md:items-center md:justify-between">
              <p className="text-11 text-ink-secondary">
                © {new Date().getFullYear()} {LEGAL_NAME} · CIN {CIN}
              </p>
              <nav className="flex flex-wrap gap-x-20 gap-y-8">
                {COMPLIANCE_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="text-11 text-ink-secondary hover:text-ink-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
};
