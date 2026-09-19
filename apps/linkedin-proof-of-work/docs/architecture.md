# Architecture — Proof-of-Work Profile

## Production target (blueprint §10)
- Next.js + GraphQL artifact-centric profile UI; Go/NestJS social/job APIs; dedicated
  verification service (Rust/Python) for cryptographic checks + evidence extraction
- PostgreSQL + graph DB for artifact→skill relationships; OpenSearch/Typesense recruiter
  search; pgvector artifact retrieval; S3 artifact metadata cache
- libsodium/OpenSSL signature validation: git commit verification, domain TXT checks,
  signed client attestations with revocation

## This scaffold
- Fastify + TypeScript, in-memory; the pipeline shape is production-faithful:
  submit -> verify (per-type checks) -> extract claims (verified only) -> evidence -> rank
- sha256 challenge/digests stand in for HTTPS fetches and HMAC-signed attestations;
  claim extraction is keyword/regex heuristics standing in for the NLP service
