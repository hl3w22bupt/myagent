# Soul Agent 技术设计背景文档

本目录包含 Soul Agent 系统的技术设计考量、架构决策和实现细节的解释性文档。这些文档作为背景知识，帮助开发者理解 Soul Agent 的设计理念和工作原理。

## 📚 文档列表

### [soul-primitives.md](./soul-primitives.md)
**Soul Agent 原语详解：为什么只有这三个就够了？**

- **内容**：深入解释三大核心原语（hibernate、schedule、complete）的设计理念和使用场景
- **涵盖**：
  - 为什么只需要 3 个原语
  - 每个原语的功能、使用场景和示例
  - 如何用 3 个原语表达复杂场景
  - 图灵完备性和最小完备性原则
- **适合**：想理解 Soul Agent 核心控制机制的开发者

### [soul-wake-mechanisms.md](./soul-wake-mechanisms.md)
**Soul Agent 唤醒机制详解：时间 vs 事件**

- **内容**：详细说明 Soul Agent 的双重唤醒机制
- **涵盖**：
  - 时间驱动唤醒（schedule 原语）
  - 事件驱动唤醒（外部 API 触发）
  - 统一唤醒入口（SoulScheduler.activateSoul）
  - 实际场景示例（用户消息、WebSocket、Webhook、Cron）
- **适合**：需要实现 Soul Agent 集成或触发逻辑的开发者

## 🎯 如何使用这些文档

### 对于新开发者
1. 先阅读 `soul-primitives.md` 理解 Soul Agent 的核心概念
2. 再阅读 `soul-wake-mechanisms.md` 了解实际的触发和唤醒流程
3. 结合 `docs/autonomous-agent-design.md` 理解完整的系统架构

### 对于实现集成功能
- 参考 `soul-wake-mechanisms.md` 中的代码示例
- 了解如何通过 API 唤醒 Soul Agent
- 了解不同触发场景的最佳实践

### 对于设计新 Soul Agent
- 参考 `soul-primitives.md` 中的使用模式
- 理解如何组合 3 个原语实现复杂行为
- 学习最佳实践和常见模式

## 🔗 相关文档

- [Autonomous Agent Design Specification](../autonomous-agent-design.md) - 完整的系统设计文档
- [Soul Agent API Reference](../api-reference.md) - API 接口文档（如有）
- [Subagent Development Guide](../subagent-guide.md) - Subagent 开发指南（如有）

## 💡 设计原则

这些文档体现了 Soul Agent 系统的核心设计原则：

1. **最小完备性**：用最少的原语实现最大的灵活性
2. **关注点分离**：Soul 负责何时行动，Subagent 负责如何行动
3. **统一接口**：所有触发方式通过统一的入口点
4. **资源高效**：通过休眠机制实现大规模并发

## 📝 贡献指南

如果需要添加新的解释性文档：

1. 使用清晰的文件名，反映文档内容
2. 在本 README 中添加文档条目和简要说明
3. 保持文档风格一致，使用清晰的章节结构和代码示例
4. 确保文档与实际实现保持同步

---

**最后更新**：2026-03-21
