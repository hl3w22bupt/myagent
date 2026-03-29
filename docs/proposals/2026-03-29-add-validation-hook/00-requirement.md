## Why

MyAgent 平台的所有 Agent 输出都需要结构化和完整性验证，但当前系统缺乏统一的验证机制。这导致：
- Agent 输出格式不一致，难以被上层应用解析
- 缺失关键字段时需要在上层应用中重复处理错误
- 无法在 Agent 执行后立即发现问题，增加了调试成本

**为什么现在做？** 这是 P0 优先级的通用能力，所有 Agent 都需要。通过 Hook 扩展可以实现，无需修改核心代码。

## What Changes

添加 **ValidationHook** 作为通用验证机制：

- **新增 Hook 类型**: `ValidationHook` - 在 `onTaskComplete` 时验证 Agent 输出
- **预定义验证器**:
  - `SchemaValidator`: 使用 Zod 验证 JSON Schema
  - `CompletenessValidator`: 检查必填字段是否存在
  - `FormatValidator`: 验证格式（URL、Email、正则表达式）
- **配置接口**: 在 `agent.yaml` 中配置验证规则
- **错误处理**: 验证失败时抛出 `ValidationError`，支持降级策略
- **可扩展性**: 支持自定义验证器（`CustomValidator`）

## Capabilities

### New Capabilities
- `agent-output-validation`: Agent 输出结构和完整性验证

### Modified Capabilities
- (无)

## Impact

**影响的代码**:
- `src/core/hook/` - 新增 `ValidationHook` 类
- `src/core/hook/types.ts` - 新增 Hook 类型定义
- `subagents/*/agent.yaml` - 可选配置验证规则

**新增依赖**:
- `zod` - JSON Schema 验证库

**不兼容变更**: 无（完全向后兼容，可选功能）
