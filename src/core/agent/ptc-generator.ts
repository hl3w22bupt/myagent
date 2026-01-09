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
   * @param options - Generation options
   * @returns Generated PTC code and metadata
   */
  async generate(task: string, options?: PTCGenerationOptions): Promise<string> {
    // Step 1: Plan - Select skills
    const plan = await this.planSkills(task);

    // Step 2: Implement - Generate Python code
    const code = await this.generateCode(task, plan.selectedSkills);

    return code;
  }

  /**
   * Step 1: Planning phase - Select appropriate skills.
   */
  private async planSkills(task: string): Promise<PTCResult> {
    // Build skills list
    const skillsList = Array.from(this.skills.values())
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');

    const prompt = `You are an agent that plans task execution by selecting skills.

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

    // Extract JSON from response
    const jsonMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (!jsonMatch) {
      throw new Error('Failed to parse plan from LLM response');
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
  private async generateCode(task: string, selectedSkills: string[]): Promise<string> {
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

    const prompt = `<task>
${task}
</task>

<skills>
${skillsBlock}
</skills>

<available_skills>
${selectedSkills.join(', ')}
</available_skills>

Generate Python code using this pattern:

<code>
from skill_executor import SkillExecutor

executor = SkillExecutor()

# Use the selected skills to accomplish the task
result1 = await executor.execute('skill-name', {'param': 'value'})

# Process results and print final output
print(result)
</code>

Important:
- Use async/await for all skill executions
- Print the final result
- Handle errors gracefully with try/except
- Only output the Python code, no explanations

Generate the code now:`;

    const response = await this.llm.messagesCreate([
      { role: 'user', content: prompt }
    ]);

    // Extract code from response
    // Try multiple code block formats
    let codeMatch = response.content.match(/```python\s*(.*?)\s*```/s);
    if (!codeMatch) {
      codeMatch = response.content.match(/<code>\s*(.*?)\s*<\/code>/s);
    }
    if (!codeMatch) {
      throw new Error('Failed to parse code from LLM response');
    }

    return codeMatch[1].trim();
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
