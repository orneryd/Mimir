# Changelog

All notable changes to this project will be documented in this file.

This project adheres to "Keep a Changelog" and follows Semantic Versioning.

## [Unreleased]

- (no changes yet)

## [1.0.1] - 2025-12-12

### Added
- NornicDB server-side hybrid search support: pass string queries to `db.index.vector.queryNodes` so the server generates embeddings.

### Changed
- Fixed NornicDB fulltext/Hybrid LIMIT handling so `LIMIT` is respected by server-side queries.
- Standardized similarity semantics: both NornicDB and Neo4j return cosine similarity in the 0.0–1.0 range.
- Set default cosine similarity thresholds: NornicDB default min similarity = `0.5`, Neo4j default = `0.75`.
- Removed special-case quirk-handling code paths for NornicDB; unified search paths and updated inline comments.

### Fixed
- Tests and tooling:
  - Unit tests covering `UnifiedSearchService` (mocked) pass (19 tests).
  - Live integration tests (NornicDB) pass when enabled; these are opt-in via `RUN_LIVE_TESTS=true` (15 tests).

### Performance
- k-means clustering now runs on a 15-minute timer rather than on-trigger to avoid blocking operations.

### Files touched (high-level)
- `src/managers/UnifiedSearchService.ts` — NornicDB hybrid search, threshold and comments
- `src/api/chat-api.ts` — use NornicDB-specific threshold when initiating semantic searches
- `src/managers/GraphManager.ts` — comment cleanup
- `src/types/IGraphManager.ts` — comment cleanup
- `testing/nornicdb-live-integration.test.ts` — skip-by-default with `RUN_LIVE_TESTS`

---

Tagged as `v1.0.1` (annotated tag): "v1.0.1: additional nornicDB enhancements"

For full details, see the commits between `v1.0.0` and `v1.0.1`.

## [1.0.2] - 2025-12-14

### Added
- Added `CHANGELOG.md` at repository root for release history and guidance.

### Changed
- `src/api/chat-api.ts`: Use database-aware default for semantic similarity (NornicDB = 0.5, Neo4j = configured default) so server-side embeddings use the correct threshold.
- `testing/file-indexer-nornicdb.test.ts`: Mock improvements for `EmbeddingsService` exports and corrected expectations to match NornicDB behavior.

### Fixed
- Unit tests: fixed failing mocks and assertions; all relevant unit tests pass locally (including `file-indexer-nornicdb` tests).

### Misc
- Small tooling/test cleanup and formatting tweaks made while validating the changes.

---

