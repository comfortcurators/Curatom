import { API_BASE_URL } from './constants';
import {
  Atom,
  AtomProfile,
  AuditLogEntry,
  BusinessContext,
  Decision,
  TeamUser,
  DirectoryEntry,
  DirectoryStatus,
  Memory,
  RecallLog,
  Tenant,
  Fleet,
  PendingApproval,
  SketchbookEntry,
  SketchbookActivity,
  PolicyRule,
  PolicySimulationResult,
  AutonomousTask,
  PaginatedResponse
} from './types';

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    const token = localStorage.getItem('curatom_session_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const atomKey = localStorage.getItem('curatom_atom_key');
    if (atomKey) {
      headers['X-Atom-Key'] = atomKey;
    }
    
    return headers;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      ...this.getHeaders(),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail?.message || error.detail || `HTTP ${response.status}: Request failed`);
    }

    return response.json();
  }

  // Auth
  login(username: string, password: string) {
    return this.request<{ session_token: string; role: string; tenant_id: string; org_id: string; principal_id: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }
    );
  }

  register(payload: { username: string; founder_name: string; business_name: string; email: string; phone?: string; password: string }) {
    return this.request<{
      session_token: string; role: string; tenant_id: string; org_id: string; principal_id: string;
      email_verified: boolean; verification_email_sent: boolean;
    }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  createRecoveryCode() {
    return this.request<{ recovery_code: string; warning: string }>('/auth/recovery-code', { method: 'POST' });
  }

  recoverAccount(payload: { username: string; recovery_code: string; new_password: string }) {
    return this.request<{ session_token: string; role: string; tenant_id: string; org_id: string; principal_id: string }>(
      '/auth/recover',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  verifyEmail(username: string, code: string) {
    return this.request<{ status: string; email_verified: boolean }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ username, code })
    });
  }

  resendVerification(username: string, email: string) {
    return this.request<{ status: string; verification_email_sent?: boolean }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ username, email })
    });
  }

  // Autonomous Taskmaster
  createTask(goal: string) {
    return this.request<{ task_id: string; status: string; plan: string; steps_count: number }>(
      '/tasks',
      {
        method: 'POST',
        body: JSON.stringify({ goal })
      }
    );
  }

  getTask(taskId: string) {
    return this.request<AutonomousTask>(`/tasks/${taskId}`);
  }

  listTasks(cursor?: string) {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    return this.request<PaginatedResponse<AutonomousTask>>(`/tasks?${query.toString()}`);
  }

  // Fleets & Topology
  getFleets(cursor?: string) { 
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    return this.request<PaginatedResponse<Fleet>>(`/fleets?${query.toString()}`); 
  }
  getFleetHealth(fleetId: string) { return this.request<any>(`/fleets/${fleetId}/health`); }
  getTenants() { return this.request<Tenant[]>('/tenants'); }
  renameTenant(name: string) {
    return this.request<{ tenant_id: string; name: string; org_id: string }>('/tenants', {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
  }

  // Atoms
  getAtoms(cursor?: string, limit: number = 50) { 
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    query.set('limit', limit.toString());
    return this.request<PaginatedResponse<Atom>>(`/atoms?${query.toString()}`); 
  }
  
  getAtom(id: string) { return this.request<Atom>(`/atoms/${id}`); }
  registerAtom(data: any) { 
    return this.request<{atom: Atom, api_key: string}>('/atoms/register', { 
      method: 'POST', 
      body: JSON.stringify(data),
      headers: { 'Idempotency-Key': `reg_${Date.now()}_${Math.random()}` }
    }); 
  }
  
  transitionAtom(id: string, transition: string, reason: string) {
    return this.request<{status: string}>(`/atoms/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ transition, reason })
    });
  }

  rotateKey(id: string) { return this.request<{api_key: string, grace_period_hours: number}>(`/atoms/${id}/keys/rotate`, { method: 'POST' }); }

  // Approval queue (approval-gated agent keys)
  getApprovals(status: string = 'pending') {
    return this.request<{ items: PendingApproval[] }>(`/approvals?status=${status}`);
  }
  approveAction(id: string) {
    return this.request<{ status: string }>(`/approvals/${id}/approve`, { method: 'POST' });
  }
  denyAction(id: string) {
    return this.request<{ status: string }>(`/approvals/${id}/deny`, { method: 'POST' });
  }

  // Sketchbooks
  writeSketchbook(topic: string, content: string) {
    return this.request<SketchbookEntry>('/sketchbook', { method: 'POST', body: JSON.stringify({ topic, content }) });
  }
  getOwnSketchbook() {
    return this.request<{ items: SketchbookEntry[] }>('/sketchbook');
  }
  getAllSketchbooks() {
    return this.request<{ items: SketchbookEntry[] }>('/sketchbook/all');
  }
  getSketchbookFeed() {
    return this.request<{ items: SketchbookActivity[] }>('/sketchbook/feed');
  }
  identifyAtom(data: any) { return this.request<{profile: AtomProfile, sources: any[], matched: boolean}>('/atoms/identify', { method: 'POST', body: JSON.stringify(data) }); }

  // Policies
  getPolicies() { return this.request<PolicyRule[]>('/policies'); }
  simulatePolicy(principal: string, action: string, resource: string, context?: any) {
    return this.request<PolicySimulationResult>('/policies/simulate', {
      method: 'POST',
      body: JSON.stringify({ principal, action, resource, context })
    });
  }

  // Directory (Global)
  getDirectory() { return this.request<DirectoryEntry[]>('/directory'); }
  getDirectoryStatus() { return this.request<DirectoryStatus>('/directory/status'); }
  ingestDirectory() { return this.request<{status: string}>('/directory/ingest', { method: 'POST' }); }

  // Memories
  getMemories(searchQuery?: string, cursor?: string, limit: number = 50) { 
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', limit.toString());
    return this.request<PaginatedResponse<Memory>>(`/memories?${params.toString()}`); 
  }
  
  createMemory(data: { topic: string; content: string; region: string; classification: string; subject_ids?: string[] }) {
    return this.request<{ id: string; status: string; pii_classes: string[] }>('/memories', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  invalidateMemory(id: string) { return this.request<{status: string}>(`/memories/${id}/invalidate`, { method: 'POST' }); }
  deleteMemory(id: string) { return this.request<{ status: string; memory_id: string }>(`/memories/${id}`, { method: 'DELETE' }); }
  deleteSubject(subjectId: string) {
    return this.request<{
      status: string;
      subject_id: string;
      deleted_memories_count: number;
      purged_cache_entries: number;
      purged_recall_logs: number;
      purged_task_records: number;
      verification_passed: boolean;
    }>(`/subjects/${encodeURIComponent(subjectId)}`, { method: 'DELETE' });
  }

  // Adaptive Recall
  recall(atom_id: string, memory_id: string, query: string) {
    return this.request<{
      raw_memory: string;
      response: string;
      is_stale: boolean;
      staleness_hours: number;
      latency_ms: number;
      was_cached: boolean;
      grounding_sources: any[];
      tokens_consumed: number;
      token_metering_method: 'cache' | 'exact' | 'estimated';
      request_id: string;
    }>('/recall', {
      method: 'POST',
      body: JSON.stringify({ atom_id, memory_id, query })
    });
  }

  // Observability & Audits
  getLogs(cursor?: string, limit: number = 50) { 
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', limit.toString());
    return this.request<PaginatedResponse<RecallLog>>(`/logs?${params.toString()}`); 
  }
  getAuditTrail(cursor?: string, limit: number = 50) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', limit.toString());
    return this.request<PaginatedResponse<AuditLogEntry>>(`/audit?${params.toString()}`);
  }

  // Business Context — the canonical answer to what this business is and
  // what any LLM or agent should know before acting on its behalf.
  getBusinessContext() {
    return this.request<{ onboarded: boolean; context: BusinessContext | null }>('/context');
  }

  setBusinessContext(payload: BusinessContext) {
    return this.request<{ onboarded: boolean; context: BusinessContext }>('/context', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // Team — real per-teammate accounts, Owner-managed.
  listUsers() {
    return this.request<TeamUser[]>('/users');
  }

  createUser(data: { username: string; password: string; role: string; display_name: string }) {
    return this.request<TeamUser>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  deactivateUser(username: string) {
    return this.request<{ status: string; username: string }>(`/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
  }

  // Decision Log — a claim-backed choice, and the real outcome tied back to it.
  createDecision(data: { claim: string; decision: string; reasoning?: string }) {
    return this.request<Decision>('/decisions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  listDecisions(cursor?: string, limit: number = 50) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', limit.toString());
    return this.request<PaginatedResponse<Decision>>(`/decisions?${params.toString()}`);
  }

  recordDecisionOutcome(decisionId: string, data: { outcome_summary: string; outcome_result: string }) {
    return this.request<Decision>(`/decisions/${encodeURIComponent(decisionId)}/outcome`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Unified Chat
  ask(query: string, context?: any) { 
    return this.request<any>('/ask', { 
      method: 'POST', 
      body: JSON.stringify({ query, context }) 
    }); 
  }
}

export const api = new ApiClient();
