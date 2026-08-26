FROM node:20-alpine AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

RUN groupadd --system appuser && useradd --system --gid appuser appuser

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /fe/dist ./static
RUN chown -R appuser:appuser /app

USER appuser

# Cloud Run injects PORT at runtime (commonly 8080) and health-checks that
# port. Binding a hardcoded port makes the revision fail startup probes and
# roll back. Default to 8080 for local parity, but always honour $PORT.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
