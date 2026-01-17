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

      // Step 2: Execute plan
      const results: any[] = [];
      let totalSkillCalls = 0;

      for (const step of plan.steps) {
        if (step.delegateTo) {
          // Delegate to subagent
          steps.push({
            type: 'delegation',
            content: `Delegating to ${step.delegateTo}: ${step.task}`,
            timestamp: Date.now(),
          });

          const subagent = await this.getOrCreateSubagent(step.delegateTo);
          const result = await subagent.run(step.task);

          results.push({
            subagent: step.delegateTo,
            result,
          });

          totalSkillCalls += result.metadata.skillCalls;
        } else {
          // Execute self
          steps.push({
            type: 'execution',
            content: `Executing self: ${step.task}`,
            timestamp: Date.now(),
          });

          const result = await super.run(step.task);

          results.push({
            self: true,
            result,
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
          totalTokens: 0,
        },
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
          totalTokens: 0,
        },
      };
    }
  }

  /**
   * Plan task execution with delegation decisions.
   * Uses LLM to intelligently delegate tasks to appropriate subagents.
   */
  private async planWithDelegation(task: string): Promise<DelegationPlan> {
    const subagentsList = Array.from(this.subagentConfigs.entries())
      .map(([name, config]) => {
        const skills = config?.availableSkills?.join(', ') || 'No skills';
        return `- ${name}: ${config?.description || 'No description'}
  Available skills: ${skills}`;
      })
      .join('\n');

    const prompt = `You are a master agent planning task execution with intelligent delegation.

<available_subagents
${subagentsList}
</available_subagents>

<task
${task}
</task>

Analyze the task and break it down into execution steps. For each step:
1. Determine if it matches a subagent's specialty (based on description and skills)
2. Delegate to the most appropriate subagent if there's a good match
3. Otherwise, handle it directly with the master agent

Output format (JSON):
<plan>
{
  "steps": [
    {"task": "subtask description", "delegateTo": "subagent-name", "reason": "why this subagent is appropriate"},
    {"task": "another subtask", "reason": "handled by master agent because..."}
  ],
  "reasoning": "Overall strategy: breakdown and delegation rationale"
}
</plan>

Important:
- Use "delegateTo" only when there's a clear match with a subagent's description or skills
- If no subagent is a good fit, omit "delegateTo" to execute with master agent
- Provide specific reasoning for each decision`;

    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);

    const jsonMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (!jsonMatch) {
      throw new Error('Failed to parse plan from LLM response');
    }

    // Validate JSON string before parsing
    const jsonString = jsonMatch[1];
    if (!jsonString || jsonString.trim() === '' || jsonString.includes('undefined')) {
      console.error('[Master Agent] Invalid JSON string:', jsonString);
      throw new Error('Invalid JSON in LLM response: contains undefined or is empty');
    }

    try {
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error('[Master Agent] JSON parse failed:', {
        error: error.message,
        jsonString: jsonString.substring(0, 500),
      });
      throw new Error(`Failed to parse plan JSON: ${error.message}`);
    }
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

Output format (JSON):
<synthesis>
{
  "summary": "brief summary of what was accomplished",
  "keyFindings": ["finding 1", "finding 2", ...],
  "consolidatedOutput": "merged and formatted output",
  "issues": ["any issues encountered", ...]
}
</synthesis>`;

    try {
      const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);
      const jsonMatch = response.content.match(/<synthesis>\s*(\{.*?\})\s*<\/synthesis>/s);
      
      if (jsonMatch) {
        const jsonString = jsonMatch[1];
        if (jsonString && jsonString.trim() !== '' && !jsonString.includes('undefined')) {
          try {
            return JSON.parse(jsonString);
          } catch (error: any) {
            console.warn('[MasterAgent] Failed to parse LLM synthesis, falling back to simple merge');
          }
        }
      }
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
