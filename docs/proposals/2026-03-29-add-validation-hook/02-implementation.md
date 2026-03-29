## 1. Setup

- [ ] 1.1 Install Zod dependency (`npm install zod`)
- [ ] 1.2 Add `@types/zod` as dev dependency
- [ ] 1.3 Create directory structure `src/core/hook/validation/`
- [ ] 1.4 Create test file `src/core/hook/validation/validation-hook.spec.ts`

## 2. Core Implementation - ValidationHook

- [ ] 2.1 Create `Validator` interface and `ValidationResult` class
- [ ] 2.2 Implement `ValidationHook` class with `onTaskComplete` method
- [ ] 2.3 Add validation strategy support (strict/fallback)
- [ ] 2.4 Implement error handling and logging for validation failures
- [ ] 2.5 Add unit tests for ValidationHook

## 3. Core Implementation - Built-in Validators

- [ ] 3.1 Implement `SchemaValidator` using Zod
- [ ] 3.2 Implement `CompletenessValidator` for required fields
- [ ] 3.3 Implement `FormatValidator` with regex support
- [ ] 3.4 Add unit tests for all three validators

## 4. Configuration Integration

- [ ] 4.1 Define validation schema for `agent.yaml` (YAML structure)
- [ ] 4.2 Implement YAML parser for validation rules
- [ ] 4.3 Add validation config loading logic in Agent constructor
- [ ] 4.4 Add tests for YAML configuration parsing

## 5. Hook System Integration

- [ ] 5.1 Register `ValidationHook` in `src/core/hook/types.ts`
- [ ] 5.2 Add `ValidationHook` to Hook factory
- [ ] 5.3 Integrate validation into Agent execution flow
- [ ] 5.4 Add integration tests for Agent + ValidationHook

## 6. Error Handling & Observability

- [ ] 6.1 Create `ValidationError` class with detailed error messages
- [ ] 6.2 Implement fallback strategy (sanitize output on failure)
- [ ] 6.3 Add structured logging for validation failures
- [ ] 6.4 Add metrics for validation performance (p50, p99)

## 7. Testing

- [ ] 7.1 Write unit tests for SchemaValidator (happy path + error paths)
- [ ] 7.2 Write unit tests for CompletenessValidator
- [ ] 7.3 Write unit tests for FormatValidator
- [ ] 7.4 Write integration tests for ValidationHook + Agent
- [ ] 7.5 Write tests for validation strategies (strict vs fallback)
- [ ] 7.6 Add performance benchmarks (p99 < 50ms)

## 8. Documentation

- [ ] 8.1 Update `docs/reference/guides/validation-hook.md` with usage examples
- [ ] 8.2 Add YAML configuration examples to docs
- [ ] 8.3 Document custom validator implementation guide
- [ ] 8.4 Add migration guide for existing agents

## 9. Example Configurations

- [ ] 9.1 Add validation config to `subagents/product-manager/agent.yaml`
- [ ] 9.2 Add validation config to `subagents/code-reviewer/agent.yaml`
- [ ] 9.3 Verify example configurations work correctly

## 10. Verification & Cleanup

- [ ] 10.1 Run full test suite (`npm test`)
- [ ] 10.2 Manually test validation failure scenarios
- [ ] 10.3 Verify backward compatibility (agents without validation config)
- [ ] 10.4 Code review and fix any issues
- [ ] 10.5 Update CHANGELOG.md
