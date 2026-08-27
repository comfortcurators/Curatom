export type Role = 'Owner' | 'Tech Lead' | 'Software Designer' | 'Technical Reviewer' | 'Auditor' | 'Agent';

export type ResidencyRegion = 'IN' | 'EU' | 'UK' | 'CN' | 'US' | 'SG' | 'AU';

export type AtomStatus = 'provisioning' | 'active' | 'suspended' | 'quarantined' | 'draining' | 'retired';
export type FleetStatus = 'active' | 'suspended' | 'draining' | 'retired';
export type PolicyEffect = 'allow' | 'deny';
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

export type TaskStatus = 'queued' | 'planning' | 'executing' | 'evaluating_policy' | 'completed' | 'failed' | 'paused';

export interface ChatOption {
  label: string;
  action: 'NAVIGATE' | 'SCENARIO' | string;
  target?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
  options?: ChatOption[];
  is_stale?: boolean;
  was_cached?: boolean;
  sources?: Array<{ uri: string; title?: string }>;
}

export interface TaskStep {
  step_number: number;
  title: string;
  assigned_specialist: string;
  action: string;
  input_params: Record<string, any>;
  policy_decision?: {
    allowed: boolean;
    policy_id: string | null;
    reason: string;
  };
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'denied';
  started_at?: string;
  completed_at?: string;
  latency_ms?: number;
  grounding_citations?: string[];
}

export interface AutonomousTask {
  task_id: string;
  org_id: string;
  tenant_id: string;
  principal_id: string;
  goal: string;
  status: TaskStatus;
  plan_summary: string;
  steps: TaskStep[];
  current_step_index: number;
  memory_references: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error?: string;
  final_result?: string;
  cost_tokens: number;
  subject_ids?: string[];
}

export interface TenantQuotas {
  requests_per_minute: number;
  recalls_per_day: number;
  embeddings_per_day: number;
  tokens_per_day: number;
  storage_bytes: number;
}

export interface TenantCostTracking {
  model_calls: number;
  tokens_consumed: number;
  embeddings_generated: number;
  estimated_cost_usd: number;
}

export interface Tenant {
  org_id: string;
  tenant_id: string;
  name: string;
  region: ResidencyRegion;
  created_at: string;
  quotas: TenantQuotas;
  costs: TenantCostTracking;
  halted: boolean;
}

export interface Fleet {
  org_id: string;
  tenant_id: string;
  fleet_id: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  default_profile: AtomProfile;
  residency_regions: ResidencyRegion[];
  created_at: string;
  status: FleetStatus;
}

export interface AtomProfile {
  format: string;
  retention_window_hours: number;
  accuracy_tolerance: string;
  system_persona: string;
  max_output_tokens: number;
  permitted_regions: ResidencyRegion[];
  classification_ceiling: DataClassification;
  version: number;
}

export interface Atom {
  org_id: string;
  tenant_id: string;
  fleet_id: string;
  id: string;
  name: string;
  model_family: string;
  role: string;
  description: string;
  labels: Record<string, string>;
  profile: AtomProfile;
  status: AtomStatus;
  last_seen: string;
  created_at: string;
}

export interface PolicyRule {
  policy_id: string;
  tenant_id: string;
  name: string;
  effect: PolicyEffect;
  principals: string[];
  actions: string[];
  resources: string[];
  conditions: {
    residency_regions?: ResidencyRegion[];
    classifications?: DataClassification[];
    atom_status?: AtomStatus[];
    source_fleets?: string[];
  };
  priority: number;
}

export interface MemoryMetadata {
  source_query: string;
  domain: string;
  tags: string[];
  pii_classes: string[];
  subject_ids: string[];
  provenance: {
    atom_id: string;
    fleet_id: string;
    timestamp: string;
  };
}

export interface Memory {
  org_id: string;
  tenant_id: string;
  id: string;
  topic: string;
  classification: DataClassification;
  region: ResidencyRegion;
  content_redacted: string;
  version: number;
  is_superseded: boolean;
  created_at: string;
  updated_at: string;
  metadata: MemoryMetadata;
  source: string;
}

export interface RecallLog {
  org_id: string;
  tenant_id: string;
  recall_id: string;
  request_id: string;
  atom_id: string;
  query: string;
  topic: string;
  response: string;
  raw_memory_excerpt: string;
  was_cached: boolean;
  was_reshaped: boolean;
  is_stale: boolean;
  staleness_overage_hours: number;
  grounding_sources: Array<{ uri: string; title: string }>;
  model_used: string;
  latency_ms: number;
  tokens_consumed: number;
  timestamp: string;
  token_metering_method?: 'cache' | 'exact' | 'estimated';
  dsr_purged?: boolean;
  subject_ids?: string[];
}

export interface DirectoryEntry {
  model_family: string;
  source: string;
  summary: string | null;
  capabilities: {
    context_window: number | null;
    supported_formats: string[];
    known_quirks: string[];
    rate_limits: string | null;
    license: string | null;
  };
  sources: Array<{ uri: string; title: string }>;
  fetched_at: string;
}

export interface DirectoryStatus {
  total_models: number;
  total_excerpts: number;
  is_ingesting: boolean;
  last_run: string | null;
  cache_hit_rate_pct: number;
  total_cache_hits: number;
  total_cache_lookups: number;
}

export interface TeamUser {
  username: string;
  role: Role;
  display_name: string;
  org_id: string;
  tenant_id: string;
  is_active: boolean;
  created_at: string;
}

export interface Decision {
  id: string;
  claim: string;
  decision: string;
  reasoning: string | null;
  recorded_by: string;
  recorded_at: string;
  outcome_summary: string | null;
  outcome_result: string | null;
  outcome_recorded_at: string | null;
  org_id: string;
  tenant_id: string;
}

export interface BusinessContext {
  business_name: string;
  what_you_do: string;
  customers: string;
  current_stack: string;
  priorities: string;
  constraints?: string;
  voice_and_tone?: string;
  anything_else?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  org_id: string;
  tenant_id: string;
  timestamp: string;
  action: string;
  resource: string;
  actor?: string;
  decision?: string;
  reason?: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  total_count?: number;
}

export interface PolicySimulationResult {
  allowed: boolean;
  deciding_policy_id: string | null;
  deciding_rule_name: string | null;
  reason: string;
}
