/**
 * PTC (Programmatic Tool Calling) Code Generator.
 *
 * Implements two-step PTC generation:
 * 1. Planning: Select appropriate skills for the task
 * 2. Implementation: Generate Python code using selected skills
 */

import { LLMClient } from './llm-client';
import { PTCGenerationOptions, PTCResult } from './types';

/**
 * Simple in-memory Skill Registry metadata.
 * In production, this would be loaded from the actual SkillRegistry.
 */
interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
}

/**
 * PTC Generator for creating Python tool-calling code.
 */
export class PTCGenerator {
  private llm: LLMClient;
  private skills: Map<string, SkillMetadata>;

  constructor(llm: LLMClient, skills: SkillMetadata[]) {
    this.llm = llm;
    this.skills = new Map();
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  /**
   * Generate PTC code for a given task.
   *
   * Two-step process:
   * 1. Plan: Select skills to use
   * 2. Implement: Generate Python code
   *
   * @param task - User task description
   * @param options - Generation options (including context)
   * @returns Generated PTC code and metadata
   */
  async generate(task: string, options?: PTCGenerationOptions): Promise<string> {
    // Step 1: Plan - Select skills (with context)
    const plan = await this.planSkills(task, options);

    // Step 2: Implement - Generate Python code (with context)
    const code = await this.generateCode(task, plan.selectedSkills, options);

    return code;
  }

  /**
   * Step 1: Planning phase - Select appropriate skills.
   */
  private async planSkills(task: string, options?: PTCGenerationOptions): Promise<PTCResult> {
    // Build skills list
    const skillsList = Array.from(this.skills.values())
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');

    // Build context section
    let contextSection = '';
    if (options?.history && options.history.length > 0) {
      contextSection = '<conversation_history>\n';
      for (const msg of options.history.slice(-5)) {  // Last 5 messages
        contextSection += `${msg.role}: ${msg.content}\n`;
      }
      contextSection += '</conversation_history>\n\n';
    }

    if (options?.variables && Object.keys(options.variables).length > 0) {
      contextSection += '<available_variables>\n';
      for (const [key, value] of Object.entries(options.variables)) {
        contextSection += `${key}: ${JSON.stringify(value)}\n`;
      }
      contextSection += '</available_variables>\n\n';
    }

    const prompt = `You are an agent that plans task execution by selecting skills.

${contextSection}
<available_skills>
${skillsList}
</available_skills>

<task>
${task}
</task>

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1", "skill2"],
  "reasoning": "First use skill1 to ..., then skill2 to ..."
}
</plan>`;

    const response = await this.llm.messagesCreate([
      { role: 'user', content: prompt }
    ]);

    // DEBUG: Log LLM response
    console.log('[PTC Generator] LLM Response:', response.content);

    // Extract JSON from response - try multiple patterns
    let jsonMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);

    // Fallback 1: Try to find any JSON object with selected_skills
    if (!jsonMatch) {
      jsonMatch = response.content.match(/\{[\s\S]*"selected_skills"[\s\S]*\}/);
    }

    // Fallback 2: Try to find JSON in code blocks
    if (!jsonMatch) {
      const codeBlockMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          jsonMatch = [null, codeBlockMatch[1]];
        } catch (e) {
          // Continue to next fallback
        }
      }
    }

    if (!jsonMatch) {
      console.error('[PTC Generator] Failed to parse plan. Response:', response.content);
      throw new Error(`Failed to parse plan from LLM response. Got: ${response.content.substring(0, 200)}`);
    }

    const plan = JSON.parse(jsonMatch[1]);

    return {
      code: '', // Will be generated in step 2
      selectedSkills: plan.selected_skills,
      reasoning: plan.reasoning
    };
  }

  /**
   * Step 2: Implementation phase - Generate Python code.
   */
  private async generateCode(task: string, selectedSkills: string[], options?: PTCGenerationOptions): Promise<string> {
    // Get skill details
    const skillsDetails = selectedSkills.map(skillName => {
      const skill = this.skills.get(skillName);
      if (!skill) {
        throw new Error(`Skill '${skillName}' not found`);
      }
      return skill;
    });

    // Build skills block for prompt
    const skillsBlock = skillsDetails.map(skill => {
      return `${skill.name}:
  Description: ${skill.description}
  Tags: ${skill.tags.join(', ')}`;
    }).join('\n\n');

    // Build context section
    let contextSection = '';
    if (options?.history && options.history.length > 0) {
      contextSection = '<conversation_history>\n';
      for (const msg of options.history.slice(-5)) {  // Last 5 messages
        contextSection += `${msg.role}: ${msg.content}\n`;
      }
      contextSection += '</conversation_history>\n\n';
    }

    if (options?.variables && Object.keys(options.variables).length > 0) {
      contextSection += '<available_variables>\n';
      for (const [key, value] of Object.entries(options.variables)) {
        contextSection += `${key}: ${JSON.stringify(value)}\n`;
      }
      contextSection += '</available_variables>\n\n';
    }

    const prompt = `<context>
${contextSection}
</context>

<task>
${task}
</task>

<skills>
${skillsBlock}
</skills>

<available_skills>
${selectedSkills.join(', ')}
</available_skills>

Generate Python code to accomplish the task.

IMPORTANT - Code structure requirements:
- The code will be wrapped in an async main() function automatically
- DO NOT include 'async def main()' or 'if __name__ == "__main__"'
- DO NOT include 'asyncio.run()' - it will be called automatically
- DO NOT import asyncio
- Just write the logic code that goes inside the async function

${selectedSkills.length > 0 ? `Available skills to use:
from core.skill.executor import SkillExecutor
executor = SkillExecutor()

# Use skills with await:
result = await executor.execute('skill-name', {'param': 'value'})` : `No skills needed - solve the task directly with Python code.`}

Code requirements:
- Use 'await' for any async operations (like skill execution)
- Print the final result
- Handle errors gracefully with try/except
- Only output the code logic, no function definitions or boilerplate

Generate the code now:`;

    const response = await this.llm.messagesCreate([
      { role: 'user', content: prompt }
    ]);

    // DEBUG: Log LLM response
    console.log('[PTC Generator] Code Generation Response:', response.content);

    // Extract code from response
    // Try multiple code block formats
    let codeMatch = response.content.match(/```python\s*(.*?)\s*```/s);
    if (!codeMatch) {
      codeMatch = response.content.match(/```(\s*.*?)\s*```/s); // Generic code block
    }
    if (!codeMatch) {
      codeMatch = response.content.match(/<code>\s*(.*?)\s*<\/code>/s);
    }
    if (!codeMatch) {
      // Last resort: try to extract code after specific markers
      codeMatch = response.content.match(/(?:Generate the code now:?|Code:?\s*)([\s\S]*?)(?:\n\n|\n*$|$)/i);
    }
    if (!codeMatch) {
      console.error('[PTC Generator] Failed to parse code. Response:', response.content);
      throw new Error('Failed to parse code from LLM response');
    }

    let code = codeMatch[1].trim();

    // Clean up: remove common unwanted patterns
    code = code
      .replace(/^async def main\(\):[\s\S]*?$/m, '') // Remove async def main() if present
      .replace(/^if __name__ == ["']__main__["']:[\s\S]*?$/m, '') // Remove if __name__ check
      .replace(/^import asyncio\s*$/m, '') // Remove asyncio imports
      .replace(/^asyncio\.run\(main\(\)\)\s*$/m, '') // Remove asyncio.run() calls
      .trim();

    // Validate: code should not be empty
    if (!code || code.length < 5) {
      console.error('[PTC Generator] Extracted code is too short. Response:', response.content);
      throw new Error('Extracted code is too short or empty');
    }

    return code;
  }

  /**
   * Get list of available skills.
   */
  getAvailableSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Add a skill to the registry.
   */
  addSkill(skill: SkillMetadata): void {
    this.skills.set(skill.name, skill);
  }
}
