# Demo flow — linkedin-proof-of-work

Seeded: profile `prof_dana` (self-declares typescript, rust, design — no artifacts yet).

1. `curl localhost:4010/health`
2. Submit a genuinely-signed commit artifact:
   `curl -XPOST localhost:4010/profiles/prof_dana/artifacts -H 'content-type: application/json' \
     -d '{"artifactType":"github_commit","text":"Rebuilt the payments pipeline in TypeScript and Node, increasing throughput by 38% to 12k qps. Added Postgres advisory locks.","payload":{"repo":"acme/payments","sha":"d94f04d67b0e1ae5ad0b97a55d588dc70a7d0e0a","signatureVerified":true,"authorMatchesAccount":true}}'`
   — verified=true; claims extracted: skills (typescript, node, postgres), outcome (38%
   increase), scale (12000 qps)
3. Try to forge one: same call with `"signatureVerified":false`
   — artifact is created as **rejected** with failed checks; NO claims extracted
4. Live-API flow: `curl -XPOST localhost:4010/profiles/prof_dana/challenges -d '{"domain":"dana.dev"}' -H 'content-type: application/json'`
   then submit `live_api` with `payload:{"domain":"dana.dev","response":sha256("nonce:dana.dev")}` —
   wrong digest → rejected (spoofing a domain fails closed)
5. Client attestation: `payload:{"clientDomain":"northcap.com","clientEmail":"cto@northcap.com","projectRef":"p-9","signedBlob":sha256("northcap.com:cto@northcap.com:p-9")}`
6. `curl localhost:4010/profiles/prof_dana/recruiter-view`
   — evidence-backed skills ranked with outcomes; `design` sits in `unverifiedSelfDeclared`,
   never presented as fact
7. `curl localhost:4010/profiles/prof_dana/evidence-graph` — artifacts → claims → skills
