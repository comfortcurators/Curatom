from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException
from core.security import AuthContext, resolve_auth, is_classification_permitted
from services.repository import TenantScopedRepository

class PolicyEngine:
    @staticmethod
    async def evaluate(
        ctx: AuthContext,
        action: str,
        resource: str = "",
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        context = context or {}
        
        # 1. Classification ceiling check
        resource_classification = context.get("classification")
        if resource_classification:
            if not is_classification_permitted(ctx.classification_ceiling, resource_classification):
                return {
                    "allowed": False,
                    "deciding_policy_id": "pol_classification_ceiling",
                    "deciding_rule_name": "Classification Ceiling Enforcement",
                    "reason": f"Principal classification ceiling '{ctx.classification_ceiling}' is below resource classification '{resource_classification}'."
                }

        # 2. Residency region check
        resource_region = context.get("region")
        if resource_region and resource_region not in ctx.permitted_regions:
            return {
                "allowed": False,
                "deciding_policy_id": "pol_residency_boundary",
                "deciding_rule_name": "Data Residency Boundary Enforcement",
                "reason": f"Principal is permitted for {ctx.permitted_regions}, but resource resides in '{resource_region}'."
            }

        # 3. Technical Reviewer read-only rule
        if ctx.role == "Technical Reviewer" and not (action.endswith(".read") or action == "recall.execute"):
            return {
                "allowed": False,
                "deciding_policy_id": "pol_baseline_reviewer_readonly",
                "deciding_rule_name": "Technical Reviewer Read-Only Enforcement",
                "reason": "Technical Reviewer role is strictly restricted to read operations."
            }

        # 4. Auditor audit-only rule
        if ctx.role == "Auditor" and not action.startswith("audit.") and action != "directory.read":
            return {
                "allowed": False,
                "deciding_policy_id": "pol_baseline_auditor_restricted",
                "deciding_rule_name": "Auditor Audit-Only Enforcement",
                "reason": "Auditor role is restricted to audit and directory inspections."
            }

        # 5. Query Tenant Stored Policy Rules
        repo = TenantScopedRepository(ctx.org_id, ctx.tenant_id)
        policies = await repo.list_policies()
        
        matched_allow = None
        for p in policies:
            principals = p.get("principals", [])
            actions = p.get("actions", [])
            
            if ("*" in principals or ctx.role in principals or ctx.principal_id in principals) and ("*" in actions or action in actions):
                if p.get("effect") == "deny":
                    return {
                        "allowed": False,
                        "deciding_policy_id": p.get("policy_id"),
                        "deciding_rule_name": p.get("name"),
                        "reason": f"Explicit deny policy matched: {p.get('name')}"
                    }
                if p.get("effect") == "allow" and not matched_allow:
                    matched_allow = p

        if matched_allow:
            return {
                "allowed": True,
                "deciding_policy_id": matched_allow.get("policy_id"),
                "deciding_rule_name": matched_allow.get("name"),
                "reason": f"Policy rule matched: {matched_allow.get('name')}"
            }

        # 6. Baseline fallback for standard operational roles
        if ctx.role == "Owner":
            return {
                "allowed": True,
                "deciding_policy_id": "pol_baseline_owner",
                "deciding_rule_name": "Owner Administrative Clearance",
                "reason": "Owner role cleared for tenant operations."
            }
            
        if ctx.role in ["Tech Lead", "Software Designer"]:
            if action in ["atom.read", "atom.create", "atom.transition", "key.rotate", "memory.read", "memory.write", "recall.execute", "policy.read", "policy.simulate", "fleet.read", "directory.read", "directory.ingest", "decision.read", "decision.write"]:
                return {
                    "allowed": True,
                    "deciding_policy_id": f"pol_baseline_{ctx.role.lower().replace(' ', '_')}",
                    "deciding_rule_name": f"{ctx.role} Operational Clearance",
                    "reason": f"Standard operational clearance for {ctx.role}."
                }

        if ctx.principal_type == "agent" and action in ["recall.execute", "atom.read"]:
            return {
                "allowed": True,
                "deciding_policy_id": "pol_baseline_agent_recall",
                "deciding_rule_name": "Agent Operational Recall",
                "reason": "Active agent authorized for recall execution."
            }

        if action == "context.read":
            return {
                "allowed": True,
                "deciding_policy_id": "pol_baseline_context_read",
                "deciding_rule_name": "Business Context Readable By Any Authenticated Principal",
                "reason": "Any authenticated human or agent principal may read the tenant's business context - it exists specifically so an LLM or agent can ground itself in it before acting.",
            }

        if action == "decision.read":
            return {
                "allowed": True,
                "deciding_policy_id": "pol_baseline_decision_read",
                "deciding_rule_name": "Decision Log Readable By Any Authenticated Principal",
                "reason": "Any authenticated human or agent principal may read the tenant's decision log - a future decision should be able to weigh this company's own track record against a vendor's claim.",
            }

        # Default is Deny
        return {
            "allowed": False,
            "deciding_policy_id": None,
            "deciding_rule_name": "Default Deny Baseline",
            "reason": f"No explicit allow policy granted action '{action}' on resource '{resource}'."
        }

def authorize(
    action: str,
    resource: str = "",
    context: Optional[Dict[str, Any]] = None,
):
    async def _dependency(ctx: AuthContext = Depends(resolve_auth)):
        decision = await PolicyEngine.evaluate(ctx, action, resource, context)
        if not decision["allowed"]:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "policy_denied",
                    "action": action,
                    "deciding_policy_id": decision["deciding_policy_id"],
                    "reason": decision["reason"]
                }
            )
        return ctx
    return _dependency
