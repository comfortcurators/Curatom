# Curatom Enterprise Frontend rv0.2.0

React 18, React Router 7, TypeScript 7, and Vite 8 control-plane UI for
Curatom Enterprise. Node.js 20.19+ or 22.12+ is required.

The UI does not present autonomous task execution as active. The root task
screen states that durable execution is unavailable until a queue worker is
implemented and deployed. Rotated atom keys are held only in a masked,
one-time copy dialog, and the memory DSR control processes every subject linked
to a record.

## Run

```bash
npm ci
npm run dev
```

Production build (includes a strict TypeScript check):

```bash
npm run build
```

Set `VITE_API_BASE_URL` to the FastAPI service URL for non-local deployments.
Provider credentials are never injected into the browser bundle.
