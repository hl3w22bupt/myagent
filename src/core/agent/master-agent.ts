/**
 * MasterAgent class.
 *
 * Extends Agent with subagent delegation capabilities.
 * Can orchestrate multiple specialized subagents.
 */

import { Agent } from './agent';
import { MasterAgentConfig, AgentResult, DelegationPlan } from './types';
import { getAgentStreams } from './hooks/progress-notify';
import { RequestRewriter } from './request-rewriter';
import { ContextManager } from '../context/manager';
import { getDataStore } from '../database/data-store';
import { OrchestratedContext } from '../context/orchestrator';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Master Agent with delegation capabilities.
 */
export class MasterAgent extends Agent {
  private subagents: Map<string, Agent>;
  private subagentConfigs: Map<string, any>;
  private cacheVersion: string; // Cache version based on subagents config
  private masterConfig: MasterAgentConfig; // Store typed config
  private explicitDelegateTo: string[] | undefined; // Explicit delegation targets
  protected requestRewriter: RequestRewriter; // Request rewriter for multi-turn conversations (protected for HITL in base Agent)
  private contextManager: ContextManager; // Context manager for conversation history

  // Delegation plan cache to reduce LLM calls
  private delegationPlansCache: Map<string, { plan: DelegationPlan; timestamp: number; cacheVersion: string }>;
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(config: MasterAgentConfig, sessionId: string) {
    super(config, sessionId);
    this.masterConfig = config; // Store typed config
    this.explicitDelegateTo = config.delegateTo; // Store explicit delegation
    this.agentName = 'Master Agent'; // Set display name
    this.subagents = new Map();
    this.subagentConfigs = new Map();
    this.delegationPlansCache = new Map();

    // Initialize RequestRewriter with agent's LLM config
    this.requestRewriter = RequestRewriter.createWithAgentConfig(config);

    // Initialize ContextManager
    this.contextManager = new ContextManager(getDataStore());

    console.log('[MasterAgent] Constructor called', {
      sessionId,
      'config.delegateTo': config.delegateTo,
      'this.explicitDelegateTo': this.explicitDelegateTo,
    });

    // Generate cache version from subagents list
    this.cacheVersion = this.generateCacheVersion();

    // Load subagent configurations
    // In production, this would load from subagents/{name}/agent.yaml
    this.loadSubagentConfigs(config.subagents);
  }

  /**
   * Run task with possible delegation to subagents.
   * @param task - Task description
   * @param _taskId - Optional task ID
   * @param context - Optional context object (may include rewriteRequest flag)
   */
  async run(task: string, _taskId?: string, context?: any): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    // Save original task before any rewriting (needed for subagent delegation)
    const originalTask = task;

    console.log('[MasterAgent] run() called', {
      sessionId: this.sessionId,
      explicitDelegateTo: this.explicitDelegateTo,
      hasExplicitDelegateTo: !!this.explicitDelegateTo,
      length: this.explicitDelegateTo?.length || 0,
      originalTask: task,
    });

    // === Step 0: Request Rewriting (Multi-turn conversation enhancement) ===
    const effectiveTaskId = _taskId || `task-${Date.now()}`;

    // Check if request rewriting is enabled (default: true)
    const shouldRewriteRequest = context?.rewriteRequest !== false;

    console.log('[MasterAgent] Request rewrite check:', {
      'context?.rewriteRequest': context?.rewriteRequest,
      shouldRewriteRequest,
      'will skip rewrite': !shouldRewriteRequest,
    });

    if (shouldRewriteRequest) {
      try {
        // ⭐ 优先使用传入的 context.conversationHistory（由 TaskHook 预加载）
        // 如果没有，则从数据库加载
        let conversationHistory: any[] = [];
        const taskContext = await this.contextManager.getContext(effectiveTaskId);

        if (context?.conversationHistory && context.conversationHistory.length > 0) {
          conversationHistory = context.conversationHistory;
          console.log('[MasterAgent] Using conversationHistory from context parameter', {
            historyLength: conversationHistory.length,
            source: 'TaskHook preExec',
          });
        } else {
          // Fallback: 尝试从 conversationRounds 构建历史
          conversationHistory = taskContext?.conversationRounds
            ? this.contextManager.getConversationHistoryForAgent(taskContext)
            : [];
          console.log('[MasterAgent] Using conversationHistory from database', {
            historyLength: conversationHistory.length,
            source: 'Database conversationRounds',
          });
        }

        console.log('[MasterAgent] Conversation history for rewrite:', {
          historyLength: conversationHistory.length,
          taskId: effectiveTaskId,
          conversationRoundsCount: taskContext?.conversationRounds?.length || 0,
          conversationHistoryPreview: conversationHistory.map((m: any) => ({ role: m.role, content: m.content?.substring(0, 50) })),
        });

        // ⭐ Configure trace for request rewriter's LLM calls
        // This ensures request rewriting is visible in execution traces
        const streams = getAgentStreams();
        if (streams?.executionTraces) {
          this.requestRewriter.setTraceConfig({
            streams: { executionTraces: streams.executionTraces },
            traceContext: {
              taskId: effectiveTaskId,
              agentId: this.sessionId,
            },
          });
          console.log('[MasterAgent] RequestRewriter trace config set');
        }

        // Rewrite request based on conversation history
        const rewrittenTask = await this.requestRewriter.rewriteRequest(
          task,
          conversationHistory,
          {
            maxHistoryMessages: 10,
            contextSummary: taskContext?.summary ? {
              currentTask: taskContext.summary.currentTask || task,
              completedSteps: taskContext.summary.completedSteps || [],
              artifactIndex: taskContext.artifactIndex || [],
            } : undefined,
          }
        );

        // Use rewritten task for all subsequent processing
        if (rewrittenTask !== task) {
          console.log('[MasterAgent] Task rewritten:', {
            original: task,
            rewritten: rewrittenTask,
          });

          steps.push({
            type: 'request_rewrite',
            content: 'Request rewritten with conversation context',
            timestamp: Date.now(),
            metadata: {
              originalTask: task,
              rewrittenTask: rewrittenTask,
              historyLength: conversationHistory.length,
            },
          });

          // Replace task with rewritten version
          task = rewrittenTask;
        }
      } catch (error) {
        console.error('[MasterAgent] Request rewriting failed, using original task:', error);
        // Continue with original task if rewrite fails
      }
    } else {
      console.log('[MasterAgent] Request rewriting DISABLED, using original task as-is', {
        'context.rewriteRequest': context?.rewriteRequest,
      });
    }

    try {
      // If explicit delegateTo is specified, skip intelligent planning
      if (this.explicitDelegateTo && this.explicitDelegateTo.length > 0) {
        console.log('[MasterAgent] Using direct delegation (bypassing LLM planning)', {
          delegateTo: this.explicitDelegateTo,
        });
        steps.push({
          type: 'planning',
          content: 'Direct delegation (bypassing intelligent analysis)',
          timestamp: Date.now(),
          metadata: {
            task,
            delegateTo: this.explicitDelegateTo,
          },
        });

        // ⭐ Send direct delegation notification to taskExecution stream
        await this.sendDirectDelegationNotification(task, this.explicitDelegateTo, _taskId);

        // Build execution context for direct delegation
        // ⭐ 传递完整的 context 对象，包括 workingMemory.userProfile
        const directDelegationContext = {
          // 保留原始 context 的所有内容
          ...context,
          // 添加/覆盖原始用户任务（未格式化）以供 conversationHistory 存储
          originalUserTask: originalTask,
        };

        return this.executeDirectDelegation(task, this.explicitDelegateTo, steps, startTime, _taskId, 'direct', originalTask, directDelegationContext);
      }

      // Step 1: Create delegation plan (intelligent analysis)
      steps.push({
        type: 'planning',
        content: 'Creating delegation plan',
        timestamp: Date.now(),
        metadata: { task },
      });

      const plan = await this.planWithDelegation(task, _taskId);

      steps.push({
        type: 'delegation',
        content: `Plan: ${plan.reasoning}`,
        timestamp: Date.now(),
        metadata: {
          steps: plan.steps.length,
          delegates: plan
            .steps.filter((s) => s.delegateTo != null)
            .map((s) => s.delegateTo),
        },
      });

      // Step 2: Check if plan has delegation steps
      // CRITICAL: Only delegate when confidence >= 70
      const delegationSteps = plan.steps.filter((s) => s.delegateTo && (s.confidence ?? 0) >= 70);
      const directExecutionSteps = plan.steps.filter((s) => !s.delegateTo || (s.confidence ?? 0) < 70);

      // Log detailed delegation analysis
      console.log('[MasterAgent] Delegation Analysis:', {
        selected_subagents: plan.selected_subagents || [],
        overall_confidence: plan.confidence ?? 0,
        reasoning: plan.reasoning?.substring(0, 100) + (plan.reasoning?.length > 100 ? '...' : ''),
        totalSteps: plan.steps.length,
        delegationSteps: delegationSteps.length,
        directSteps: directExecutionSteps.length,
        stepsDetails: plan.steps.map((s, i) => ({
          index: i + 1,
          task: s.task.substring(0, 80) + (s.task.length > 80 ? '...' : ''),
          delegateTo: s.delegateTo || null,
          confidence: s.confidence ?? 0,
          action: s.delegateTo && (s.confidence ?? 0) >= 70 ? 'DELEGATE' : 'DIRECT'
        }))
      });

      if (delegationSteps.length > 0) {
        // Has delegation - execute with the first delegated subagent
        const delegateTarget = delegationSteps[0].delegateTo!;
        const delegateConfidence = delegationSteps[0].confidence ?? 0;

        console.log('[MasterAgent] Delegating to:', delegateTarget, {
          confidence: delegateConfidence,
          reason: delegationSteps[0].reason || 'No reason provided',
          task: delegationSteps[0].task.substring(0, 100)
        });

        steps.push({
          type: 'execution',
          content: `Delegating to ${delegateTarget}`,
          timestamp: Date.now(),
        });

        // ⭐ Notify task decomposition even when delegating
        // User should see how task was analyzed before delegation
        await this.notifyTaskDecomposition(task, delegationSteps[0].task, plan, _taskId);

        // Build execution context for planned delegation
        // ⭐ 传递完整的 context 对象，包括 workingMemory.userProfile
        const plannedDelegationContext = {
          // 保留原始 context 的所有内容
          ...context,
          // 添加/覆盖原始用户任务（未格式化）以供 conversationHistory 存储
          originalUserTask: originalTask,
        };

        return this.executeDirectDelegation(task, [delegateTarget], steps, startTime, _taskId, 'planned', undefined, plannedDelegationContext);
      }

      // No delegation - execute directly
      console.log('[MasterAgent] Executing directly (no delegation needed)', {
        reason: delegationSteps.length === 0
          ? 'No steps with confidence >= 70'
          : 'All steps have confidence < 70',
        stepsToExecute: directExecutionSteps.length
      });

      // Step 3: Notify task decomposition before execution
      await this.notifyTaskDecomposition(task, task, plan, _taskId);

      // Step 4: Execute task directly (same as subagent path)
      steps.push({
        type: 'execution',
        content: 'Executing task directly',
        timestamp: Date.now(),
      });

      // Build execution context (same as subagent delegation path)
      const executionContext = {
        // 保留原始 context 的所有内容（包括 workingMemory.userProfile）
        ...context,
        // 添加/覆盖执行特定字段
        originalUserTask: originalTask,  // 原始用户输入（用于 conversationHistory 存储）
        originalTask: originalTask,  // Original user request (before rewriting)
      };

      console.log('[MasterAgent] Direct execution context created', {
        hasConversationHistory: !!executionContext.conversationHistory,
        conversationHistoryLength: executionContext.conversationHistory?.length || 0,
      });

      const result = await super.run(task, _taskId, executionContext);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: result.output,
        steps,
        executionTime,
        metadata: {
          delegates: plan.steps
            .filter((s) => s.delegateTo != null)
            .map((s) => s.delegateTo as string),
          skillNames: result.metadata.skillNames,
        },
        structuredOutput: result.structuredOutput,
        structuredOutputs: (result as any).structuredOutputs,
      };
    } catch (error: any) {
      console.error('[MasterAgent] Task execution failed:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        task,
        sessionId: this.sessionId,
      });

      return {
        success: false,
        error: error.message,
        output: undefined, // Explicitly set output to undefined
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          delegates: [],
        },
      };
    }
  }

  /**
   * Generate cache version from subagents configuration.
   * This ensures cache is invalidated when subagents change.
   */
  private generateCacheVersion(): string {
    const subagentNames = this.masterConfig.subagents || [];
    return subagentNames.sort().join(',');
  }

  /**
   * Extract keywords from subagent description and skills.
   * These keywords help match tasks to appropriate subagents.
   */
  private extractSubagentKeywords(description: string, skills: string[]): string[] {
    const keywords: string[] = [];
    const combined = `${description} ${skills.join(' ')}`.toLowerCase();

    // Common technical terms and patterns
    const patterns = [
      /\b(code|coding|programming|software|development)\b/g,
      /\b(review|audit|analysis|analyze|examine|inspect)\b/g,
      /\b(security|vulnerability|safety|threat)\b/g,
      /\b(data|dataset|csv|json|statistics|analytics)\b/g,
      /\b(system|architecture|api|documentation|guide)\b/g,
      /\b(file|read|write|io)\b/g,
      /\b(web|search|research|lookup)\b/g,
      /\b(test|testing|quality|qa)\b/g,
      /\b(performance|optimization|speed)\b/g,
      /\b(document|text|summary|summarize)\b/g,
    ];

    // Extract matching patterns
    for (const pattern of patterns) {
      const matches = combined.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    }

    // Extract specific skill names
    for (const skill of skills) {
      const skillName = skill.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      keywords.push(skillName);
    }

    // Remove duplicates and return
    return [...new Set(keywords)].slice(0, 10); // Max 10 keywords
  }

  /**
   * Generate cache key from task string.
   * Uses simple hashing for fast lookup.
   */
  private generateCacheKey(task: string): string {
    // Normalize task: lowercase, trim, collapse whitespace
    const normalized = task.toLowerCase().trim().replace(/\s+/g, ' ');
    return `plan:${normalized}`;
  }

  /**
   * Get delegation plan from cache if available and not expired.
   */
  private getCachedPlan(task: string): DelegationPlan | null {
    const cacheKey = this.generateCacheKey(task);
    const cached = this.delegationPlansCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache entry version matches current version
    if (cached.cacheVersion !== this.cacheVersion) {
      console.log('[MasterAgent] Cache version mismatch, invalidating:', cacheKey);
      this.delegationPlansCache.delete(cacheKey);
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.delegationPlansCache.delete(cacheKey);
      console.log('[MasterAgent] Cache entry expired:', cacheKey);
      return null;
    }

    console.log('[MasterAgent] Cache hit for task:', task);
    return cached.plan;
  }

  /**
   * Store delegation plan in cache.
   * Evicts oldest entries if cache is full.
   */
  private cachePlan(task: string, plan: DelegationPlan): void {
    const cacheKey = this.generateCacheKey(task);

    // Evict oldest entries if cache is full
    if (this.delegationPlansCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.delegationPlansCache.keys().next().value;
      if (oldestKey) {
        this.delegationPlansCache.delete(oldestKey);
        console.log('[MasterAgent] Cache full, evicted:', oldestKey);
      }
    }

    this.delegationPlansCache.set(cacheKey, {
      plan,
      timestamp: Date.now(),
      cacheVersion: this.cacheVersion, // Include cache version for invalidation
    });

    console.log('[MasterAgent] Cached plan for task:', task);
  }

  /**
   * Clear expired cache entries.
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.delegationPlansCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.delegationPlansCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log('[MasterAgent] Cleaned expired cache entries:', cleanedCount);
    }
  }

  /**
   * Get cache statistics.
   */
  private getCacheStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.delegationPlansCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL,
    };
  }

  /**
   * Plan task execution with delegation decisions.
   * Uses LLM to intelligently delegate tasks to appropriate subagents.
   * Implements caching to reduce LLM calls for similar tasks.
   */
  private async planWithDelegation(task: string, taskId?: string): Promise<DelegationPlan> {
    // Step 1: Check cache first
    const cachedPlan = this.getCachedPlan(task);
    if (cachedPlan) {
      console.log('[MasterAgent] Using cached delegation plan');
      return cachedPlan;
    }

    // Step 2: Not in cache, create new plan
    // Dynamically generate structured subagent descriptions with specialties
    const subagentsList = Array.from(this.subagentConfigs.entries())
      .map(([name, config]) => {
        const description = config?.description || 'No description';
        const skillsArray = config?.availableSkills || [];
        const skills = skillsArray.length > 0 ? skillsArray.join(', ') : 'No skills';
        const specialties = config?.specialties || [];
        const specialtyList = specialties.length > 0 ? specialties.join(', ') : 'No specialties';

        // Extract key capabilities from description and skills
        const keywords = this.extractSubagentKeywords(description, skillsArray);

        // Format as structured XML for better parsing
        const tags = [...skillsArray, ...specialties];
        const tagList = tags.length > 0 ? tags.map(t => `'${t}'`).join(', ') : 'No tags';

        return `<agent>
  <name>${name}</name>
  <description>${description}</description>
  <skills>${skills}</skills>
  <specialties>${specialtyList}</specialties>
  <tags>${tagList}</tags>
  <keywords>${keywords.join(', ')}</keywords>
</agent>`;
      })
      .join('\n');

    // Step 3: Build LLM messages with System + Assistant + User structure
    // System role: Basic system instructions
    const systemPrompt = `You are a master agent planning task execution with intelligent delegation to specialized subagents.

## Confidence-Based Delegation

You MUST evaluate your CONFIDENCE in delegating to a subagent using a 0-100 scale:

**CONFIDENCE SCORE (0-100):**
- **90-100**: PERFECT match - task explicitly mentions the subagent's specialty domain keywords (e.g., "security review" + security-auditor)
- **70-89**: STRONG match - task clearly falls within the subagent's domain with specific context
- **50-69**: MODERATE match - task relates to the domain but is general/vague or requires creative work
- **30-49**: WEAK match - task has some keyword overlap but is clearly outside the subagent's core expertise
- **0-29**: NO match - task is unrelated to any subagent

**DELEGATION THRESHOLD: ONLY delegate when confidence >= 70**

Subagents are SPECIALIZED for domain-specific analysis (code review, data analysis, security audit, system documentation). They are NOT general-purpose assistants for creative tasks like:
- Creating web pages, generating HTML/CSS
- Writing new features from scratch
- Content generation (articles, images, videos)
- General coding tasks without clear domain alignment

When confidence < 70, ALWAYS handle directly with the master agent.`;

    // Assistant role: Planning template and instructions (with <reasoning> tag)
    const assistantPrompt = `<reasoning>
I am a master agent that intelligently delegates tasks to specialized subagents. Here is my planning framework:

## Available Subagents
<available_subagents>
${subagentsList}
</available_subagents>

## Delegation Strategy

Analyze the task and decide: delegate to a specialized subagent OR handle with master agent.

### When to DELEGATE (confidence >= 70):
1. The task explicitly mentions domain-specific keywords matching a subagent's description
2. The task is about ANALYZING, REVIEWING, or AUDITING existing code/data/systems
3. The subagent's specialty is the PRIMARY focus of the task (not tangential)
4. Sufficient context is provided (file paths, specific systems, clear scope)

### When to HANDLE DIRECTLY (confidence < 70):
1. CREATIVE tasks: creating web pages, writing content, generating features
2. General tasks without clear domain alignment (e.g., "create a webpage")
3. Tasks that require broad capabilities beyond a single domain
4. Vague tasks lacking specific context (e.g., "review the code" without file)
5. **VIDEO/AUDIO GENERATION TASKS** - ALWAYS handle directly (including script analysis, audio generation, video merging)
6. **FRONTEND/WEB DEVELOPMENT TASKS** - typically require creative design, not code analysis
7. **DO NOT split creative/production tasks** - even if a subtask seems analytical, if the overall task is creative/production, handle all parts directly

### Domain Alignment Examples:
- "Review auth.ts for security" → security-auditor (confidence: 95) ✓
- "Analyze the CSV sales data" → data-analyst (confidence: 90) ✓
- "Create an iPhone product page" → NO subagent (confidence: ~20) - handle directly
- "Generate HTML for landing page" → NO subagent (confidence: ~15) - handle directly
- "Fix the bug in checkout" → NO subagent (confidence: ~30) - handle directly

## Decision Process:
1. Extract key concepts and requirements from the task
2. Match against subagent descriptions, skills, and keywords
3. Calculate your confidence score (0-100)
4. If confidence < 70: handle directly
5. If confidence >= 70: delegate to the matching subagent

## Response Format

**IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no <plan> tags.**

## CRITICAL - Subagent Name Format:
**ALL subagent names use HYPHENS (-), NOT SPACES!**
- ✅ CORRECT: developer-engineer, code-reviewer, data-analyst, security-auditor
- ❌ WRONG: developer engineer, code reviewer, data analyst, security auditor
- ALWAYS use the exact name from the available subagents list

Respond with this exact JSON structure:
{
  "selected_subagents": ["subagent-name"] or [],
  "confidence": 85,
  "reasoning": "why this matches OR why handling directly",
  "steps": [
    {
      "task": "specific task",
      "delegateTo": "subagent-name or null",
      "confidence": 85,
      "reason": "why"
    }
  ]
}

Rules:
- selected_subagents: array of subagent names (empty array if handling directly)
- confidence: 0-100, only include selected_subagents if confidence >= 70
- steps: detailed breakdown of the task

## Examples

Example 0 - Code Implementation (confidence 90):
Task: "Implement a user authentication feature with JWT tokens"
Response: {
  "selected_subagents": ["developer-engineer"],
  "confidence": 90,
  "reasoning": "Code implementation task directly matches developer-engineer's specialty",
  "steps": [{"task": "Implement authentication feature", "delegateTo": "developer-engineer", "confidence": 90}]
}

Example 1 - Perfect Match (confidence 95):
Task: "Review the authentication code in auth.ts for security issues"
Response: {
  "selected_subagents": ["security-auditor"],
  "confidence": 95,
  "reasoning": "Explicit security review of authentication code directly matches security-auditor's specialty",
  "steps": [{"task": "Review auth.ts for security issues", "delegateTo": "security-auditor", "confidence": 95}]
}

Example 2 - Strong Match (confidence 80):
Task: "Analyze the user_behavior.csv dataset and create visualizations"
Response: {
  "selected_subagents": ["data-analyst"],
  "confidence": 80,
  "reasoning": "CSV analysis and visualization directly matches data-analyst's skills",
  "steps": [{"task": "Analyze CSV data", "delegateTo": "data-analyst", "confidence": 80}]
}

Example 3 - Low Confidence - Handle Directly (confidence 25):
Task: "Create an iPhone 18 product promotional webpage"
Response: {
  "selected_subagents": [],
  "confidence": 25,
  "reasoning": "Creative web development task, not code analysis. No subagent specializes in web page creation.",
  "steps": [{"task": "Create webpage", "delegateTo": null, "confidence": 25}]
}

Example 4 - Video Production (confidence 0):
Task: "Generate CNN teaching video audio and merge with video"
Response: {
  "selected_subagents": [],
  "confidence": 0,
  "reasoning": "Video production task - handle directly using volcano-tts and ffmpeg tools",
  "steps": [{"task": "Generate video with audio", "delegateTo": null, "confidence": 0}]
}

## Important Rules:
- Return ONLY valid JSON (no markdown, no tags)
- selected_subagents is an array of names (empty if handling directly)
- Include "confidence" field (0-100)
- Delegate ONLY when confidence >= 70
</reasoning>`;

    // User role: Only conversation history and current request
    const userPrompt = `<task>
${task}
</task>`;

    // ⭐ Send delegation planning notification (analyzing status)
    const streams = getAgentStreams();
    const effectiveTaskId = taskId || `task-${Date.now()}`;

    if (streams?.taskExecution) {
      const analyzingEvent = {
        type: 'delegation_planning',
        progressType: 'delegation',
        status: 'analyzing',
        taskId: effectiveTaskId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          task,
          subjectTitle: 'Master Agent',
        }
      };
      const timestamp = Date.now();
      const entryId = `agent-delegation_planning-analyzing-${effectiveTaskId}-${timestamp}`;
      await streams.taskExecution.set(effectiveTaskId, entryId, {
        ...analyzingEvent,
        category: 'agent_hook',
      });
      console.log('[MasterAgent] Delegation planning (analyzing) notification sent');
    }

    // Step 4: Call LLM with System + Assistant + User message structure
    const response = await this.llm.messagesCreate([
      { role: 'system' as const, content: systemPrompt },
      { role: 'assistant' as const, content: assistantPrompt },
      { role: 'user' as const, content: userPrompt }
    ], {}, 'delegation planning');

    // Try multiple parsing strategies
    let parsedPlan: any = null;
    let lastError: Error | null = null;

    // Helper to validate and sanitize plan by checking delegateTo values
    const validateAndSanitizePlan = (plan: DelegationPlan): DelegationPlan => {
      if (!plan.steps || !Array.isArray(plan.steps)) {
        return plan;
      }

      const validSubagentNames = new Set(this.subagentConfigs.keys());
      let sanitizedCount = 0;

      const sanitizedSteps = plan.steps.map((step: any) => {
        if (step.delegateTo) {
          // Check if delegateTo is a valid subagent name
          if (!validSubagentNames.has(step.delegateTo)) {
            console.warn(
              `[MasterAgent] Invalid delegateTo "${step.delegateTo}" detected. ` +
              `Valid subagents: ${Array.from(validSubagentNames).join(', ')}. ` +
              `Removing delegateTo field to handle directly.`
            );
            sanitizedCount++;
            // Remove the invalid delegateTo field
            const { delegateTo: _delegateTo, ...rest } = step;
            return rest;
          }
        }
        return step;
      });

      if (sanitizedCount > 0) {
        console.log(`[MasterAgent] Sanitized ${sanitizedCount} invalid delegation(s) from plan`);
      }

      return {
        ...plan,
        steps: sanitizedSteps,
      };
    };

    // Helper to cache and return plan
    const cacheAndReturn = (plan: DelegationPlan): DelegationPlan => {
      // Validate and sanitize plan before caching
      const sanitizedPlan = validateAndSanitizePlan(plan);

      this.cachePlan(task, sanitizedPlan);

      // ⭐ Send delegation plan completed notification
      const streams = getAgentStreams();
      if (streams?.taskExecution) {
        (async () => {
          try {
            // Analyze delegation decision for better user communication
            const delegatedSteps = sanitizedPlan.steps.filter(s => s.delegateTo);
            const hasDelegation = delegatedSteps.length > 0;

            // Build confidence summary for notification
            const confidenceSummary = sanitizedPlan.steps.map(s => ({
              task: s.task,
              delegateTo: s.delegateTo || 'MasterAgent',
              confidence: s.confidence ?? 0,
            }));

            const delegationDecision = hasDelegation
              ? `委派给子代理 (${delegatedSteps.map(s => `${s.delegateTo}(confidence:${s.confidence ?? 'N/A'})`).join(', ')})`
              : '未找到匹配的子代理 (confidence < 70)，MasterAgent 直接执行';

            const planEvent = {
              type: 'delegation_plan',
              progressType: 'delegation',
              status: 'resolved',
              taskId: effectiveTaskId,
              sessionId: this.sessionId,
              timestamp: new Date().toISOString(),
              data: {
                task,
                plan: {
                  steps: sanitizedPlan.steps,
                  reasoning: sanitizedPlan.reasoning,
                },
                subjectTitle: 'Master Agent',
                delegationDecision,
                matchedSubagents: delegatedSteps.map(s => s.delegateTo),
                confidenceSummary,
              }
            };
            const timestamp = Date.now();
            const entryId = `agent-delegation_plan-completed-${effectiveTaskId}-${timestamp}`;
            await streams.taskExecution?.set(effectiveTaskId, entryId, {
              ...planEvent,
              category: 'agent_hook',
            });
            console.log('[MasterAgent] Delegation plan (resolved) notification sent');
          } catch (error) {
            console.error('[MasterAgent] Failed to send delegation plan notification:', error);
          }
        })();
      }

      return sanitizedPlan;
    };

    // Parse delegation plan from LLM response
    // Try multiple strategies in order
    const parseStrategies = [
      // Strategy 1: Direct JSON (no markdown, no tags)
      () => {
        const trimmed = response.content.trim();
        // Check if it starts with { and is valid JSON
        if (trimmed.startsWith('{')) {
          return JSON.parse(trimmed);
        }
        return null;
      },
      // Strategy 2: Extract from <plan> tags (for backward compatibility)
      () => {
        const planStart = response.content.indexOf('<plan>');
        const planEnd = response.content.lastIndexOf('</plan>');
        if (planStart !== -1 && planEnd !== -1) {
          const jsonStr = response.content.substring(planStart + 6, planEnd).trim();
          return JSON.parse(jsonStr);
        }
        return null;
      },
      // Strategy 3: Extract from markdown code block
      () => {
        const codeBlockMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          return JSON.parse(codeBlockMatch[1]);
        }
        return null;
      },
    ];

    for (const strategy of parseStrategies) {
      try {
        parsedPlan = strategy();
        if (parsedPlan) {
          const strategyName = strategy.name || 'anonymous';
          console.log(`[MasterAgent] Parsed delegation plan successfully using: ${strategyName}`);
          return cacheAndReturn(parsedPlan);
        }
      } catch (error: any) {
        lastError = error;
        continue;
      }
    }

    // All strategies failed
    console.error('[MasterAgent] All parsing strategies failed', {
      response: response.content.substring(0, 1000),
      lastError: lastError?.message,
    });

    throw new Error(
      `Failed to parse plan from LLM response after 4 attempts. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Get or create a subagent instance.
   *
   * For workflow steps, each step creates a new subagent instance with a unique ID.
   * For normal execution, the same subagent instance is reused across multiple calls.
   */
  private async getOrCreateSubagent(name: string, context?: any): Promise<Agent> {
    // Check if this is a workflow step execution
    const workflowStepId = context?.workflowStepId;
    const subagentKey = workflowStepId ? `${name}-${workflowStepId}` : name;

    if (this.subagents.has(subagentKey)) {
      return this.subagents.get(subagentKey)!;
    }

    // Create subagent instance
    // This is a simplified version - actual implementation would load full config
    const config = this.subagentConfigs.get(name);

    // ⭐ CRITICAL: Validate that subagent exists before creating
    if (!config) {
      const validSubagents = Array.from(this.subagentConfigs.keys()).sort();
      throw new Error(
        `Invalid subagent: "${name}" does not exist. ` +
        `Valid subagents: ${validSubagents.join(', ')}. ` +
        `Please check the subagents/ directory for available subagents.`
      );
    }

    // ⭐ NEW: Filter subagent skills with MasterAgent's availableSkills constraint
    // When user specifies availableSkills in API request, both MasterAgent and subagents
    // should respect this constraint by using only the intersection of skills
    let filteredSkills = config.availableSkills || [];

    if (this.masterConfig.availableSkills && this.masterConfig.availableSkills.length > 0) {
      const masterSkills = new Set(this.masterConfig.availableSkills);
      const subagentSkills = config.availableSkills || [];

      // Take intersection: MasterAgent.availableSkills ∩ subagentConfig.availableSkills
      filteredSkills = subagentSkills.filter((skill: string) => masterSkills.has(skill));

      console.log(`[MasterAgent] Filtering subagent skills with user constraint`, {
        subagent: name,
        masterSkills: Array.from(masterSkills),
        subagentSkills,
        filteredSkills,
        'intersection count': filteredSkills.length,
      });

      // If intersection is empty, log a warning but still create subagent with empty skills
      // This will cause the subagent to use native Python code execution
      if (filteredSkills.length === 0) {
        console.warn(
          `[MasterAgent] ⚠️ No skills overlap between MasterAgent constraint and subagent "${name}". ` +
          `Subagent will have no skills available and will use native Python execution. ` +
          `MasterAgent skills: ${Array.from(masterSkills).join(', ')}, ` +
          `Subagent skills: ${subagentSkills.join(', ')}`
        );
      }
    }

    // Create unique sessionId for subagent with clear prefix
    // Using independent namespace to distinguish from master agent
    const subagentSessionId = `subagent-${subagentKey}-${Date.now()}`;

    const subagent = new Agent(
      {
        name,  // Set name for getSubjectInfo() to use as subjectSubTitle
        systemPrompt: config.systemPrompt,  // No fallback - must exist
        availableSkills: filteredSkills,  // Use filtered skills (intersection with MasterAgent's constraint)
        llm: this.config.llm,
        sandbox: this.config.sandbox,
        constraints: config?.constraints, // 传递 constraints 包含 enableClarification
        knowledgeBase: this.config.knowledgeBase,  // ⭐ 传递 knowledgeBase 配置给 subagent（用于 RAG）
        validation: config?.validation,  // ⭐ 传递 validation 配置给 subagent（用于 ValidationHook）
      },
      subagentSessionId
    );

    this.subagents.set(subagentKey, subagent);

    console.log(`[MasterAgent] Created subagent: ${name}`, {
      subagentSessionId,
      masterSessionId: this.sessionId,
      workflowStepId,
      'skills count': filteredSkills.length,
      'skills': filteredSkills,
    });

    return subagent;
  }

  /**
   * Send direct delegation notification to taskExecution stream.
   * Called when user explicitly specifies delegateTo, bypassing LLM planning.
   */
  private async sendDirectDelegationNotification(
    task: string,
    delegates: string[],
    taskId?: string
  ): Promise<void> {
    const streams = getAgentStreams();
    const effectiveTaskId = taskId || `task-${Date.now()}`;

    if (streams?.taskExecution) {
      try {
        const event = {
          type: 'delegation_plan',
          progressType: 'delegation',
          status: 'resolved',
          taskId: effectiveTaskId,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          data: {
            task,
            plan: {
              steps: delegates.map((delegate) => ({
                delegateTo: delegate,
                description: `Delegating to ${delegate}`,
              })),
            },
            subjectTitle: 'Master Agent',
          }
        };
        const timestamp = Date.now();
        const entryId = `agent-delegation_plan-direct-${effectiveTaskId}-${timestamp}`;
        await streams.taskExecution.set(effectiveTaskId, entryId, {
          ...event,
          category: 'agent_hook',
        });
        console.log('[MasterAgent] Direct delegation notification sent', {
          taskId: effectiveTaskId,
          delegates,
        });
      } catch (error) {
        console.error('[MasterAgent] Failed to send direct delegation notification:', error);
      }
    }
  }

  /**
   * Execute direct delegation to specified subagents.
   * @param delegationType - 'direct' (user specified) or 'planned' (LLM decided)
   */
  private async executeDirectDelegation(
    task: string,
    delegates: string[],
    steps: any[],
    startTime: number,
    taskId?: string,
    delegationType: 'direct' | 'planned' = 'direct',
    originalTask?: string,  // 原始任务参数（未格式化的）
    context?: any  // 上下文参数，包含 conversationHistory, originalTask, rewriteRequest 等
  ): Promise<AgentResult> {
    try {
      // For simplicity, delegate to the first subagent in the list
      const subagentName = delegates[0];

      // Record direct delegation in traces (bypassing LLM planning)
      // and send delegation planning notification to taskExecution stream (for chat display)
      const streams = getAgentStreams();
      if (streams && streams.executionTraces && taskId) {
        // Get the full plan for detailed trace recording (if available)
        const cachedPlan = this.getCachedPlan(task);

        // 1. Record delegation planning trace with full plan details
        const delegationId = `delegation-planning-${this.sessionId}-${Date.now()}`;
        await streams.executionTraces.set(taskId, delegationId, {
          traceId: delegationId,
          level: 'agent-internal',
          taskId,
          agentId: this.sessionId,
          stage: 'delegation_planning',
          status: 'completed',
          retryCount: 0,
          maxRetries: 3,
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            delegationType: delegationType,  // 'direct' (user specified) or 'planned' (LLM decided)
            delegates: delegates,
            reasoning: delegationType === 'direct'
              ? `Direct delegation to ${subagentName} (user specified via delegateTo parameter)`
              : `Planned delegation to ${subagentName} (based on LLM analysis)`,
            // Include full plan details for 'planned' delegation type
            ...(delegationType === 'planned' && cachedPlan ? {
              plan: {
                steps: cachedPlan.steps,
                reasoning: cachedPlan.reasoning,
              },
              confidenceSummary: cachedPlan.steps.map(s => ({
                task: s.task,
                delegateTo: s.delegateTo || 'MasterAgent',
                confidence: s.confidence ?? 0,
                reason: s.reason,
              })),
            } : {}),
          }
        });
        console.log('[MasterAgent] Direct delegation trace recorded', { taskId, subagentName });
      }


      steps.push({
        type: 'delegation',
        content: `Directing delegating to ${subagentName}`,
        timestamp: Date.now(),
        metadata: { delegateTo: subagentName },
      });

      // Get or create subagent instance
      // Pass context to include workflowStepId for unique sessionId generation
      const subagent = await this.getOrCreateSubagent(subagentName, context);

      // ⭐ NEW: Get userProfile from orchestrator to pass to subagent
      // This ensures user profile is available in all subagent LLM calls
      let userProfile: any = undefined;
      try {
        console.log('[MasterAgent] Calling orchestrator.getContext for subagent delegation', {
          hasContext: !!context,
          contextKeys: context ? Object.keys(context) : 'no context',
          'context.context?.workingMemory?.userProfile': !!context?.context?.workingMemory?.userProfile,
          'context.workingMemory?.userProfile': !!context?.workingMemory?.userProfile,
        });
        const orchestratedContext: OrchestratedContext = await this.orchestrator.getContext(context || {}, this.state);
        userProfile = orchestratedContext.userProfile;
        if (userProfile) {
          console.log('[MasterAgent] User profile extracted for subagent delegation', {
            hasPreferences: !!userProfile.preferences,
            hasHabits: !!userProfile.habits,
            hasTags: !!userProfile.tags,
            preferencesCount: userProfile.preferences?.length || 0,
            habitsCount: userProfile.habits?.length || 0,
            tagsCount: userProfile.tags?.length || 0,
          });
        } else {
          console.log('[MasterAgent] No user profile found in orchestrated context');
        }
      } catch (error) {
        console.warn('[MasterAgent] Failed to extract user profile for subagent:', error);
      }

      // ⭐ NEW: Extract userContext from parent context (for application-specific subagent templates)
      // Check both possible locations: context.context.workingMemory.userContext and context.workingMemory.userContext
      const userContext = context?.context?.workingMemory?.userContext
        || context?.workingMemory?.userContext;

      if (userContext) {
        console.log('[MasterAgent] UserContext found, will pass to subagent', {
          hasName: !!userContext.name,
          hasPersonality: !!userContext.personality,
          hasIntimacyLevel: !!userContext.intimacy_level,
        });
      } else {
        console.log('[MasterAgent] No userContext found in parent context', {
          'context.context?.workingMemory?.userContext': !!context?.context?.workingMemory?.userContext,
          'context.workingMemory?.userContext': !!context?.workingMemory?.userContext,
        });
      }

      // === Trigger subagent hooks (like step layer does for MasterAgent) ===
      // ⭐ 注意：conversationHistory 现在由 TaskHook.preExec 统一加载
      // ⭐ 将 context 中的 conversationHistory 传递给 subagent
      const subagentContext = {
        agentType: 'Agent',
        agentId: (subagent as any).sessionId,
        sessionId: (subagent as any).sessionId,
        taskId: taskId,
        agent: subagent,
        // ⭐ 传递原始用户任务（未格式化）以供 conversationHistory 存储
        ...(context?.originalUserTask && { originalUserTask: context.originalUserTask }),
        // ⭐ 传递 conversationHistory 给 subagent
        ...(context?.conversationHistory && { conversationHistory: context.conversationHistory }),
        // ⭐ 传递 originalTask 给 subagent
        ...(context?.originalTask && { originalTask: context.originalTask }),
        // ⭐ 传递 rewriteRequest 给 subagent
        ...(context?.rewriteRequest !== undefined && { rewriteRequest: context.rewriteRequest }),
        // ⭐ NEW: 传递 environment 给 subagent（用于任务特定的配置，如 project_dir, language 等）
        ...(context?.environment && { environment: context.environment }),
        // ⭐ NEW: 传递 app 给 subagent（用于知识库自动发现）
        ...(context?.app && { app: context.app }),
        // ⭐ CRITICAL: 传递 emit 函数给 subagent（用于发送 token usage events）
        ...(context?.emit && { emit: context.emit }),
        // ⭐ NEW: 传递 userProfile 和 userContext 给 subagent（通过 workingMemory）
        ...((userProfile || userContext) && {
          workingMemory: {
            ...(userContext && { userContext }),
            ...(userProfile && { userProfile }),
          }
        }),
      };

      console.log('[MasterAgent] Subagent context created', {
        subagentName,
        hasConversationHistory: !!subagentContext.conversationHistory,
        conversationHistoryLength: subagentContext.conversationHistory?.length || 0,
        hasApp: !!subagentContext.app,
        app: subagentContext.app,
        hasEnvironment: !!subagentContext.environment,
        environmentKeys: subagentContext.environment ? Object.keys(subagentContext.environment) : [],
      });

      // Call onTaskStart hook
      if (this.hookManager) {
        console.log(`[MasterAgent] Calling subagent onTaskStart hook`, {
          subagentName,
          subagentSessionId: (subagent as any).sessionId,
          agentInfo: (subagent as any).getSubjectInfo?.(),
        });
        await this.hookManager.executeHook('onTaskStart', task, taskId, subagentContext);
        console.log(`[MasterAgent] Subagent onTaskStart hook executed`, { subagentName });
      }

      // Execute task with subagent
      // Note: task already includes the current message, formattedHistory contains full history
      const result = await subagent.run(task, taskId, subagentContext);

      // Call onTaskComplete hook
      if (this.hookManager) {
        console.log(`[MasterAgent] Calling subagent onTaskComplete hook`, {
          subagentName,
          subagentSessionId: (subagent as any).sessionId,
          agentInfo: (subagent as any).getSubjectInfo?.(),
          resultSuccess: result.success,
        });
        await this.hookManager.executeHook('onTaskComplete', result, subagentContext);
        console.log(`[MasterAgent] Subagent onTaskComplete hook executed`, { subagentName });
      }

      const executionTime = Date.now() - startTime;

      // 如果 subagent 执行失败，返回失败状态
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Subagent execution failed',
          output: result.output,
          steps,
          executionTime,
          metadata: {
            delegates: [subagentName],
            skillNames: result.metadata?.skillNames,
          },
          structuredOutput: result.structuredOutput,
          structuredOutputs: (result as any).structuredOutputs,
          clarification: result.clarification, // 传递澄清信息
        };
      }

      return {
        success: true,
        output: result.output,
        steps,
        executionTime,
        metadata: {
          delegates: [subagentName],
          skillNames: result.metadata?.skillNames,
        },
        structuredOutput: result.structuredOutput,
        structuredOutputs: (result as any).structuredOutputs,
      };
    } catch (error: any) {
      console.error('[MasterAgent] Direct delegation failed:', {
        message: error.message,
        stack: error.stack,
        task,
        delegates,
      });

      return {
        success: false,
        error: error.message,
        output: undefined,
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          delegates: delegates,
        },
      };
    }
  }

  /**
   * Synthesize results from multiple executions.
   * Uses LLM to intelligently merge and summarize results from multiple subagents.
   */
  private async synthesizeResults(results: any[]): Promise<any> {
    // If only one result, return as-is
    if (results.length === 1) {
      return results[0].result?.output || results[0].result;
    }

    // Prepare results summary for LLM
    const resultsSummary = results.map((r, i) => {
      const type = r.self ? 'Master Agent (self)' : `Subagent: ${r.subagent}`;
      const success = r.result?.success ? 'Success' : 'Failed';
      const output = r.result?.output ? `${r.result?.output}` : 'No output';
      return `Step ${i + 1}: ${type}
Status: ${success}
${output}`;
    }).join('\n\n');

    const prompt = `You are a master agent synthesizing results from multiple subagents.

<execution_results>
${resultsSummary}
</execution_results>

Please synthesize these results into a coherent response:
1. Summarize what was accomplished
2. Highlight key findings from each step
3. Provide a consolidated output
4. Note any issues or failures

CRITICAL: You must respond with valid JSON only, wrapped in <synthesis> tags.
Do not include any text outside the JSON structure.

Example format:
<synthesis>
{
  "summary": "Successfully analyzed data and reviewed code",
  "keyFindings": ["Data analysis completed with 5 results", "Code review identified 3 issues"],
  "consolidatedOutput": {"analysis": {...}, "review": {...}},
  "issues": ["Step 2 had a timeout"]
}
</synthesis>

Your response must follow this exact format:
<synthesis>
{
  "summary": "brief summary of what was accomplished",
  "keyFindings": ["finding 1", "finding 2"],
  "consolidatedOutput": "merged and formatted output",
  "issues": ["any issues encountered"]
}
</synthesis>

Important rules:
- Output ONLY valid JSON inside <synthesis> tags
- Ensure all JSON is properly formatted with quotes and commas
- Keep keyFindings and issues as arrays of strings
- consolidatedOutput can contain any JSON structure`;

    try {
      // Proper message structure: system message for instructions, user message for content
      const response = await this.llm.messagesCreate([
        { role: 'system' as const, content: `You are a master agent synthesizing results from multiple subagents.` },
        { role: 'user' as const, content: prompt }
      ], {}, 'results synthesis');

      // Try multiple parsing strategies (similar to planWithDelegation)
      let parsedSynthesis: any = null;
      let lastError: Error | null = null;

      // Strategy 1: Extract from <synthesis> tags (non-greedy)
      let jsonMatch = response.content.match(/<synthesis>\s*(\{.*?\})\s*<\/synthesis>/s);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsedSynthesis = JSON.parse(jsonMatch[1]);
          console.log('[MasterAgent] Parsed synthesis using strategy 1 (<synthesis> tags)');
          return parsedSynthesis;
        } catch (error: any) {
          lastError = error;
          console.warn('[MasterAgent] Strategy 1 failed:', error.message);
        }
      }

      // Strategy 2: Extract from <synthesis> tags (greedy)
      jsonMatch = response.content.match(/<synthesis>\s*(\{[\s\S]*?\})\s*<\/synthesis>/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsedSynthesis = JSON.parse(jsonMatch[1]);
          console.log('[MasterAgent] Parsed synthesis using strategy 2 (greedy)');
          return parsedSynthesis;
        } catch (error: any) {
          lastError = error;
          console.warn('[MasterAgent] Strategy 2 failed:', error.message);
        }
      }

      // Strategy 3: Find any JSON object
      jsonMatch = response.content.match(/\{[\s\S]*?\}/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          parsedSynthesis = JSON.parse(jsonMatch[0]);
          console.log('[MasterAgent] Parsed synthesis using strategy 3 (raw JSON)');
          return parsedSynthesis;
        } catch (error: any) {
          lastError = error;
          console.warn('[MasterAgent] Strategy 3 failed:', error.message);
        }
      }

      // Strategy 4: Try code blocks
      jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsedSynthesis = JSON.parse(jsonMatch[1]);
          console.log('[MasterAgent] Parsed synthesis using strategy 4 (code block)');
          return parsedSynthesis;
        } catch (error: any) {
          lastError = error;
          console.warn('[MasterAgent] Strategy 4 failed:', error.message);
        }
      }

      // All strategies failed - log and fall back
      console.warn('[MasterAgent] All synthesis parsing strategies failed, using fallback', {
        lastError: lastError?.message,
      });
    } catch (error: any) {
      console.warn('[MasterAgent] LLM synthesis failed, falling back to simple merge:', error.message);
    }

    // Fallback: simple merge
    return {
      results,
      summary: `Executed ${results.length} steps successfully`,
      details: results.map((r, i) => ({
        step: i + 1,
        type: r.self ? 'self' : `delegated to ${r.subagent}`,
        success: r.result?.success,
      })),
    };
  }

  /**
   * Load subagent configurations from subagents/{name}/agent.yaml files.
   */
  private loadSubagentConfigs(subagentNames: string[]): void {
    for (const name of subagentNames) {
      try {
        const config = this.loadSubagentConfig(name);
        if (config) {
          this.subagentConfigs.set(name, config);
          console.log(`[MasterAgent] Loaded subagent config: ${name}`);
        }
      } catch (error: any) {
        console.error(`[MasterAgent] Failed to load subagent ${name}:`, error.message);
        // Continue loading other subagents even if one fails
      }
    }
  }

  /**
   * Load a single subagent configuration from YAML file.
   */
  private loadSubagentConfig(name: string): any | null {
    const subagentDir = path.join(process.cwd(), 'subagents', name);
    const configPath = path.join(subagentDir, 'agent.yaml');

    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      console.warn(`[MasterAgent] Subagent config not found: ${configPath}`);
      return null;
    }

    // Read and parse YAML
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(configContent) as any;

    // Validate required fields
    if (!config?.name) {
      throw new Error(`Subagent ${name} missing 'name' field in agent.yaml`);
    }
    if (!config?.agent?.system_prompt && !config?.agent?.systemPrompt) {
      throw new Error(
        `Subagent ${name} missing 'agent.system_prompt' field in agent.yaml`
      );
    }
    if (!config?.agent?.available_skills && !config?.agent?.availableSkills) {
      throw new Error(
        `Subagent ${name} missing 'agent.available_skills' field in agent.yaml`
      );
    }

    // Try to load system prompt from prompts/system.txt if exists
    let systemPrompt = config.agent.system_prompt || config.agent.systemPrompt;
    const systemPromptPath = path.join(subagentDir, 'prompts', 'system.txt');
    if (fs.existsSync(systemPromptPath)) {
      systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8').trim();
      console.log(
        `[MasterAgent] Loaded system prompt from file: ${systemPromptPath}`
      );
    }

    // Normalize config to internal format
    // ⭐ IMPORTANT: Use the folder name (kebab-case) as the name, NOT the config.name
    // This ensures consistency between the key and the name field
    return {
      name: name,  // Use folder name (e.g., "developer-engineer") instead of config.name
      description: config.description || `Subagent: ${name}`,
      systemPrompt,
      availableSkills: config.agent.available_skills || config.agent.availableSkills,
      constraints: config.agent.constraints,
      validation: config.agent.validation,  // ValidationHook configuration
    };
  }

  /**
   * Notify task decomposition to stream.
   * Shows how the original task was broken down into combinedTask.
   */
  private async notifyTaskDecomposition(
    originalTask: string,
    combinedTask: string,
    plan: DelegationPlan,
    taskId?: string
  ): Promise<void> {
    const streams = getAgentStreams();
    const effectiveTaskId = taskId || `task-${Date.now()}`;

    if (!streams?.taskExecution) {
      console.warn('[MasterAgent] No taskExecution stream available for task decomposition');
      return;
    }

    try {
      const decomposedSteps = plan.steps.map((s, i) => ({
        stepNumber: i + 1,
        task: s.task,
        delegateTo: s.delegateTo || 'MasterAgent (直接执行)',
        reason: s.reason,
      }));

      const event = {
        type: 'task_decomposition',
        progressType: 'task-breakdown',
        status: 'resolved',
        taskId: effectiveTaskId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          originalTask,
          decomposedSteps,
          combinedTaskPreview: combinedTask.substring(0, 200) + (combinedTask.length > 200 ? '...' : ''),
          subjectTitle: 'Master Agent',
        }
      };

      const timestamp = Date.now();
      const entryId = `agent-task_decomposition-${effectiveTaskId}-${timestamp}`;
      await streams.taskExecution.set(effectiveTaskId, entryId, {
        ...event,
        category: 'agent_hook',
      });

      console.log('[MasterAgent] Task decomposition notification sent', {
        effectiveTaskId,
        stepsCount: decomposedSteps.length,
      });
    } catch (error) {
      console.error('[MasterAgent] Failed to send task decomposition notification:', error);
    }
  }

  /**
   * Get MasterAgent info.
   */
  getInfo(): Record<string, any> {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      type: 'MasterAgent',
      subagents: Array.from(this.subagentConfigs.keys()),
    };
  }

  /**
   * Get subject info for trace display.
   * MasterAgent always shows "Master Agent" without subtitle.
   */
  getSubjectInfo(): { subjectTitle: string; subjectSubTitle?: string } {
    return {
      subjectTitle: 'Master Agent',
      subjectSubTitle: undefined, // Master Agent has no subtitle
    };
  }
}
