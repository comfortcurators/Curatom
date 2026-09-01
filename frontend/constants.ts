export const APP_NAME = "Curatom Enterprise";
export const APP_VERSION = "rv0.3.0";
export const COMPANY_NAME = "Comfort Curators";
export const COMPANY_LEGAL_NAME = "Comfort Curators Private Limited";
export const GEMINI_MODEL = "gemini-3.5-flash";
// Same-origin deployment (frontend served by the backend) sets
// VITE_API_BASE_URL="" deliberately, so `||` (which treats "" as falsy)
// would wrongly fall back to localhost. Only fall back when the var is
// genuinely unset (dev with no .env), using PROD to distinguish the two.
const _apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
export const API_BASE_URL =
  _apiBase !== undefined ? _apiBase : ((import.meta as any).env?.PROD ? "" : "http://localhost:8000");
export const DEFAULT_ORG_ID = "org_comfort_curators";
export const DEFAULT_TENANT_ID = "tenant_apac_enterprise";
