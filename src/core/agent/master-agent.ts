/**
 * MasterAgent class.
 *
 * Extends Agent with subagent delegation capabilities.
 * Can orchestrate multiple specialized subagents.
 */

import { Agent } from './agent';
import { MasterAgentConfig, AgentResult, DelegationPlan } from './types';
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

  // Delegation plan cache to reduce LLM calls
  private delegationPlansCache: Map<string, { plan: DelegationPlan; timestamp: number; cacheVersion: string }>;
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(config: MasterAgentConfig, sessionId: string) {
    super(config, sessionId);
    this.masterConfig = config; // Store typed config
    this.subagents = new Map();
    this.subagentConfigs = new Map();
    this.delegationPlansCache = new Map();

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

    try {
      // Step 1: Create delegation plan
      steps.push({
        type: 'planning',
        content: 'Creating delegation plan',
        timestamp: Date.now(),
        metadata: { task },
      });

      const plan = await this.planWithDelegation(task);

      steps.push({
        type: 'delegation',
        content: `Plan: ${plan.reasoning}`,
        timestamp: Date.now(),
        metadata: {
          steps: plan.steps.length,
          delegates: plan
            .steps.filter((s) => s.delegateTo)
            .map((s) => s.delegateTo),
        },
      });

      // Step 2: Combine all steps into a single task
      const combinedTask = plan.steps.map((step, index) => {
        return `Step ${index + 1}: ${step.task} (${step.delegateTo ? `Delegate to ${step.delegateTo}` : 'Execute directly'})`;
      }).join('\n\n');

      console.log('[MasterAgent] Combined task:', combinedTask);

      // Step 3: Execute combined task with single PTC generation
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
            .filter((s) => s.delegateTo !== undefined)
            .map((s) => s.delegateTo as string),
          skillNames: result.metadata.skillNames,
        },
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
  private async planWithDelegation(task: string): Promise<DelegationPlan> {
    // Step 1: Check cache first
    const cachedPlan = this.getCachedPlan(task);
    if (cachedPlan) {
      console.log('[MasterAgent] Using cached delegation plan');
      return cachedPlan;
    }

    // Step 2: Not in cache, create new plan
    // Dynamically generate subagent descriptions with specialties
    const subagentsList = Array.from(this.subagentConfigs.entries())
      .map(([name, config]) => {
        const description = config?.description || 'No description';
        const skillsArray = config?.availableSkills || [];
        const skills = skillsArray.length > 0 ? skillsArray.join(', ') : 'No skills';

        // Extract key capabilities from description and skills
        const keywords = this.extractSubagentKeywords(description, skillsArray);

        return `- ${name}:
  Description: ${description}
  Skills: ${skills}
  Keywords: ${keywords.join(', ')}`;
      })
      .join('\n\n');

    const prompt = `You are a master agent planning task execution with intelligent delegation to specialized subagents.

<available_subagents>
${subagentsList}
</available_subagents>

<task>
${task}
</task>

## Delegation Strategy

Analyze the task and decide: delegate to a specialized subagent OR handle with master agent.

### When to DELEGATE:
1. The task clearly matches a subagent's description (keywords overlap)
2. The task uses skills that a subagent has available
3. The subagent's specialty is relevant to the task

### When to HANDLE DIRECTLY:
1. No subagent's specialty matches the task
2. The task is too vague (e.g., "review the code" without specifying which file)
3. The task requires general capabilities not tied to any subagent
4. Multiple subagents could handle it - better to handle with master
5. **VIDEO GENERATION OR ENHANCEMENT TASKS** - These should ALWAYS be handled directly using remotion-generator skill:
   - Tasks mentioning "video", "animation", "visual", "render", "motion graphics"
   - Tasks to "create", "generate", "enhance", "add to", "modify", "update" videos
   - Tasks involving Remotion, video editing, visual effects, animations
   - Example: "Add animation highlights to the video", "Create a Pascal Triangle video"
   - **DO NOT delegate video tasks to subagents - handle them directly**

### Decision Process:
1. Extract key concepts and requirements from the task
2. Match against subagent descriptions, skills, and keywords
3. Check if the task has sufficient context (file paths, data, specifics)
4. Delegate if there's a CLEAR and SPECIFIC match
5. Otherwise, handle directly

## Response Format

<plan>
{
  "steps": [
    {
      "task": "specific task or subtask",
      "delegateTo": "subagent-name (optional - omit if handling directly)",
      "reason": "why this matches the subagent OR why handling directly"
    }
  ],
  "reasoning": "overall delegation strategy and rationale"
}
</plan>

## Examples

Example 1 - Clear Match:
Task: "Review the authentication code in auth.ts for security issues"
→ Delegate to: security-auditor
→ Reason: "Security review of auth code matches security-auditor's specialty"

Example 2 - Vague Task:
Task: "Review the code"
→ Handle directly: "No specific file mentioned - need clarification"

Example 3 - No Match:
Task: "Calculate the meaning of life"
→ Handle directly: "No subagent specializes in philosophical questions"

Example 4 - Video Task (HANDLE DIRECTLY):
Task: "Add animation highlights to the Pascal Triangle video"
Handle directly: "Video enhancement task - use remotion-generator skill directly, DO NOT delegate"
Reason: "Video generation/enhancement tasks should always be handled directly using skills"

## Important Rules:
- Output ONLY valid JSON inside <plan> tags
- Delegate ONLY when there's a clear, specific match
- Omit "delegateTo" field if handling directly
- **CRITICAL**: Use EXACTLY the subagent name from the list above (lowercase with hyphens, e.g., "code-reviewer", "security-auditor"). Do NOT transform the name format.
- Provide specific reasoning based on descriptions and skills
- Consider if the task has sufficient context (files, data, specifics)
`;

    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }], {}, 'delegation planning');

    // Try multiple parsing strategies
    let parsedPlan: any = null;
    let lastError: Error | null = null;

    // Helper to cache and return plan
    const cacheAndReturn = (plan: DelegationPlan): DelegationPlan => {
      this.cachePlan(task, plan);
      return plan;
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

    // Create unique sessionId for subagent: masterSessionId-subagentName
    const subagentSessionId = `${this.sessionId}-${name}`;

    const subagent = new Agent(
      {
        systemPrompt: config?.systemPrompt || `You are ${name}.`,
        availableSkills: config?.availableSkills || [],
        llm: this.config.llm,
        sandbox: this.config.sandbox,
      },
      subagentSessionId
    );

    this.subagents.set(name, subagent);

    return subagent;
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
      const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }], {}, 'results synthesis');

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
}
