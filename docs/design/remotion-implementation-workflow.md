# Remotion LLM 生成系统 - 实施工作流程

## 📋 工作流程概览

本文档提供 LLM 驱动的 Remotion 教育视频生成系统的完整实施工作流程，按照**复杂度从低到高、价值从高到低**的优先级排序。

---

## 🎯 实施原则

### 优先级矩阵

| 任务 | 复杂度 | 价值 | 优先级 | 状态 |
|------|--------|------|--------|------|
| Phase 1.1: LLM Client | 🟢 低 | 🔴 高 | P0 | ✅ |
| Phase 1.2: 两阶段生成 | 🟡 中 | 🔴 高 | P0 | ✅ |
| Phase 1.4: 代码验证器 | 🟢 低 | 🔴 高 | P0 | ✅ |
| Phase 1.3: Prompt 模板 | 🟡 中 | 🟡 中 | P1 | 📋 |
| Phase 3.2: Fallback 策略 | 🟡 中 | 🟡 中 | P1 | ✅ |
| Phase 2.1: 分析 Prompt | 🟡 中 | 🟡 中 | P1 | 📋 |
| Phase 2.2: 代码 Prompt | 🟡 中 | 🟡 中 | P1 | 📋 |
| Phase 3.1: 缓存机制 | 🟡 中 | 🟢 低 | P2 | 📋 |
| Phase 2.3: Few-Shot 库 | 🔴 高 | 🟡 中 | P2 | 📋 |
| Phase 4: 测试 | 🟡 中 | 🟡 中 | P2 | 📋 |

**图例**:
- 🟢 低复杂度 / 🟡 中复杂度 / 🔴 高复杂度
- 🔴 高价值 / 🟡 中价值 / 🟢 低价值
- ✅ 已完成 / 📋 待实施

---

## 📅 详细工作流程

### **阶段 1: 核心基础设施** ✅ 已完成

**目标**: 建立基础架构，实现核心功能
**时间**: 1-2 天
**依赖**: 无

#### ✅ Phase 1.1: LLM Client 集成 (P0)

**复杂度**: 🟢 低 | **价值**: 🔴 高 | **时间**: 2-3 小时

**任务**:
1. ✅ 创建 `generators/llm_client.py`
2. ✅ 实现 `LLMClient` 类
3. ✅ 支持自动重试机制
4. ✅ 添加超时控制
5. ✅ 实现 Token 估算
6. ✅ 添加批量生成支持

**验收标准**:
- [x] 能成功调用 Anthropic API
- [x] 自动重试机制工作正常
- [x] 超时后能正确抛出异常
- [x] 批量生成能并发执行

**依赖**:
- Python `anthropic==0.40.0`
- 环境变量 `ANTHROPIC_API_KEY`

---

#### ✅ Phase 1.2: 两阶段生成框架 (P0)

**复杂度**: 🟡 中 | **价值**: 🔴 高 | **时间**: 4-6 小时

**任务**:
1. ✅ 创建 `generators/base_generator.py`
2. ✅ 实现 `ContentAnalyzer` (Phase 1)
3. ✅ 实现 `RemotionCodeGenerator` (Phase 2)
4. ✅ 集成到 `handler.py`
5. ✅ 实现智能 fallback 机制

**验收标准**:
- [x] ContentAnalyzer 能正确分析用户描述
- [x] RemotionCodeGenerator 能生成有效代码
- [x] 生成的代码不再硬编码为勾股定理
- [x] Fallback 到模板机制工作正常

**依赖**:
- Phase 1.1 (LLM Client)

**测试用例**:
```python
# 测试用例 1: 泰勒公式
输入: "生成一个泰勒公式的教学视频"
期望: 生成泰勒公式相关代码，而不是勾股定理

# 测试用例 2: 勾股定理
输入: "生成勾股定理教学视频"
期望: 生成勾股定理相关代码

# 测试用例 3: 通用描述
输入: "生成一个简单的介绍视频"
期望: 使用 minimal template fallback
```

---

#### ✅ Phase 1.4: 代码验证器 (P0)

**复杂度**: 🟢 低 | **价值**: 🔴 高 | **时间**: 2-3 小时

**任务**:
1. ✅ 创建 `generators/validator.py`
2. ✅ 实现 7 种验证检查
3. ✅ 生成错误反馈
4. ✅ 添加验证统计

**验收标准**:
- [x] 能检测常见代码错误
- [x] 能生成有用的错误反馈
- [x] 验证失败时能自动重试
- [x] 统计信息准确

**验证项清单**:
1. ✅ 基础结构检查
2. ✅ 必需 imports
3. ✅ Composition 定义
4. ✅ registerRoot 调用
5. ✅ TypeScript 接口
6. ✅ 场景时间合理性
7. ✅ 常见反模式检测

**依赖**:
- 无（独立组件）

---

### **阶段 2: Prompt 优化** 📋 待实施

**目标**: 提升 Prompt 质量，改进生成效果
**时间**: 2-3 天
**依赖**: Phase 1 完成

#### 📋 Phase 1.3: Prompt 模板系统 (P1)

**复杂度**: 🟡 中 | **价值**: 🟡 中 | **时间**: 2-3 小时

**任务**:
1. [ ] 创建 `prompts/` 目录
2. [ ] 提取 ContentAnalyzer prompt 到模板
3. [ ] 提取 CodeGenerator prompt 到模板
4. [ ] 实现模板变量替换
5. [ ] 添加版本管理

**验收标准**:
- [ ] Prompt 与代码分离
- [ ] 支持变量替换
- [ ] 易于维护和更新

**目录结构**:
```
prompts/
├── __init__.py
├── base_prompt.py         # 基础模板类
├── analysis_prompt.py     # 内容分析 prompt
├── code_prompt.py         # 代码生成 prompt
└── versions/
    ├── v1.0/
    │   ├── analysis.txt
    │   └── code.txt
    └── v1.1/  # 新版本
```

**依赖**:
- Phase 1.2 (两阶段生成)

---

#### 📋 Phase 2.1: 优化内容分析 Prompt (P1)

**复杂度**: 🟡 中 | **价值**: 🟡 中 | **时间**: 3-4 小时

**任务**:
1. [ ] 改进主题识别准确性
2. [ ] 优化场景分解逻辑
3. [ ] 增强可视化策略建议
4. [ ] 添加更多示例说明

**改进目标**:
- [ ] 主题识别准确率 >95%
- [ ] 场景分解更合理（时间分配）
- [ ] 可视化建议更具体

**测试用例**:
```python
# 数学主题识别
"泰勒级数展开" → category: "calculus" ✅
"三角形面积" → category: "geometry" ✅
"二次方程" → category: "algebra" ✅

# 场景分解合理性
"详细讲解泰勒公式" → 5个场景 (15%, 25%, 35%, 15%, 10%) ✅
"简单介绍勾股定理" → 3-4个场景 ✅
```

**依赖**:
- Phase 1.3 (Prompt 模板)

---

#### 📋 Phase 2.2: 优化代码生成 Prompt (P1)

**复杂度**: 🟡 中 | **价值**: 🟡 中 | **时间**: 4-5 小时

**任务**:
1. [ ] 改进 Remotion API 使用指导
2. [ ] 添加更多最佳实践示例
3. [ ] 优化动画参数建议
4. [ ] 增强性能优化指导

**改进目标**:
- [ ] 生成的代码 100% 通过验证
- [ ] 动画效果更流畅
- [ ] 性能更好（无冗余计算）

**代码质量检查清单**:
```typescript
// ✅ 应该生成的模式
- 使用 interpolate() 而不是手动计算
- 使用 spring() 而不是硬编码的缓动函数
- 避免在 render 中进行复杂计算
- 使用 useMemo 缓存计算结果
- 正确的 TypeScript 类型定义

// ❌ 应该避免的模式
- 硬编码的帧数
- any 类型
- console.log
- 缺少 registerRoot
- 缺少必需的 props
```

**依赖**:
- Phase 1.3 (Prompt 模板)
- Phase 2.1 (分析 Prompt)

---

#### 📋 Phase 2.3: Few-Shot 示例库 (P2)

**复杂度**: 🔴 高 | **价值**: 🟡 中 | **时间**: 6-8 小时

**任务**:
1. [ ] 收集成功案例
2. [ ] 按类别分类（calculus, geometry, algebra）
3. [ ] 创建示例模板
4. [ ] 实现自动选择逻辑
5. [ ] 添加示例版本管理

**示例结构**:
```python
EXAMPLES = {
    "calculus": {
        "taylor_series": {
            "input": "生成泰勒公式教学视频",
            "analysis": {...},
            "code": "...",
            "quality": "excellent"
        },
        "derivative": {...}
    },
    "geometry": {
        "pythagorean": {...},
        "circle": {...}
    },
    "algebra": {
        "quadratic_equation": {...}
    }
}
```

**选择策略**:
1. 按主题类别匹配
2. 选择质量最高的示例
3. 最多包含 3 个示例（避免 token 浪费）

**依赖**:
- Phase 2.1 (分析 Prompt)
- Phase 2.2 (代码 Prompt)
- 真实用户数据

---

### **阶段 3: 性能和可靠性** 📋 待实施

**目标**: 优化性能，增强可靠性
**时间**: 1-2 天
**依赖**: Phase 2 完成

#### ✅ Phase 3.2: 多层 Fallback 策略 (P1)

**复杂度**: 🟡 中 | **价值**: 🟡 中 | **时间**: 2-3 小时

**状态**: ✅ 已完成（在 Phase 1.2 中实现）

**任务**:
1. ✅ 实现 3 层 fallback
2. ✅ 添加重试机制
3. ✅ 错误日志记录

**Fallback 层级**:
```
Layer 1: LLM 两阶段生成 (with retry)
    ↓ fails
Layer 2: 模板匹配
    ↓ fails
Layer 3: Minimal 模板 (guaranteed)
```

**重试策略**:
- LLM 失败：自动重试 1 次（带错误反馈）
- 验证失败：重新生成 1 次
- 全部失败：使用模板 fallback

---

#### 📋 Phase 3.1: 高级缓存机制 (P2)

**复杂度**: 🟡 中 | **价值**: 🟢 低 | **时间**: 3-4 小时

**任务**:
1. [ ] 实现持久化缓存（Redis/文件）
2. [ ] 添加缓存失效策略
3. [ ] 实现批量处理优化
4. [ ] 添加缓存统计

**缓存策略**:
```python
# TTL 策略
- 内容分析: 1 小时
- 代码生成: 24 小时（相同参数）

# 缓存键
cache_key = f"{description_hash}:{duration}:{fps}:{resolution}"

# 失效策略
- LRU 淘汰（最多 1000 条）
- 手动清除
- 时间过期
```

**性能目标**:
- 缓存命中率 >30%
- 缓存响应时间 <10ms
- 内存占用 <100MB

**依赖**:
- Redis（可选，用于分布式缓存）

---

### **阶段 4: 可视化增强** 📋 未来实施

**目标**: 添加复杂可视化支持
**时间**: 2-3 天
**依赖**: Phase 3 完成

#### 📋 Phase 4.1: Python 数学计算库 (P2)

**复杂度**: 🔴 高 | **价值**: 🟡 中 | **时间**: 8-10 小时

**任务**:
1. [ ] 集成 numpy/scipy
2. [ ] 实现 SVG 路径计算
3. [ ] 添加 LaTeX 渲染支持
4. [ ] 创建可视化组件库

**示例功能**:
```python
# 泰勒级数曲线计算
def calculate_taylor_curve(x_range, order):
    x = np.linspace(x_range[0], x_range[1], 100)
    y = x  # 0阶
    if order >= 1:
        y += x**1 / 1
    if order >= 2:
        y += x**2 / 2
    # ...
    return generate_svg_path(x, y)

# LaTeX 公式渲染
def render_latex_formula(latex):
    svg = katex.render(latex, format="svg")
    return svg
```

**可视化类型**:
- 函数曲线（泰勒级数、导数等）
- 几何图形（三角形、圆等）
- 公式展示（LaTeX 渲染）
- 向量场
- 面积图

**依赖**:
- Python: numpy, scipy, sympy
- Node: katex (可选)

---

#### 📋 Phase 4.2: 测试和文档 (P2)

**复杂度**: 🟡 中 | **价值**: 🟡 中 | **时间**: 4-6 小时

**任务**:
1. [ ] 单元测试（pytest）
2. [ ] 集成测试
3. [ ] 边缘案例测试
4. [ ] 性能基准测试

**测试覆盖**:
- [ ] ContentAnalyzer: >90%
- [ ] RemotionCodeGenerator: >80%
- [ ] CodeValidator: >95%
- [ ] End-to-end: 主要场景

**边缘案例**:
- 空描述
- 超长描述（>1000字）
- 特殊字符
- 多语言
- API 失败
- 超时

---

## 📊 进度追踪

### 总体进度

```
Phase 1: ████████████████████ 100% ✅
Phase 2: ████░░░░░░░░░░░░░░░░  20% 📋
Phase 3: ██░░░░░░░░░░░░░░░░░░  10% 📋
Phase 4: ░░░░░░░░░░░░░░░░░░░░   0% 📋
```

### 时间线

| 阶段 | 开始日期 | 预计完成 | 实际完成 | 状态 |
|------|----------|----------|----------|------|
| Phase 1 | 2025-01-12 | 2025-01-14 | 2025-01-12 | ✅ |
| Phase 2 | - | - | - | 📋 |
| Phase 3 | - | - | - | 📋 |
| Phase 4 | - | - | - | 📋 |

---

## 🎯 验收标准

### Phase 1 验收 ✅

- [x] 能处理"泰勒公式"请求（不再是勾股定理）
- [x] 生成的代码 100% 通过基础验证
- [x] Fallback 机制工作正常
- [x] 测试脚本全部通过
- [x] 文档完整清晰

### Phase 2 验收 📋

- [ ] 主题识别准确率 >95%
- [ ] 生成的代码 100% 通过验证
- [ ] Prompt 易于维护和更新
- [ ] Few-Shot 示例库建立

### Phase 3 验收 📋

- [ ] 缓存命中率 >30%
- [ ] 系统可靠性 >99%
- [ ] 平均响应时间 <10秒

### Phase 4 验收 📋

- [ ] 支持复杂可视化（曲线、公式）
- [ ] 测试覆盖率 >85%
- [ ] 性能基准达标

---

## 🚀 快速开始

### 开发环境设置

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 设置 API Key
export ANTHROPIC_API_KEY='your-key-here'

# 3. 运行测试
cd skills/remotion-generator
python test_llm_integration.py

# 4. 测试 API
curl -X POST http://localhost:3000/api/remotion/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "生成泰勒公式教学视频"}'
```

### 代码结构

```
skills/remotion-generator/
├── generators/
│   ├── __init__.py
│   ├── llm_client.py          # LLM API 客户端
│   ├── base_generator.py      # 基础生成器
│   ├── llm_analyzer.py        # 内容分析器
│   ├── code_generator.py      # 代码生成器
│   └── validator.py           # 代码验证器
├── prompts/                   # Prompt 模板 (Phase 2)
├── examples/                  # Few-Shot 示例 (Phase 2)
├── handler.py                 # 主处理器
├── test_llm_integration.py   # 测试脚本
└── README_LLM_GENERATION.md   # 使用文档
```

---

## 📚 相关文档

- [完整设计文档](remotion-llm-generator.md)
- [关键要素分析](remotion-key-elements-analysis.md)
- [Python vs TypeScript](python-vs-typescript-roles.md)
- [Phase 1 实施总结](implementation-phase1-summary.md)

---

**文档版本**: v1.0
**最后更新**: 2025-01-12
**维护者**: Claude (System Design)
