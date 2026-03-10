# Proposal: Distributed Skill Execution Architecture

**Status:** 🛠️ Design Proposal (Future Work)
**Created:** 2026-03-10
**Author:** MyAgent Team
**Phase:** Phase 3+ (Post-MVP)

---

## 🎯 Overview

定义 MyAgent 技能系统的分布式执行架构，支持：
- 跨平台技能执行（macOS → Linux → Windows）
- 资源感知调度（GPU、大内存任务）
- 弹性资源池管理
- 远程节点通信

---

## 🏗️ Architecture Overview

### Current State (Phase 1-3)

```yaml
# skills/gpu-training/skill.yaml
execution:
  runtime:
    # Functional dependencies
    requires:
      bins: ["python3"]
      pythonPackages: ["torch"]

    # Resource requirements
    resources:
      cpus: 8
      gpus: 2
      memory: "32Gi"

    # Platform requirements
    platform:
      os: ["linux"]
      arch: ["x86_64"]
      software: ["cuda"]

    # Installation
    install:
      - kind: pip
        packages: ["torch", "transformers"]
```

**Current Flow:**
```
User Request → SkillExecutor → DependencyChecker → SkillInstaller
                                              ↓
                                    Check: Can run locally?
                                              ↓
                                    NO → Skip skill (⚠️)
```

### Proposed Future State

```yaml
# Same config, but with distributed execution
execution:
  runtime:
    requires: {...}
    resources: {...}
    platform: {...}
    install: {...}

    # 🆕 Remote execution hint
    remote: true  # Allow remote execution if resources unavailable locally
```

**Future Flow:**
```
User Request → SkillExecutor → DependencyChecker → ResourceMatcher
                                              ↓
                                    Check: Can run locally?
                                              ↓
                                    YES → Execute locally
                                              ↓
                                    NO  → DistributedScheduler
                                              ↓
                                    Find suitable node
                                              ↓
                                    Execute remotely
                                              ↓
                                    Return results
```

---

## 🎨 Component Design

### 1. Resource Matcher

**Responsibility:** Match skill requirements to available nodes

```python
class ResourceMatcher:
    """Match skill requirements to node capabilities."""

    def find_suitable_nodes(
        self,
        requirements: ResourceRequirements,
        nodes: List[RemoteNode]
    ) -> List[RemoteNode]:
        """
        Find nodes that satisfy resource requirements.

        Args:
            requirements: Skill resource requirements
            nodes: Available remote nodes

        Returns:
            List of capable nodes, sorted by fit score
        """
        capable_nodes = []

        for node in nodes:
            if self._can_satisfy(node, requirements):
                score = self._calculate_fit_score(node, requirements)
                capable_nodes.append((node, score))

        # Sort by score (best fit first)
        return [node for node, _ in sorted(capable_nodes, key=lambda x: x[1])]

    def _can_satisfy(self, node: RemoteNode, requirements: ResourceRequirements) -> bool:
        """Check if node can satisfy requirements."""
        # Check CPUs
        if requirements.cpus > node.available_cpus:
            return False

        # Check memory
        if requirements.memory_bytes > node.available_memory:
            return False

        # Check GPUs
        if requirements.gpus > node.available_gpus:
            return False

        # Check platform
        if requirements.os and node.os not in requirements.os:
            return False

        if requirements.arch and node.arch not in requirements.arch:
            return False

        return True

    def _calculate_fit_score(self, node: RemoteNode, requirements: ResourceRequirements) -> float:
        """Calculate how well node fits requirements."""
        # Prefer nodes with minimal resource waste
        cpu_ratio = requirements.cpus / node.available_cpus
        memory_ratio = requirements.memory_bytes / node.available_memory

        # Lower ratio = better fit (less waste)
        return 1.0 - (cpu_ratio + memory_ratio) / 2
```

### 2. Distributed Scheduler

**Responsibility:** Orchestrate remote skill execution

```python
class DistributedScheduler:
    """Schedule and execute skills on remote nodes."""

    def __init__(self, nodes: List[RemoteNode]):
        self.nodes = nodes
        self.resource_matcher = ResourceMatcher()

    async def execute_remotely(
        self,
        skill_name: str,
        input_data: dict,
        requirements: ResourceRequirements
    ) -> SkillResult:
        """
        Execute skill on a suitable remote node.

        Args:
            skill_name: Name of skill to execute
            input_data: Input parameters for skill
            requirements: Skill resource requirements

        Returns:
            SkillResult from remote execution
        """
        # Find suitable nodes
        suitable_nodes = self.resource_matcher.find_suitable_nodes(
            requirements,
            self.nodes
        )

        if not suitable_nodes:
            raise Exception("No suitable node found")

        # Select best node
        node = suitable_nodes[0]

        # Execute on remote node
        return await self._execute_on_node(node, skill_name, input_data)

    async def _execute_on_node(
        self,
        node: RemoteNode,
        skill_name: str,
        input_data: dict
    ) -> SkillResult:
        """Execute skill on specific remote node."""
        # Send execution request
        response = await self._send_request(node, {
            "action": "execute_skill",
            "skill_name": skill_name,
            "input": input_data
        })

        return SkillResult(**response)
```

### 3. Remote Node

**Responsibility:** Execute skills on remote machines

```python
@dataclass
class RemoteNode:
    """Remote execution node."""
    id: str
    host: str
    port: int

    # Capabilities
    available_cpus: int
    available_gpus: int
    available_memory: int

    # Platform
    os: str
    arch: str

    # Software
    installed_software: List[str]

    # Status
    is_healthy: bool
    current_load: float  # 0.0 - 1.0

# Example node
gpu_server = RemoteNode(
    id="gpu-server-1",
    host="192.168.1.100",
    port=8080,
    available_cpus=16,
    available_gpus=4,
    available_memory=64 * 1024**3,  # 64GiB
    os="linux",
    arch="x86_64",
    installed_software=["cuda", "docker"],
    is_healthy=True,
    current_load=0.3
)
```

### 4. Communication Protocol

**REST API Interface:**

```typescript
// Remote Node API
interface ExecutionRequest {
  action: "execute_skill";
  skill_name: string;
  input: Record<string, any>;
  resources?: ResourceRequirements;
}

interface ExecutionResponse {
  success: boolean;
  output?: any;
  error?: string;
  execution_time: number;
  metadata: {
    node_id: string;
    execution_id: string;
  };
}
```

**Node Discovery:**
```yaml
# config/nodes.yaml
nodes:
  - id: gpu-server-1
    host: 192.168.1.100
    port: 8080
    capabilities:
      cpus: 16
      gpus: 4
      memory: "64Gi"
      os: linux
      arch: x86_64

  - id: mac-studio
    host: 192.168.1.101
    port: 8080
    capabilities:
      cpus: 12
      gpus: 0
      memory: "32Gi"
      os: darwin
      arch: arm64
```

---

## 📊 Execution Flow

### Scenario 1: GPU Training on Mac

```
User: Mac Studio (M3 Max, no GPU)
      ↓
Request: Execute "llm-fine-tuning"
      ↓
DependencyChecker: Requires 2 GPUs
      ↓
Local Check: ❌ No GPUs available
      ↓
DistributedScheduler: Find GPU node
      ↓
Found: gpu-server-1 (2x A100, Linux)
      ↓
Execute: Send task to gpu-server-1
      ↓
 gpu-server-1: Execute skill
      ↓
 gpu-server-1: Return results
      ↓
Result: Display to user
```

### Scenario 2: Linux-Only Task

```
User: MacBook (Darwin/ARM64)
      ↓
Request: Execute "final-cut-export"
      ↓
Platform Check: Requires Darwin (✓)
      ↓
Software Check: Requires final-cut-pro (✓)
      ↓
Execute: Run locally (no remote needed)
```

---

## 🔧 Implementation Phases

### Phase 1: Configuration Support (✅ Completed)
- ResourceRequirements schema
- PlatformRequirements schema
- Validation and checking
- Integration with DependencyChecker

### Phase 2: Node Discovery (Future)
- Node registration API
- Health check mechanism
- Capability discovery
- Configuration format (nodes.yaml)

### Phase 3: Scheduling (Future)
- ResourceMatcher implementation
- DistributedScheduler implementation
- Load balancing strategies
- Fallback mechanisms

### Phase 4: Execution (Future)
- Remote execution protocol
- Result serialization
- Error handling and retry
- Progress reporting

### Phase 5: Monitoring (Future)
- Execution metrics
- Node health monitoring
- Resource utilization tracking
- Performance optimization

---

## 🤔 Open Questions

1. **Security Model**
   - How to authenticate remote nodes?
   - How to authorize skill execution?
   - How to secure communication?

2. **Data Transfer**
   - How to handle large input/output data?
   - How to transfer files between nodes?
   - How to minimize data transfer overhead?

3. **Error Handling**
   - What happens if remote node fails during execution?
   - How to retry with different node?
   - How to report partial results?

4. **Resource Management**
   - How to handle resource contention?
   - How to prioritize tasks?
   - How to implement queueing?

5. **Network Topology**
   - Centralized vs decentralized scheduler?
   - How to handle network partitions?
   - How to support dynamic node addition/removal?

---

## 📚 References

- [Ray Distributed Computing](https://docs.ray.io/)
- [AnyScale Platform](https://www.anyscale.com/)
- [Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/)
- [Docker Swarm Scheduling](https://docs.docker.com/engine/swarm/scheduling/)

---

## ✅ Next Steps

1. ✅ Phase 1: Configuration support (COMPLETED)
2. ⏳ Phase 2-5: Awaiting requirements and prioritization
3. 📝 Gather user feedback on resource requirements
4. 🧪 Prototype with simple 2-node setup
5. 📊 Benchmark performance vs local execution

---

**Status:** This proposal is a **design blueprint** for future implementation. The current skill system (Phase 1-3) supports resource and platform declaration, but remote execution is **not yet implemented**.
