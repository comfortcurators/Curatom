# COMFORT CURATORS PRIVATE LIMITED — SYNTHETIC ENTERPRISE FIXTURE
# NOTICE: All metrics, employee counts, global property listings, booking surges,
# and internal engine names in this file are strictly fabricated for testing
# multi-agent fleet memory retrieval and describe no real company, entity, or person.

from typing import List, Dict, Any

def get_synthetic_fixture_records(org_id: str, tenant_id: str) -> List[Dict[str, Any]]:
    records = []
    
    # 1. Base Core Enterprise Architecture Specs
    base_specs = [
        (
            "Architecture_Scale_Topology", 
            "SG", 
            "internal", 
            (
                "Comfort Curators Global Topology: Holding company with 18 operating subsidiaries across 7 countries. "
                "14,200 total employees (4,800 engineers, 5,100 operations, 2,300 sales/marketing, 2,000 corporate). "
                "187M registered travellers across 92 countries, 34 languages (real-time AI translation for 12), 87 currencies. "
                "4.2M accommodation listings (hotels, homestays, villas, resorts), 18.7M bookable units, 850K hosts. "
                "2.8M bookings/day (peak: 6.1M/day during holiday surges), $48B USD projected annual bookings. "
                "Multi-cloud mesh: AWS primary (10+ PB S3, RDS, MSK Kafka), Google Cloud (Vertex AI, BigQuery, Firestore native vectors, Cloud Run), "
                "Alibaba Cloud Shanghai (PolarDB, ECS). 2,300+ microservices, 500+ deployments/day, 42B Kafka events/day."
            )
        ),
        (
            "Internal_Platforms_Core_Engines", 
            "US", 
            "internal",
            (
                "Comfort Curators In-House DeepTech Platform Suite: "
                "Kraken (API Gateway + Service Mesh, routes 850M req/day across 2,300 microservices), "
                "Mussel (Petabyte-scale distributed KV store, 3.2 PB, 500K ops/sec), "
                "Viaduct (Unified GraphQL data access layer, 1.2M lines of code, 500+ contributors/month), "
                "Helios (Real-time dynamic pricing & yield optimization engine, 2.8M price updates/minute), "
                "Aether (AI/ML feature store & model registry, 450 production models, 12K features, 800ms staleness SLA), "
                "Nexus (Distributed event-driven orchestration, 42B events/day ingested), "
                "Titan (Real-time fraud & anomaly scoring on every transaction, <50ms latency, 99.97% accuracy), "
                "Hermes (Notification & messaging fabric, 8M messages/day in 34 languages)."
            )
        ),
        (
            "Compliance_GDPR_Isolation", 
            "EU", 
            "confidential",
            (
                "European Union GDPR Perimeter Mandates: PII tokens for EU/UK residents must reside strictly in AWS eu-west-1 London "
                "and never transit outside European data boundaries without irreversible pseudonymization. "
                "Subject Access Request (SAR) and Right-to-Erasure execution SLA: strict 24 hours. "
                "DPO verification contact: data-privacy@comfort-curators.test."
            )
        ),
        (
            "Compliance_PIPL_Localization", 
            "CN", 
            "restricted",
            (
                "China Data Sovereignty & PIPL Protocol: Mainland Chinese citizen booking data, payment credentials (WeChat Pay / Alipay), "
                "and user identity verification must remain strictly within Alibaba Cloud mainland China perimeter (Shanghai region). "
                "Cross-border transmission is strictly blocked at the Kraken API Gateway layer."
            )
        ),
        (
            "MultiComponent_Booking_Workflow", 
            "IN", 
            "internal",
            (
                "Multi-Component Booking Execution Path: Coordinates 9 agent roles (Search, Inventory, Pricing, Loyalty, Payment, "
                "Fraud, Booking, Notification, Curatom Memory) spanning 200+ microservices with a strict 2.5-second end-to-end SLA budget. "
                "Integrates Amadeus & Sabre GDS for 850K flight queries/day, Hotelbeds & RateHawk across 4.2M properties, "
                "and Stripe/Adyen/Razorpay across 87 currencies."
            )
        ),
        (
            "Host_Onboarding_Risk_Verification", 
            "IN", 
            "confidential",
            (
                "Host Hub Verification Pipeline: Automated onboarding for 850K hosts. "
                "Executes Aadhaar/PAN/Passport KYC, property deed & utility validation, bank payout verification, "
                "global sanctions screening, and AI image analysis on property photos to detect fraudulent stock imagery. "
                "SLA: 99.4% automated clearance in <3 minutes."
            )
        ),
        (
            "Corporate_Travel_Management_B2B", 
            "UK", 
            "internal",
            (
                "Curator Business Enterprise Workflow: Manages corporate travel for 2.1M business travellers. "
                "Enforces SAP Concur and Amex GBT Egencia travel policy rules, department budget caps, manager approval hierarchies, "
                "and auto-categorized expense report generation."
            )
        )
    ]
    
    for i, (topic, reg, cls, content) in enumerate(base_specs):
        records.append({
            "id": f"{tenant_id}_mem_core_{i:03d}",
            "org_id": org_id,
            "tenant_id": tenant_id,
            "region": reg,
            "topic": topic,
            "classification": cls,
            "content": content,
            "metadata": {
                "source_query": "Automated Enterprise Model Seed",
                "domain": "Enterprise Architecture",
                "tags": ["synthetic_fixture", "comfort_curators", "scale", reg.lower()],
                "subject_ids": [f"subj_enterprise_{i}"]
            },
            "source": "synthetic_fixture"
        })
        
    # 2. Procedurally generate additional multi-region test records (100 total)
    regions = ["SG", "US", "EU", "CN", "IN", "UK", "AU"]
    domains = ["Booking_Engine", "Trust_And_Safety", "Pricing_And_Yield", "Host_Payouts", "Inventory_Aggregation", "Fleet_Governance"]
    
    for idx in range(7, 107):
        reg = regions[idx % len(regions)]
        dom = domains[idx % len(domains)]
        records.append({
            "id": f"{tenant_id}_mem_shard_{idx:03d}",
            "org_id": org_id,
            "tenant_id": tenant_id,
            "region": reg,
            "topic": f"{dom}_Specification_Shard_{idx}",
            "classification": "confidential" if idx % 3 == 0 else "internal",
            "content": (
                f"Comfort Curators Operational Record #{idx} for {dom} in region {reg}. "
                f"Sustained throughput: {2500 + idx * 40} QPS via Kraken Gateway. "
                f"Data Subject Reference: traveller_{idx:04d}_{reg.lower()}@comfort-curators.test with phone +1-555-{idx:04d}."
            ),
            "metadata": {
                "source_query": f"Query shard {idx}",
                "domain": dom,
                "tags": ["synthetic_fixture", "load_test", reg.lower()],
                "subject_ids": [f"subj_traveller_{idx}_{reg.lower()}"]
            },
            "source": "synthetic_fixture"
        })
        
    return records
