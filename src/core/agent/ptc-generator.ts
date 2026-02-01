/**
 * PTC (Programmatic Tool Calling) Code Generator.
 *
 * Implements two-step PTC generation:
 * 1. Planning: Select appropriate skills for the task
 * 2. Implementation: Generate Python code using selected skills
 */

import { LLMClient } from './llm-client';
import { PTCGenerationOptions, PTCResult } from './types';
import { SkillMetadata as FullSkillMetadata } from './skill-discovery';

/**
 * Simplified Skill Metadata for PTC Generator.
 * Includes metadata field for input_schema access.
 */
interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  metadata?: FullSkillMetadata['metadata'];
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
   * Generate PTC code for a given task and return full result with metadata.
   *
   * Two-step process:
   * 1. Plan: Select skills to use
   * 2. Implement: Generate Python code
   *
   * @param task - User task description
   * @param options - Generation options (including context)
   * @returns Generated PTC result with code, selected skills, and reasoning
   */
  async generateWithResult(task: string, options?: PTCGenerationOptions): Promise<PTCResult> {
    // Step 1: Plan - Select skills (with context)
    const plan = await this.planSkills(task, options);

    // Step 2: Implement - Generate Python code (with context)
    const code = await this.generateCode(task, plan.selectedSkills, options);

    return {
      code,
      selectedSkills: plan.selectedSkills,
      reasoning: plan.reasoning
    };
  }

  /**
   * Step 1: Planning phase - Select appropriate skills.
   */
  private async planSkills(task: string, options?: PTCGenerationOptions): Promise<PTCResult> {
    // Build skills list
    const skillsList = Array.from(this.skills.values())
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n');

    // Build context section
    let contextSection = '';

    // IMPORTANT: If originalTask is provided (from MasterAgent), use it as the primary task
    // This ensures the PTC code generator respects the original user request
    const originalTask = options?.variables?.originalTask || options?.originalTask;
    if (originalTask) {
      contextSection += `<original_task>\n${originalTask}\n</original_task>\n\n`;
      console.log('[PTC Generator] Using originalTask from context:', originalTask.substring(0, 100));
    }

    if (options?.history && options.history.length > 0) {
      contextSection += '<conversation_history>\n';
      for (const msg of options.history.slice(-5)) {
        // Last 5 messages
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

IMPORTANT GUIDELINES:
1. PRIORITIZE using available skills over direct computation or common knowledge
2. For factual questions (locations, definitions, facts), ALWAYS use web-search skill
3. For calculations, you can compute directly, but if uncertain, use appropriate skills
4. NEVER return an empty selected_skills array - at least use web-search for factual queries

5. VIDEO GENERATION AND MODIFICATION:
   - ALL video creation, enhancement, or modification tasks MUST use remotion-generator skill
   - When user asks to "add to video", "enhance video", "modify animation", or similar:
     * Use remotion-generator to regenerate the ENTIRE video with new features
     * DO NOT attempt to read or modify temporary Remotion code files (they are ephemeral)
     * DO NOT use read-file, code-analysis, or other file manipulation skills for video tasks
   - remotion-generator can handle the complete video generation process from description
   - Include all desired features in the description rather than trying to modify existing code

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection

CRITICAL: Output MUST be valid JSON with proper quoting.
- The "reasoning" value MUST be a string in double quotes
- All string values MUST be enclosed in double quotes
- Do NOT use unquoted strings
- selected_skills MUST NOT be an empty array

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1", "skill2"],
  "reasoning": "First use skill1 to ..., then skill2 to ..."
}
</plan>`;

    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);

    // Extract JSON - try multiple formats
    let jsonString: string | null = null;

    // Try format 1: <plan>{...}</plan>
    const planMatch = response.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (planMatch) {
      jsonString = planMatch[1].trim();
    }

    // Try format 2: ```json{...}```
    if (!jsonString) {
      const codeBlockMatch = response.content.match(/```json\s*(\{.*?\})\s*```/s);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      }
    }

    // Try format 3: ```{...}``` (generic code block)
    if (!jsonString) {
      const genericMatch = response.content.match(/```\s*(\{.*?\})\s*```/s);
      if (genericMatch) {
        jsonString = genericMatch[1].trim();
      }
    }

    // Try format 4: Plain JSON object (wrapped in braces)
    if (!jsonString) {
      const plainJsonMatch = response.content.match(/^\s*\{\s*["'].*?["']\s*:\s*.*?\}\s*$/s);
      if (plainJsonMatch) {
        jsonString = plainJsonMatch[0].trim();
      }
    }

    // If still no match, throw error
    if (!jsonString) {
      console.error('[PTC Generator] Failed to parse plan. Response:', response.content);
      throw new Error(
        `Failed to parse plan from LLM response. Expected <plan>{...}</plan>, \`\`\`json format, or plain JSON. Got: ${response.content.substring(0, 200)}`
      );
    }

    // Validate JSON string
    if (!jsonString || jsonString === '' || jsonString === 'null' || jsonString === 'undefined') {
      console.error('[PTC Generator] Invalid JSON string:', jsonString);
      throw new Error(`Invalid JSON in LLM response: contains undefined or is empty`);
    }

    let plan;
    try {
      plan = JSON.parse(jsonString);
    } catch (error: any) {
      console.error('[PTC Generator] JSON parse failed:', {
        error: error.message,
        jsonString: jsonString.substring(0, 500),
      });
      throw new Error(`Failed to parse plan JSON: ${error.message}`);
    }

    // Validate required fields - accept both 'selected_skills' and 'selected'
    const skillsArray = plan.selected_skills || plan.selected;
    if (!skillsArray || !Array.isArray(skillsArray)) {
      console.error('[PTC Generator] Missing or invalid selected_skills field:', plan);
      throw new Error(`Plan missing valid 'selected_skills' or 'selected' array`);
    }

    return {
      code: '', // Will be generated in step 2
      selectedSkills: skillsArray,
      reasoning: plan.reasoning || 'No reasoning provided',
    };
  }

  /**
   * Step 2: Implementation phase - Generate Python code.
   */
  private async generateCode(
    task: string,
    selectedSkills: string[],
    options?: PTCGenerationOptions
  ): Promise<string> {
    // Get skill details
    const skillsDetails = selectedSkills.map((skillName) => {
      const skill = this.skills.get(skillName);
      if (!skill) {
        throw new Error(`Skill '${skillName}' not found`);
      }
      return skill;
    });

    // Build skills block for prompt
    const skillsBlock = skillsDetails
      .map((skill) => {
        let skillInfo = `${skill.name}:
  Description: ${skill.description}
  Tags: ${skill.tags.join(', ')}`;

        // Add input schema if available
        if (skill.metadata && skill.metadata.input_schema) {
          const schema = skill.metadata.input_schema;
          if (schema.properties && Object.keys(schema.properties).length > 0) {
            skillInfo += '\n  Parameters:';
            for (const [paramName, paramInfo] of Object.entries(schema.properties)) {
              const info = paramInfo as { type?: string; description?: string; default?: any };
              const required = schema.required?.includes(paramName);
              const paramType = info.type || 'any';
              const paramDesc = info.description || '';
              const defaultValue = info.default !== undefined ? ` (default: ${info.default})` : '';
              skillInfo += `\n    - ${paramName} (${paramType})${required ? ' [REQUIRED]' : ''}${defaultValue}: ${paramDesc}`;
            }
          }
        }

        return skillInfo;
      })
      .join('\n\n');

    // Build context section
    let contextSection = '';

    // IMPORTANT: If originalTask is provided (from MasterAgent), use it as the primary task
    // This ensures the PTC code generator respects the original user request
    const originalTask = options?.variables?.originalTask || options?.originalTask;
    if (originalTask) {
      contextSection += `<original_task>\n${originalTask}\n</original_task>\n\n`;
      console.log('[PTC Generator] Using originalTask from context:', originalTask.substring(0, 100));
    }

    if (options?.history && options.history.length > 0) {
      contextSection += '<conversation_history>\n';
      for (const msg of options.history.slice(-5)) {
        // Last 5 messages
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

${originalTask ? `IMPORTANT INSTRUCTION:
The <original_task> in the <context> section above contains the USER'S ACTUAL REQUEST.
The <task> section is MasterAgent's execution plan.

YOU MUST:
1. Follow MasterAgent's execution plan (the <task> section)
2. But use the <original_task> to understand the TRUE INTENT and SPECIFIC REQUIREMENTS
3. If there's a conflict, prioritize the original_task's specific requirements over general plan steps

Example:
- If original_task says "Add animation highlights to emphasize number relationships"
- And task says "Step 1: Add animation highlights (Execute directly)"
- You MUST generate code that ADDS ANIMATIONS, not a generic Pascal Triangle video

` : ''}<skills>
${skillsBlock}
</skills>

<available_skills>
${selectedSkills.join(', ')}
</available_skills>

CRITICAL LANGUAGE REQUIREMENT:
- You MUST generate Python code ONLY
- Even if the task mentions TypeScript, JavaScript, or other languages
- This is a Python-only execution environment
- If the task asks for TypeScript/JavaScript code, you should:
  1. Generate Python equivalent code
  2. Add comments explaining the Python implementation
  3. Focus on logic/algorithm rather than language-specific syntax

Generate Python code to accomplish the task.

IMPORTANT - Code structure requirements:
- The code will be wrapped in an async main() function automatically
- DO NOT include 'async def main()' or 'if __name__ == "__main__"'
- DO NOT include 'asyncio.run()' - it will be called automatically
- DO NOT import asyncio
- Just write the logic code that goes inside the async function

${
  selectedSkills.length > 0
    ? `Available skills to use:
from core.skill.executor import SkillExecutor
from core.sandbox.retry_utils import execute_with_retry
import os

# Get notify API URL from environment
notify_hook_api_url = os.getenv('MOTIA_NOTIFY_API_URL')
task_id = os.getenv('MOTIA_TASK_ID')  # Task ID for tracking and file naming
executor = SkillExecutor(notify_hook_api_url=notify_hook_api_url)

# CRITICAL - Skill execution with RETRY logic:
# All skill executions MUST use execute_with_retry() function
# This implements orchestration-layer retry with exponential backoff

# execute_with_retry() signature:
#   result = await execute_with_retry(
#       execute_func=executor.execute,
#       skill_name='skill-name',
#       input_data={
#           'description': 'detailed task description',
#           'param2': 'value2'
#       },
#       max_attempts=3  # Max 3 retry attempts
#   )

# Result format (unified):
#   {
#       'success': bool,
#       'content': any,  # Actual output data
#       'result_type': str,
#       'metadata': dict,
#       'attempts': int  # Number of attempts made
#   }

# IMPORTANT: Always check result['success'] and extract result['content']:
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='skill-name',
    input_data={
        'description': 'detailed task description',
        'param2': 'value2'
    }
)

if result['success']:
    actual_output = result['content']  # Extract the real output
    print(f"Success after {result['attempts']} attempts")
else:
    error_message = result['content'].get('message', 'Unknown error')
    print(f"Failed after {result['attempts']} attempts: {error_message}")

# When chaining skills, pass result['content'] (NOT result) to the next skill:
result1 = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='first-skill',
    input_data={'param': 'value'}
)

if result1['success']:
    result2 = await execute_with_retry(
        execute_func=executor.execute,
        skill_name='second-skill',
        input_data={
            'description': 'process the result',
            'input_data': result1['content']  # Pass ['content'], not result1
        }
    )`
    : `No skills needed - solve the task directly with Python code.`
}

Code requirements:
- Use 'await' for any async operations (like skill execution)
- Print the final result
- DO NOT use try/except blocks (they are added automatically)
- Use proper indentation for multi-line dicts/lists:
  result = await executor.execute('skill-name', {
      'param1': 'value1',
      'param2': 'value2'
  })
- Only output the code logic, no function definitions or boilerplate

CRITICAL: You MUST wrap your code in \`\`\`python code blocks like this:
\`\`\`python
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='skill-name',
    input_data={
        'description': 'task description'
    }
)

if result['success']:
    print(result['content'])  # Print ['content'], not result
else:
    error = result['content'].get('message', 'Unknown error')
    print(f"Error: {error}")
\`\`\`

IMPORTANT REMINDERS:
- ALWAYS use execute_with_retry() for skill execution (NEVER call executor.execute directly)
- Check result['success'] to determine if execution succeeded
- Extract actual output from result['content'] (NOT result['output'])
- When passing results to another skill, pass result['content'] (NOT result)
- Check the skill's input schema to understand expected parameter types
- The retry logic will automatically handle transient failures (timeout, network errors)
- Non-retryable errors (validation, permission, not found) will fail immediately

TIPS FOR FILE/VIDEO GENERATION:
- Use 'task_id' variable for file naming: f"video_{task_id}.mp4" or f"output_{task_id}.txt"
- Available environment variables:
  - MOTIA_TASK_ID: Current task ID (use for file naming to track outputs)
  - MOTIA_NOTIFY_API_URL: API endpoint for progress notifications
  - MOTIA_SESSION_ID: Current session ID for multi-turn conversations
  - MOTIA_TRACE_ID: Trace ID for debugging

Generate the code now:`;

    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);

    // Extract code from code blocks - support multiple languages
    // Priority: python > typescript > javascript > generic
    let codeMatch: RegExpMatchArray | null = null;
    let matchedLanguage = '';

    // Try Python first (preferred for this system)
    codeMatch = response.content.match(/```python\s*(.*?)\s*```/s);
    if (codeMatch) {
      matchedLanguage = 'python';
    }

    // Try TypeScript (for frontend/Node.js tasks)
    if (!codeMatch) {
      codeMatch = response.content.match(/```typescript\s*(.*?)\s*```/s);
      if (codeMatch) matchedLanguage = 'typescript';
    }

    // Try JavaScript
    if (!codeMatch) {
      codeMatch = response.content.match(/```javascript\s*(.*?)\s*```/s);
      if (codeMatch) matchedLanguage = 'javascript';
    }

    // Try generic code block (```)
    if (!codeMatch) {
      codeMatch = response.content.match(/```\s*(.*?)\s*```/s);
      if (codeMatch) matchedLanguage = 'generic';
    }

    if (!codeMatch) {
      console.error('[PTC Generator] Failed to parse code. Response:', response.content);
      throw new Error(
        `Failed to parse code from LLM response. Expected code blocks (python/typescript/javascript). Got: ${response.content.substring(0, 200)}`
      );
    }

    console.log(`[PTC Generator] Parsed ${matchedLanguage} code block`);

    let code = codeMatch[1].trim();

    // Validate: If code is TypeScript/JavaScript but this is a Python-only system,
    // we should inform the user and potentially retry
    if (matchedLanguage === 'typescript' || matchedLanguage === 'javascript') {
      console.warn(`[PTC Generator] Warning: Generated ${matchedLanguage} code but this system only supports Python execution`);
      console.warn(`[PTC Generator] The task may require functionality that cannot be expressed in Python`);
      // Note: We don't throw here - let the sandbox handle it with a clear error message
      // This allows for future extension to Node.js sandbox
    }

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
