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
  private requestRewriter: RequestRewriter; // Request rewriter for multi-turn conversations
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
   */
  async run(task: string, _taskId?: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    console.log('[MasterAgent] run() called', {
      sessionId: this.sessionId,
      explicitDelegateTo: this.explicitDelegateTo,
      hasExplicitDelegateTo: !!this.explicitDelegateTo,
      length: this.explicitDelegateTo?.length || 0,
      originalTask: task,
    });

    // === Step 0: Request Rewriting (Multi-turn conversation enhancement) ===
    const effectiveTaskId = _taskId || `task-${Date.now()}`;

    try {
      // Get conversation history from context manager
      const taskContext = await this.contextManager.getContext(effectiveTaskId);
      const conversationHistory = taskContext?.messages || [];

      console.log('[MasterAgent] Conversation history for rewrite:', {
        historyLength: conversationHistory.length,
        taskId: effectiveTaskId,
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

        return this.executeDirectDelegation(task, this.explicitDelegateTo, steps, startTime, _taskId, 'direct');
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
      const delegationSteps = plan.steps.filter((s) => s.delegateTo);
      const directExecutionSteps = plan.steps.filter((s) => !s.delegateTo);

      if (delegationSteps.length > 0) {
        // Has delegation - execute with the first delegated subagent
        const delegateTarget = delegationSteps[0].delegateTo!;
        console.log('[MasterAgent] Delegating to:', delegateTarget);

        steps.push({
          type: 'execution',
          content: `Delegating to ${delegateTarget}`,
          timestamp: Date.now(),
        });

        // ⭐ Notify task decomposition even when delegating
        // User should see how task was analyzed before delegation
        await this.notifyTaskDecomposition(task, delegationSteps[0].task, plan, _taskId);

        return this.executeDirectDelegation(task, [delegateTarget], steps, startTime, _taskId, 'planned');
      }

      // No delegation - execute directly
      console.log('[MasterAgent] Executing directly (no delegation needed)');

      // Combine all direct execution steps into a single task
      const combinedTask = directExecutionSteps.map((step, index) => {
        return `Step ${index + 1}: ${step.task}`;
      }).join('\n\n');

      console.log('[MasterAgent] Combined task:', combinedTask);

      // Step 3: Notify task decomposition before execution
      await this.notifyTaskDecomposition(task, combinedTask, plan, _taskId);

      // Step 4: Execute combined task with single PTC generation
      steps.push({
        type: 'execution',
        content: 'Executing combined task',
        timestamp: Date.now(),
      });

      // Pass original task in context for better PTC generation
      const executionContext = {
        originalTask: task,  // Original user request
        combinedTask: combinedTask,  // MasterAgent's plan
        delegationPlan: plan  // Full delegation plan
      };

      const result = await super.run(combinedTask, _taskId, executionContext);

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

    // Use PromptBuilder for proper message construction
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

    const userPrompt = `<available_subagents>
${subagentsList}
</available_subagents>

<task>
${task}
</task>

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
5. **VIDEO GENERATION OR ENHANCEMENT TASKS** - ALWAYS handle directly
6. **FRONTEND/WEB DEVELOPMENT TASKS** - typically require creative design, not code analysis

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

<plan>
{
  "steps": [
    {
      "task": "specific task or subtask",
      "delegateTo": "subagent-name (optional - omit if handling directly)",
      "confidence": 85,
      "reason": "why this matches the subagent OR why handling directly"
    }
  ],
  "reasoning": "overall delegation strategy and rationale"
}
</plan>

## Examples

Example 1 - Perfect Match (confidence 95):
Task: "Review the authentication code in auth.ts for security issues"
→ Delegate to: security-auditor
→ Confidence: 95
→ Reason: "Explicit security review of authentication code directly matches security-auditor's specialty"

Example 2 - Strong Match (confidence 80):
Task: "Analyze the user_behavior.csv dataset and create visualizations"
→ Delegate to: data-analyst
→ Confidence: 80
→ Reason: "CSV analysis and visualization directly matches data-analyst's skills"

Example 3 - Low Confidence - Handle Directly (confidence 25):
Task: "Create an iPhone 18 product promotional webpage"
→ Handle directly
→ Confidence: 25
→ Reason: "Creative web development task, not code analysis. No subagent specializes in web page creation."

Example 4 - Vague Task (confidence 0):
Task: "Review the code"
→ Handle directly
→ Confidence: 0
→ Reason: "No specific file or domain mentioned - insufficient context for delegation"

Example 5 - Creative Task (confidence 15):
Task: "Generate a landing page for our product"
→ Handle directly
→ Confidence: 15
→ Reason: "Frontend development requires creative design, not code review or analysis. No relevant subagent."

Example 6 - Video Task (confidence 0):
Task: "Add animation highlights to the Pascal Triangle video"
→ Handle directly
→ Confidence: 0
→ Reason: "Video enhancement task - use remotion-generator skill directly"

## Important Rules:
- Output ONLY valid JSON inside <plan> tags
- Include "confidence" field (0-100) for every step
- Delegate ONLY when confidence >= 70 AND there's a clear domain match
- Omit "delegateTo" field if handling directly
- **CRITICAL**: Use EXACTLY the subagent name from the list above (lowercase with hyphens, e.g., "code-reviewer", "security-auditor"). Do NOT transform the name format.
- **CRITICAL**: CREATIVE tasks (web pages, content generation, new features) should ALWAYS be handled directly, NOT delegated
- Consider if the task has sufficient context (files, data, specifics)
- **CRITICAL**: If no subagent matches, NEVER use "none", "null", "master", or any placeholder as delegateTo value. Simply omit the "delegateTo" field entirely to indicate handling directly.
`;

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

    // Proper message structure: system message for instructions, user message for content
    const response = await this.llm.messagesCreate([
      { role: 'system' as const, content: systemPrompt },
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

    // Strategy 1: Extract from <plan> tags (non-greedy)
    let jsonMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedPlan = JSON.parse(jsonMatch[1]);
        console.log('[MasterAgent] Parsed plan using strategy 1 (<plan> tags)');
        return cacheAndReturn(parsedPlan);
      } catch (error: any) {
        lastError = error;
        console.warn('[MasterAgent] Strategy 1 failed:', error.message);
      }
    }

    // Strategy 2: Extract from <plan> tags (greedy, for multi-line)
    jsonMatch = response.content.match(/<plan>\s*(\{[\s\S]*?\})\s*<\/plan>/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedPlan = JSON.parse(jsonMatch[1]);
        console.log('[MasterAgent] Parsed plan using strategy 2 (<plan> tags, greedy)');
        return cacheAndReturn(parsedPlan);
      } catch (error: any) {
        lastError = error;
        console.warn('[MasterAgent] Strategy 2 failed:', error.message);
      }
    }

    // Strategy 3: Find any JSON object in the response
    jsonMatch = response.content.match(/\{[\s\S]*?\}/);
    if (jsonMatch && jsonMatch[0]) {
      try {
        parsedPlan = JSON.parse(jsonMatch[0]);
        console.log('[MasterAgent] Parsed plan using strategy 3 (raw JSON)');
        return cacheAndReturn(parsedPlan);
      } catch (error: any) {
        lastError = error;
        console.warn('[MasterAgent] Strategy 3 failed:', error.message);
      }
    }

    // Strategy 4: Try to find JSON between code blocks
    jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedPlan = JSON.parse(jsonMatch[1]);
        console.log('[MasterAgent] Parsed plan using strategy 4 (code block)');
        return cacheAndReturn(parsedPlan);
      } catch (error: any) {
        lastError = error;
        console.warn('[MasterAgent] Strategy 4 failed:', error.message);
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
   */
  private async getOrCreateSubagent(name: string): Promise<Agent> {
    if (this.subagents.has(name)) {
      return this.subagents.get(name)!;
    }

    // Create subagent instance
    // This is a simplified version - actual implementation would load full config
    const config = this.subagentConfigs.get(name);

    // Create unique sessionId for subagent with clear prefix
    // Using independent namespace to distinguish from master agent
    const subagentSessionId = `subagent-${name}-${Date.now()}`;

    const subagent = new Agent(
      {
        name,  // Set name for getSubjectInfo() to use as subjectSubTitle
        systemPrompt: config?.systemPrompt || `You are ${name}.`,
        availableSkills: config?.availableSkills || [],
        llm: this.config.llm,
        sandbox: this.config.sandbox,
      },
      subagentSessionId
    );

    this.subagents.set(name, subagent);

    console.log(`[MasterAgent] Created subagent: ${name}`, {
      subagentSessionId,
      masterSessionId: this.sessionId,
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
    delegationType: 'direct' | 'planned' = 'direct'
  ): Promise<AgentResult> {
    try {
      // For simplicity, delegate to the first subagent in the list
      const subagentName = delegates[0];

      // Record direct delegation in traces (bypassing LLM planning)
      // and send delegation planning notification to taskExecution stream (for chat display)
      const streams = getAgentStreams();
      if (streams && streams.executionTraces && taskId) {
        // 1. Record delegation planning trace
        const delegationId = `delegation-planning-${this.sessionId}-${Date.now()}`;
        await streams.executionTraces.set(taskId, delegationId, {
          id: delegationId,
          level: 'agent-internal',
          taskId,
          agentId: this.sessionId,
          stage: 'delegation_planning',
          status: 'completed',
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            delegationType: delegationType,  // 'direct' (user specified) or 'planned' (LLM decided)
            delegates: delegates,
            reasoning: delegationType === 'direct'
              ? `Direct delegation to ${subagentName} (user specified via delegateTo parameter)`
              : `Planned delegation to ${subagentName} (based on LLM analysis)`,
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
      const subagent = await this.getOrCreateSubagent(subagentName);

      // === Trigger subagent hooks (like step layer does for MasterAgent) ===
      const subagentContext = {
        agentType: 'Agent',
        agentId: (subagent as any).sessionId, // Access private sessionId via type assertion
        sessionId: (subagent as any).sessionId, // Add sessionId for notification hooks
        taskId: taskId, // Add taskId for notification hooks
        agent: subagent,
      };

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
      const result = await subagent.run(task, taskId);

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
        structuredOutputs: (result as any).structuredOutputs, // ← 添加这个字段
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
    return {
      name: config.name,
      description: config.description || `Subagent: ${name}`,
      systemPrompt,
      availableSkills: config.agent.available_skills || config.agent.availableSkills,
      constraints: config.agent.constraints,
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
