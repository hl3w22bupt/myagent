import { useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

// Custom Node Component with Professional Design
function CustomNode({ data }) {
  const getColorConfig = (type) => {
    switch (type) {
      case 'hitl':
        return {
          border: '#F59E0B',
          background: '#FFFBEB',
          label: 'HITL',
          textColor: '#92400E'
        }
      case 'subworkflow':
        return {
          border: '#10B981',
          background: '#ECFDF5',
          label: '子流程',
          textColor: '#065F46'
        }
      default:
        return {
          border: '#3B82F6',
          background: '#EFF6FF',
          label: 'Agent',
          textColor: '#1E40AF'
        }
    }
  }

  const config = getColorConfig(data.stepType)

  return (
    <div style={{
      background: config.background,
      border: `2px solid ${config.border}`,
      borderRadius: '12px',
      padding: '16px 20px',
      minWidth: '180px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: config.border,
          border: '2px solid white',
          width: 12,
          height: 12,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        {/* Type Icon */}
        <div style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {data.stepType === 'hitl' ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', color: config.border }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : data.stepType === 'subworkflow' ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', color: config.border }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7m0 0l3.181-3.182m0-4.991v4.991" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', color: config.border }}>
              <rect x="3" y="11" width="18" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="5" r="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 7v4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8" cy="16" r="1" fill="currentColor" />
              <circle cx="16" cy="16" r="1" fill="currentColor" />
            </svg>
          )}
        </div>

        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: config.textColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {config.label}
        </span>
      </div>

      <div style={{
        fontSize: '15px',
        fontWeight: 600,
        color: '#1E293B',
        lineHeight: '1.4',
      }}>
        {data.label}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: config.border,
          border: '2px solid white',
          width: 12,
          height: 12,
        }}
      />
    </div>
  )
}

const nodeTypes = {
  custom: CustomNode,
}

function WorkflowDAG({ workflow, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (!workflow?.steps || workflow.steps.length === 0) {
      setNodes([])
      setEdges([])
      return
    }

    // Calculate vertical layout levels
    const levels = new Map()
    const getLevel = (stepId, visited = new Set()) => {
      if (visited.has(stepId)) return 0
      visited.add(stepId)

      const step = workflow.steps.find(s => s.id === stepId)
      if (!step?.depends_on || step.depends_on.length === 0) return 0

      const depLevels = step.depends_on.map(depId => getLevel(depId, visited))
      return Math.max(...depLevels) + 1
    }

    // Process steps in order, adding implicit dependencies
    const stepsWithImplicitDeps = workflow.steps.map((step, index) => {
      // If step has no depends_on and it's not the first step, add implicit dependency on previous step
      if ((!step.depends_on || step.depends_on.length === 0) && index > 0) {
        const prevStep = workflow.steps[index - 1]
        return {
          ...step,
          depends_on: [prevStep.id]
        }
      }
      return step
    })

    stepsWithImplicitDeps.forEach(step => {
      levels.set(step.id, getLevel(step.id))
    })

    // Count nodes at each level for centering
    const levelCounts = new Map()
    levels.forEach(level => {
      levelCounts.set(level, (levelCounts.get(level) || 0) + 1)
    })

    // Calculate positions
    const positions = new Map()
    const levelIndices = new Map()

    workflow.steps.forEach(step => {
      const level = levels.get(step.id)
      const indexInLevel = levelIndices.get(level) || 0
      levelIndices.set(level, indexInLevel + 1)

      const count = levelCounts.get(level)
      const xOffset = (indexInLevel - (count - 1) / 2) * 240
      const yOffset = level * 200

      positions.set(step.id, { x: xOffset, y: yOffset })
    })

    const newNodes = workflow.steps.map(step => ({
      id: step.id,
      type: 'custom',
      position: positions.get(step.id),
      data: {
        label: step.name || step.id,
        stepType: step.type || 'agent',
        step: step,
      },
      draggable: true,
    }))

    const newEdges = []
    stepsWithImplicitDeps.forEach(step => {
      if (step.depends_on && step.depends_on.length > 0) {
        step.depends_on.forEach(depId => {
          newEdges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            target: step.id,
            type: 'smoothstep',
            animated: true,
            style: {
              stroke: '#94A3B8',
              strokeWidth: 2,
            },
            markerEnd: {
              type: 'arrowclosed',
              color: '#94A3B8',
            },
          })
        })
      }
    })

    console.log('🎨 Setting DAG:', {
      nodeCount: newNodes.length,
      edgeCount: newEdges.length,
    })

    setNodes(newNodes)
    setEdges(newEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow])

  const onNodeClickHandler = (event, node) => {
    if (onNodeClick) {
      onNodeClick(node.data.step)
    }
  }

  if (!workflow?.steps || workflow.steps.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#64748B',
        fontSize: '16px',
        background: '#F8FAFC'
      }}>
        暂无步骤数据
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '500px', background: '#F8FAFC' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickHandler}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        selectNodesOnDrag
      >
        <Background color="#E2E8F0" gap={24} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const colors = {
              hitl: '#FFFBEB',
              subworkflow: '#ECFDF5',
              agent: '#EFF6FF'
            }
            return colors[node.data.stepType] || colors.agent
          }}
          maskColor="rgba(0, 0, 0, 0.05)"
        />
      </ReactFlow>
    </div>
  )
}

export default WorkflowDAG
