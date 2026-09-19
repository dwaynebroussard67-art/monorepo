# Downloadable archives

Archives are generated from the repository root with `make zip`.

- `<foldername>-complete.zip` — full portfolio workspace: all 10 apps, shared monorepo
  packages, docs, previews, CI, and infrastructure helper files. The archive name follows
  the cloned folder name (e.g. `monorepo-complete.zip`). Its sha256 is printed by the target.
- `SHA256SUMS.txt` — running log of checksums for previously generated archives.

## Included in the full archive
- all 10 app folders under `apps/`
- shared packages under `packages/`
- `10_disruptor_blueprints.md`, `MASTER_CODE_SCHEMATICS.md`
- root docs (`README.md`, `STATUS.md`, `RUNBOOK.md`, `SECURITY_BASELINE.md`, `DOWNLOADS.md`)
- `docs/`, `infrastructure/`, `.github/workflows/`, `scripts/`
- `preview/index.html`

Excluded: `.git/`, `node_modules/`, `.turbo/`, prior zips.
