/**
 * MasterAgent class.
 *
 * Extends Agent with subagent delegation capabilities.
 * Can orchestrate multiple specialized subagents.
 */

import { Agent } from './agent';
import { MasterAgentConfig, AgentResult, DelegationPlan } from './types';
import { Anthropic } from '@anthropic-ai/sdk';

/**
 * Master Agent with delegation capabilities.
 */
export class MasterAgent extends Agent {
  private subagents: Map<string, Agent>;
  private subagentConfigs: Map<string, any>;

  constructor(config: MasterAgentConfig, sessionId: string) {
    super(config, sessionId);
    this.subagents = new Map();
    this.subagentConfigs = new Map();

    // Load subagent configurations
    // In production, this would load from subagents/{name}/agent.yaml
    this.loadSubagentConfigs(config.subagents);
  }

  /**
   * Run task with possible delegation to subagents.
   */
  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    try {
      // Step 1: Create delegation plan
      steps.push({
        type: 'planning',
        content: 'Creating delegation plan',
        timestamp: Date.now(),
        metadata: { task }
      });

      const plan = await this.planWithDelegation(task);

      steps.push({
        type: 'delegation',
        content: `Plan: ${plan.reasoning}`,
        timestamp: Date.now(),
        metadata: {
          steps: plan.steps.length,
          delegates: plan.steps.filter(s => s.delegateTo).map(s => s.delegateTo)
        }
      });

      // Step 2: Execute plan
      const results: any[] = [];
      let totalSkillCalls = 0;

      for (const step of plan.steps) {
        if (step.delegateTo) {
          // Delegate to subagent
          steps.push({
            type: 'delegation',
            content: `Delegating to ${step.delegateTo}: ${step.task}`,
            timestamp: Date.now()
          });

          const subagent = await this.getOrCreateSubagent(step.delegateTo);
          const result = await subagent.run(step.task);

          results.push({
            subagent: step.delegateTo,
            result
          });

          totalSkillCalls += result.metadata.skillCalls;
        } else {
          // Execute self
          steps.push({
            type: 'execution',
            content: `Executing self: ${step.task}`,
            timestamp: Date.now()
          });

          const result = await super.run(step.task);

          results.push({
            self: true,
            result
          });

          totalSkillCalls += result.metadata.skillCalls;
        }
      }

      // Step 3: Synthesize results
      const finalResult = await this.synthesizeResults(results);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: finalResult,
        steps,
        executionTime,
        metadata: {
          llmCalls: 1,
          skillCalls: totalSkillCalls,
          totalTokens: 0
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          llmCalls: 1,
          skillCalls: 0,
          totalTokens: 0
        }
      };
    }
  }

  /**
   * Plan task execution with delegation decisions.
   */
  private async planWithDelegation(task: string): Promise<DelegationPlan> {
    const subagentsList = Array.from(this.subagentConfigs.keys()).map(name => {
      const config = this.subagentConfigs.get(name);
      return `- ${name}: ${config?.description || 'No description'}`;
    }).join('\n');

    const prompt = `You are a master agent planning task execution with delegation.

<available_subagents>
${subagentsList}
</available_subagents>

<task>
${task}
</task>

Create a plan breaking down the task into steps. For each step, decide:
1. Should this be delegated to a subagent? If yes, which one?
2. Or should the master agent handle it directly?

Output format (JSON):
<plan>
{
  "steps": [
    {"task": "subtask 1", "delegateTo": "subagent-name", "reason": "..."},
    {"task": "subtask 2", "reason": "..."}  // No delegateTo means execute self
  ],
  "reasoning": "Overall strategy explanation"
}
</plan>`;

    const response = await this.llm.messagesCreate([
      { role: 'user', content: prompt }
    ]);

    const jsonMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (!jsonMatch) {
      throw new Error('Failed to parse plan from LLM response');
    }

    return JSON.parse(jsonMatch[1]);
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

    const subagent = new Agent({
      systemPrompt: config?.systemPrompt || `You are ${name}.`,
      availableSkills: config?.availableSkills || [],
      llm: this.config.llm,
      sandbox: this.config.sandbox
    }, subagentSessionId);

    this.subagents.set(name, subagent);

    return subagent;
  }

  /**
   * Synthesize results from multiple executions.
   */
  private async synthesizeResults(results: any[]): Promise<any> {
    // Simple synthesis: combine all outputs
    // In production, use LLM to intelligently merge results
    return {
      results,
      summary: `Executed ${results.length} steps successfully`,
      details: results.map((r, i) => ({
        step: i + 1,
        type: r.self ? 'self' : `delegated to ${r.subagent}`,
        success: r.result.success
      }))
    };
  }

  /**
   * Load subagent configurations.
   */
  private loadSubagentConfigs(subagentNames: string[]): void {
    // In production, load from subagents/{name}/agent.yaml
    // For now, use placeholder configs
    const defaultSubagents = {
      'code-reviewer': {
        description: 'Specialized agent for code review',
        systemPrompt: 'You are a code review expert.',
        availableSkills: ['code-analysis', 'read-file', 'git-diff']
      },
      'data-analyst': {
        description: 'Specialized agent for data analysis',
        systemPrompt: 'You are a data analysis expert.',
        availableSkills: ['data-processing', 'visualization']
      },
      'security-auditor': {
        description: 'Specialized agent for security auditing',
        systemPrompt: 'You are a security expert.',
        availableSkills: ['security-scan', 'dependency-check']
      }
    };

    for (const name of subagentNames) {
      if (defaultSubagents[name as keyof typeof defaultSubagents]) {
        this.subagentConfigs.set(name, defaultSubagents[name as keyof typeof defaultSubagents]);
      }
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
      subagents: Array.from(this.subagentConfigs.keys())
    };
  }
}
