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
  Users,
  ScrollText,
  NotebookPen,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Role } from '../types';
import { APP_NAME, APP_VERSION, DEFAULT_TENANT_ID } from '../constants';
import { api } from '../api';

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

// Restructured from a flat Overview + "Technical" catch-all into named
// groups matching how a founder actually thinks about this app: your
// business, who has access (people and keys, kept separate), what changed,
// and — honestly labeled, not hidden behind a generic "Technical" — the
// long detail that's really for an AI agent or a developer, not you.
const PRIMARY_NAV = [{ path: '/', icon: Sparkles, label: 'Overview' }];

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  description?: string;
  items: { path: string; icon: React.ElementType; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'business',
    label: 'Business',
    icon: Building2,
    items: [{ path: '/sketchbook', icon: NotebookPen, label: 'Notepad' }],
  },
  {
    id: 'team',
    label: 'Team',
    icon: Users,
    items: [], // populated per-role below (Owner-only)
  },
  {
    id: 'keys',
    label: 'Keys',
    icon: Key,
    items: [{ path: '/registry', icon: Network, label: 'Atom Registry' }],
  },
  {
    id: 'changes',
    label: 'Changes',
    icon: Activity,
    items: [
      { path: '/feed', icon: Activity, label: 'Audit & Telemetry' },
      { path: '/decisions', icon: ScrollText, label: 'Decision Log' },
    ],
  },
  {
    id: 'jargon',
    label: 'Technical',
    icon: Wrench,
    description: "The detail an AI agent or a developer works with directly. Each page has a plain-English explanation if you want it — look for \"What does this mean?\"",
    items: [
      { path: '/chat', icon: MessageSquare, label: 'Fleet Control Plane' },
      { path: '/fleets', icon: Layers, label: 'Fleet Topology' },
      { path: '/policies', icon: ShieldCheck, label: 'Policy Engine' },
      { path: '/memory', icon: Database, label: 'Memory Bank' },
      { path: '/directory', icon: BookOpen, label: 'Model Directory' },
      { path: '/playground', icon: TerminalSquare, label: 'Proving Ground' },
    ],
  },
];

const ALL_NAV_ITEMS = [...PRIMARY_NAV, ...NAV_GROUPS.flatMap((g) => g.items), { path: '/team', icon: Users, label: 'Team' }];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [tenantId, setTenantId] = useState<string>(DEFAULT_TENANT_ID);
  const [tenantName, setTenantName] = useState<string>('');
  const [principalName, setPrincipalName] = useState<string>('guest');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop-only rail collapse - mobile's off-canvas nav has no room
  // problem to solve, this is purely for a founder who wants the sidebar
  // out of the way on their own screen. Persisted per-browser like the
  // group open/closed state above.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('curatom_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('curatom_sidebar_collapsed', next ? '1' : '0');
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('curatom_nav_open_groups');
      if (stored) return JSON.parse(stored);
    } catch {
      /* ignore parse/storage failures */
    }
    // Business, Team and Keys open by default - the day-to-day ones.
    // Jargon (and Changes) start collapsed, matching the old "Technical"
    // default, since that's the detail most people never need to open.
    return { business: true, team: true, keys: true, changes: false, jargon: false };
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
    const token = localStorage.getItem('curatom_session_token');
    const storedAtomKey = localStorage.getItem('curatom_atom_key');
    if (!token && !storedAtomKey) return;
    api.getTenants()
      .then((tenants) => setTenantName(tenants[0]?.name || ''))
      .catch(() => setTenantName(''));
  }, [location.pathname === '/team']);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('curatom_nav_open_groups', JSON.stringify(next));
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

  const visibleGroups = NAV_GROUPS.map((g) =>
    g.id === 'team' && role === 'Owner'
      ? { ...g, items: [{ path: '/team', icon: Users, label: 'Team' }] }
      : g
  ).filter((g) => g.id !== 'team' || role === 'Owner');
  const pageTitle =
    location.pathname === '/'
      ? 'Overview'
      : ALL_NAV_ITEMS.find((item) => item.path === location.pathname)?.label ||
        location.pathname.replace(/^\/+/, '').replace(/-/g, ' ');

  const sidebarContent = (
    <>
      <div className="p-24 border-b border-surface-300 flex items-start justify-between">
        <div>
          <h1 className="font-display text-24 font-light tracking-tight text-ink-primary">{APP_NAME}</h1>
          <p className="mt-4 text-10 font-mono text-ink-secondary">{APP_VERSION}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={toggleSidebarCollapsed}
            className="hidden md:block text-ink-secondary hover:text-ink-primary p-4 rounded hover:bg-surface-300"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden text-ink-secondary hover:text-ink-primary p-4 -mr-4"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="px-16 py-12 border-b border-surface-300 bg-surface-200/50">
        <label className="text-10 font-mono text-ink-secondary uppercase tracking-wider block mb-4 flex items-center gap-4">
          <Building2 size={12} /> Workspace
        </label>
        <div className="text-12 text-ink-primary truncate font-prose" title={tenantId}>
          {tenantName || 'Workspace name not set'}
        </div>
      </div>

      <nav className="flex-1 py-16 px-12 space-y-4 overflow-y-auto">
        {PRIMARY_NAV.map((item) => {
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

        {visibleGroups.map((group) => {
          // A group holding exactly one item forced two clicks (expand,
          // then navigate) to reach one page, and read as two sections for
          // what's really one destination - "Team" containing only "Team",
          // "Keys" containing only "Atom Registry". Render it as a single
          // flat link instead, same as Overview above. Only a group with
          // more than one real destination earns the expand/collapse.
          if (group.items.length === 1) {
            const item = group.items[0];
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={group.id}
                to={item.path}
                className={`flex items-center gap-12 px-12 py-8 rounded-md transition-colors duration-150 mt-12 ${
                  isActive ? 'bg-surface-300 text-accent font-medium' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
                }`}
              >
                <Icon size={16} />
                <span className="text-13">{item.label}</span>
              </Link>
            );
          }
          const isOpen = !!openGroups[group.id];
          const isGroupActive = group.items.some((item) => item.path === location.pathname);
          const GroupIcon = group.icon;
          return (
            <div key={group.id} className="pt-12">
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center justify-between gap-8 px-12 py-8 rounded-md text-ink-secondary hover:bg-surface-200 hover:text-ink-primary transition-colors duration-150 ${
                  isGroupActive ? 'text-ink-primary' : ''
                }`}
              >
                <span className="flex items-center gap-12">
                  <GroupIcon size={16} />
                  <span className="text-13">{group.label}</span>
                </span>
                <ChevronDown size={14} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {group.description && (
                <p className="px-12 pt-4 pb-2 text-10 text-ink-secondary font-prose leading-snug">
                  {group.description}
                </p>
              )}

              {isOpen && (
                <div className="mt-4 space-y-4 border-l border-surface-300 ml-16 pl-8">
                  {group.items.map((item) => {
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
    </>
  );

  // Collapsed rail: every real destination stays one click away (a
  // single-item group navigates directly, a multi-item group expands the
  // full sidebar back and opens that group) rather than hiding pages
  // behind a rail that only shows icons for icons' sake.
  const collapsedRail = (
    <>
      <div className="p-16 border-b border-surface-300 flex items-center justify-center">
        <button
          onClick={toggleSidebarCollapsed}
          className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
      </div>
      <nav className="flex-1 py-12 px-8 space-y-4 overflow-y-auto flex flex-col items-center">
        {PRIMARY_NAV.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.label}
              className={`flex items-center justify-center w-36 h-36 rounded-md transition-colors duration-150 ${
                isActive ? 'bg-surface-300 text-accent' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
              }`}
            >
              <Icon size={16} />
            </Link>
          );
        })}
        <div className="w-full border-t border-surface-300 my-8" />
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          if (group.items.length === 1) {
            const item = group.items[0];
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={group.id}
                to={item.path}
                title={item.label}
                className={`flex items-center justify-center w-36 h-36 rounded-md transition-colors duration-150 ${
                  isActive ? 'bg-surface-300 text-accent' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
                }`}
              >
                <Icon size={16} />
              </Link>
            );
          }
          const isGroupActive = group.items.some((item) => item.path === location.pathname);
          return (
            <button
              key={group.id}
              onClick={() => {
                setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
                toggleSidebarCollapsed();
              }}
              title={`${group.label} — expand sidebar`}
              className={`flex items-center justify-center w-36 h-36 rounded-md transition-colors duration-150 ${
                isGroupActive ? 'text-accent' : 'text-ink-secondary hover:bg-surface-200 hover:text-ink-primary'
              }`}
            >
              <GroupIcon size={16} />
            </button>
          );
        })}
      </nav>
      <div className="p-12 border-t border-surface-300 bg-surface-100 flex justify-center">
        <button
          onClick={handleLogout}
          className="text-ink-secondary hover:text-ink-primary transition-colors p-6 rounded hover:bg-surface-300"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden font-ui text-ink-primary bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex bg-surface-100 border-r border-surface-300 flex-col z-10 shrink-0 transition-all duration-150 ${
          sidebarCollapsed ? 'w-56' : 'w-64'
        }`}
      >
        {sidebarCollapsed ? collapsedRail : sidebarContent}
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
              <span>{tenantName || 'Workspace name not set'}</span>
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-16 md:p-24">
          <div className="max-w-6xl mx-auto min-h-full">{children}</div>

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
