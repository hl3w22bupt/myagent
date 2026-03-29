## Context

**当前状态**:
- MyAgent 有 Hook 机制（`onTaskStart`, `onTaskComplete`），可以扩展 Agent 生命周期
- 但没有统一的输出验证机制
- 每个 Agent 的输出格式不一致，上层应用需要重复处理验证逻辑

**约束条件**:
- 必须通过 Hook 扩展实现，不修改 Agent 核心代码
- 验证逻辑必须可配置（在 `agent.yaml` 中定义）
- 验证失败时支持降级策略（不阻塞整个系统）

**利益相关者**:
- Subagent 开发者 - 需要配置验证规则
- 上层应用（智能研发平台）- 需要可靠的输出格式
- 系统维护者 - 需要可观测性（验证失败日志）

## Goals / Non-Goals

**Goals:**
- ✅ 提供统一的 Agent 输出验证机制
- ✅ 支持多种验证类型（Schema、完整性、格式）
- ✅ 可通过配置文件定义验证规则
- ✅ 验证失败时提供清晰的错误信息
- ✅ 支持自定义验证器扩展

**Non-Goals:**
- ❌ 不验证 Skill 输出（太底层、太多样）
- ❌ 不修改 Agent.run() 核心流程
- ❌ 不提供验证规则的可视化编辑器（仅 YAML 配置）

## Decisions

### 决策 1: 使用 Zod 作为 Schema 验证库

**选择**: Zod

**理由**:
- ✅ TypeScript-first，类型推断友好
- ✅ 错误信息清晰，易于调试
- ✅ 轻量级（~50KB），无运行时依赖
- ✅ 社区活跃，文档完善

**替代方案**: JSON Schema (Ajv)
- ❌ 类型推断较弱
- ❌ 错误信息不够友好

### 决策 2: 验证器接口设计

```typescript
interface Validator {
  validate(output: any): ValidationResult;
}

class ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

**理由**:
- 统一接口，支持多种验证器类型
- 返回结构化结果，包含错误和警告

### 决策 3: 验证失败时的策略

**策略**: 抛出 `ValidationError`，支持降级

```typescript
class ValidationHook {
  async onTaskComplete(result: AgentResult, context: any) {
    const validation = await this.validator.validate(result.output);

    if (!validation.valid) {
      if (context.validationStrategy === 'fallback') {
        // 降级：记录错误，返回简化输出
        logger.warn('Validation failed', validation.errors);
        result.output = this.sanitizeOutput(result.output);
      } else {
        // 默认：抛出异常
        throw new ValidationError(validation.errors);
      }
    }
  }
}
```

**理由**:
- 安全优先：默认行为是失败
- 灵活性：支持降级模式（适用于非关键场景）

### 决策 4: 配置文件格式

**YAML 配置** (`agent.yaml`):

```yaml
agent:
  name: product-manager
  hooks:
    validation:
      strategy: strict  # strict | fallback
      schema:
        userStories:
          type: array
          items:
            type: object
            required: [id, title, priority]
            properties:
              id:
                type: string
                pattern: "^[A-Z]{2}-\\d+$"
              title:
                type: string
                minLength: 10
              priority:
                type: string
                enum: [P0, P1, P2, P3]
      required: ["userStories", "personas", "requirements"]
      formats:
        - field: userStories[].id
          pattern: "^[A-Z]{2}-\\d+$"
          message: "User story ID must match format: XX-123"
```

**理由**:
- YAML 与现有 Motia 配置风格一致
- 支持注释，易于维护
- 可以嵌套定义复杂结构

### 决策 5: 验证器实现顺序

**Phase 1: 核心验证器** (本次实施)
- `SchemaValidator`: Zod Schema 验证
- `CompletenessValidator`: 必填字段检查
- `FormatValidator`: 正则表达式验证

**Phase 2: 扩展验证器** (后续按需)
- `CustomValidator`: 自定义验证函数
- `RangeValidator`: 数值范围检查
- `LengthValidator`: 字符串/数组长度检查

**理由**:
- Phase 1 覆盖 80% 的使用场景
- Phase 2 根据实际需求迭代

## Risks / Trade-offs

### Risk 1: 验证逻辑可能影响性能

**影响**: 每个 Agent 执行后都会运行验证，增加 10-50ms 延迟

**缓解措施**:
- ✅ 仅在配置了验证规则时执行
- ✅ Zod 验证器是同步的，不引入异步延迟
- ✅ 提供选项禁用验证（`validation: false`）

### Risk 2: 复杂的 Schema 定义可能难以维护

**影响**: `agent.yaml` 中的 schema 配置可能变得冗长

**缓解措施**:
- ✅ 提供预设的常见 Schema（如 `UserStoryOutput`, `TaskOutput`）
- ✅ 支持 `$ref` 引用外部 schema 定义
- ✅ 文档提供最佳实践示例

### Risk 3: 验证失败时的降级策略可能隐藏问题

**影响**: 使用 `fallback` 模式时，错误可能被忽略

**缓解措施**:
- ✅ 记录所有验证失败到日志
- ✅ 默认策略为 `strict`（失败即抛出异常）
- ✅ 在文档中明确说明 `fallback` 的风险

## Migration Plan

**部署步骤**:

1. **Step 1**: 安装依赖
   ```bash
   npm install zod
   npm install --save-dev @types/zod
   ```

2. **Step 2**: 实现 ValidationHook
   - 创建 `src/core/hook/validation-hook.ts`
   - 实现 `SchemaValidator`, `CompletenessValidator`, `FormatValidator`
   - 添加单元测试

3. **Step 3**: 集成到 Hook 系统
   - 在 `src/core/hook/types.ts` 中注册 `ValidationHook`
   - 在 `Agent.run()` 中自动加载配置的验证器

4. **Step 4**: 更新现有 Subagent 配置（可选）
   - 为 `product-manager`, `code-reviewer` 等添加验证规则

5. **Step 5**: 验证和测试
   - 运行现有测试套件
   - 手动测试验证失败场景

**回滚策略**:
- 移除 `agent.yaml` 中的 `validation` 配置
- 验证器是可选功能，移除配置后系统自动回退到原有行为

## Open Questions

1. **Q**: 是否需要支持跨 Agent 的共享 Schema 定义？
   - **A**: Phase 1 不支持，每个 Agent 独立定义。Phase 2 可以考虑 `openspec/schemas/` 目录。

2. **Q**: 验证失败时是否需要触发通知（如 Webhook）？
   - **A**: 不需要。验证失败会抛出异常，上层应用可以捕获并发送通知。

3. **Q**: 是否需要支持异步验证器（如调用外部 API 验证）？
   - **A**: Phase 1 不支持。如果需要，可以在 Phase 2 的 `CustomValidator` 中支持。
