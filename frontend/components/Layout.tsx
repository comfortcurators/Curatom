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
  Menu,
  X,
  ChevronDown,
  Wrench,
  Clock,
  Users,
  ScrollText,
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

const PRIMARY_NAV = [{ path: '/', icon: Sparkles, label: 'Overview' }];

const TECHNICAL_NAV = [
  { path: '/chat', icon: MessageSquare, label: 'Fleet Control Plane' },
  { path: '/fleets', icon: Layers, label: 'Fleet Topology' },
  { path: '/registry', icon: Network, label: 'Atom Registry' },
  { path: '/policies', icon: ShieldCheck, label: 'Policy Engine' },
  { path: '/memory', icon: Database, label: 'Memory Bank' },
  { path: '/directory', icon: BookOpen, label: 'Model Directory' },
  { path: '/feed', icon: Activity, label: 'Audit & Telemetry' },
  { path: '/decisions', icon: ScrollText, label: 'Decision Log' },
  { path: '/playground', icon: TerminalSquare, label: 'Proving Ground' },
  { path: '/task-worker-status', icon: Clock, label: 'Task Worker Status' },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [tenantId, setTenantId] = useState<string>(DEFAULT_TENANT_ID);
  const [principalName, setPrincipalName] = useState<string>('guest');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('curatom_technical_nav_open') === 'true';
    } catch {
      return false;
    }
  });

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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const toggleTechnical = () => {
    setTechnicalOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('curatom_technical_nav_open', String(next));
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };

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

  const primaryNav = role === 'Owner' ? [...PRIMARY_NAV, { path: '/team', icon: Users, label: 'Team' }] : PRIMARY_NAV;
  const isTechnicalActive = TECHNICAL_NAV.some((item) => item.path === location.pathname);
  const pageTitle =
    location.pathname === '/'
      ? 'Overview'
      : [...primaryNav, ...TECHNICAL_NAV].find((item) => item.path === location.pathname)?.label ||
        location.pathname.replace(/^\/+/, '').replace(/-/g, ' ');

  const sidebarContent = (
    <>
      <div className="p-24 border-b border-surface-300 flex items-start justify-between">
        <div>
          <h1 className="font-display text-24 font-light tracking-tight text-ink-primary">{APP_NAME}</h1>
          <p className="label-caps text-10 mt-4">{COMPANY_NAME}</p>
          <p className="mt-4 text-10 font-mono text-ink-secondary">{APP_VERSION}</p>
        </div>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden text-ink-secondary hover:text-ink-primary p-4 -mr-4"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <div className="px-16 py-12 border-b border-surface-300 bg-surface-200/50">
        <label className="text-10 font-mono text-ink-secondary uppercase tracking-wider block mb-4 flex items-center gap-4">
          <Building2 size={12} /> Bound Tenant Scope
        </label>
        <div className="text-12 font-mono text-ink-primary truncate">{tenantId}</div>
      </div>

      <nav className="flex-1 py-16 px-12 space-y-4 overflow-y-auto">
        {primaryNav.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-12 px-12 py-8 rounded-md transition-colors duration-150 ${
                isActive ? 'bg-surface-300 text-accent font-medium' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
              }`}
            >
              <Icon size={16} />
              <span className="text-13">{item.label}</span>
            </Link>
          );
        })}

        <div className="pt-12">
          <button
            onClick={toggleTechnical}
            className={`w-full flex items-center justify-between gap-8 px-12 py-8 rounded-md text-ink-secondary hover:bg-surface-200 hover:text-ink-primary transition-colors duration-150 ${
              isTechnicalActive ? 'text-ink-primary' : ''
            }`}
          >
            <span className="flex items-center gap-12">
              <Wrench size={16} />
              <span className="text-13">Technical</span>
            </span>
            <ChevronDown size={14} className={`transition-transform duration-150 ${technicalOpen ? 'rotate-180' : ''}`} />
          </button>
          <p className="px-12 pt-4 pb-2 text-10 text-ink-secondary font-prose leading-snug">
            Engineering detail, mostly for developers and AI agents.
          </p>

          {technicalOpen && (
            <div className="mt-4 space-y-4 border-l border-surface-300 ml-16 pl-8">
              {TECHNICAL_NAV.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-10 px-10 py-6 rounded-md transition-colors duration-150 ${
                      isActive ? 'bg-surface-300 text-accent font-medium' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="text-12">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
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
    </>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden font-ui text-ink-primary bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-surface-100 border-r border-surface-300 flex-col z-10 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface-100 border-r border-surface-300 flex flex-col shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 min-w-0">
        <header className="h-56 border-b border-surface-300 bg-surface-100/60 backdrop-blur-md flex items-center justify-between px-16 md:px-24 shrink-0">
          <div className="flex items-center gap-12 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden text-ink-secondary hover:text-ink-primary p-4 -ml-4 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h2 className="font-display text-15 text-ink-primary capitalize truncate">{pageTitle}</h2>
          </div>
          <div className="hidden sm:flex items-center gap-16 text-11 font-mono text-ink-secondary shrink-0">
            <span className="flex items-center gap-4 bg-surface-200 px-8 py-3 rounded border border-surface-300">
              <Globe size={12} className="text-accent" />
              <span>Tenant policy controls active</span>
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-16 md:p-24">
          <div className="max-w-6xl mx-auto h-full">{children}</div>

          {/* Compliance footer — full legal entity name, on every page. */}
          <footer className="max-w-6xl mx-auto mt-48 pt-24 border-t border-surface-300">
            <div className="flex flex-col gap-16 md:flex-row md:items-center md:justify-between">
              <p className="text-11 text-ink-secondary">
                © {new Date().getFullYear()} {LEGAL_NAME} · CIN {CIN}
              </p>
              <nav className="flex flex-wrap gap-x-20 gap-y-8">
                {COMPLIANCE_LINKS.map((link) => (
                  <Link key={link.to} to={link.to} className="text-11 text-ink-secondary hover:text-ink-primary transition-colors">
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
