# Architecture — Living Document Workspace

## Production target (blueprint §4)
- Next.js + TipTap/ProseMirror editor, Yjs multiplayer
- Rust/TS document service; Python AI workers; PostgreSQL + pgvector; Neo4j (or graph
  projection) for assertion/page links; Kafka + Temporal/BullMQ for version indexing + audits
- sentence-transformer embeddings + trained contradiction classifier; spaCy action/date extraction

## This scaffold
- Fastify + TypeScript, in-memory; deterministic heuristic assertion/contradiction logic
- Pairwise scan is O(n²) capped at 500 pairs — production uses vector retrieval to limit
  classifier work to semantically nearby assertions (blueprint: retrieval-first design)
- Alert records carry evidence + dedupe keys; that model is production-shaped already
