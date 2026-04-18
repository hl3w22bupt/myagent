# Known Test Issues

Last updated: 2026-04-18

## TypeScript Compilation Errors (test suite failed to run)

These tests reference outdated types/interfaces after recent code changes.

| Test File | Issue |
|-----------|-------|
| `tests/unit/soul/soul-agent.test.ts` | `'object' \|\| 'string' \|\| 'null'` always truthy (TS2872) |
| `tests/unit/database/soul-notification-service.test.ts` | `SoulState` missing `activeSince` field (TS2741) |
| `tests/integration/soul/soul-primitives.test.ts` | `SoulState` missing `activeSince` field (TS2741) |
| `tests/unit/database/soul-data-service.test.ts` | `soulContextDataService` export renamed to `soulStateDataService` (TS2724) |
| `tests/unit/knowledge/retrieval-coordinator.test.ts` | `PostgresVectorStore()` constructor signature changed (TS2554) |
| `tests/unit/knowledge/datasource-manager.test.ts` | `Pool.mockImplementation` doesn't exist, mock approach needs update (TS2339) |

## Runtime Test Failures

| Test File | Issue |
|-----------|-------|
| `tests/integration/workflow/workflow-feedback-e2e.test.ts` | Suite fails to run, likely workflow engine refactor |
| `tests/unit/workflow/workflow-hitl*.test.ts` (8 tests) | HITL save/poll/action logic failures after workflow refactor |
| `tests/unit/workflow/workflow-retry*.test.ts` (6 tests) | Retry/backoff/jitter logic failures |
| `tests/unit/workflow/workflow-rollback*.test.ts` (2 tests) | Rollback logic failures |
| `tests/unit/agent/test-agent-mock.test.ts` | Skipped - incomplete mock, requires full environment |
| `tests/unit/skill/skill-discovery.test.ts` | Skill count mismatch after directory restructuring |
| `tests/integration/agent/agent-direct-execution.test.ts` | Agent execution timeout |

## Non-issue: Async Cleanup Warnings

`soul-scheduler.test.ts` and `soul-cleanup-service.test.ts` show "Cannot log after tests are done" warnings - async PostgreSQL connections not properly closed in test teardown. Not a code correctness issue.
