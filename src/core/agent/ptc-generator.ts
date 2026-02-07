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
   * Extract user-specified skills from the task description.
   * Detects patterns like "use X skill", "with Y skill", "using Z skill"
   */
  private extractUserSpecifiedSkills(task: string): string[] {
    const specifiedSkills: string[] = [];

    // Common patterns for skill specification
    const patterns = [
      /use\s+(?:the\s+)?(\w+(?:\s+skill))?/gi,
      /with\s+(?:the\s+)?(\w+(?:\s+skill))?/gi,
      /using\s+(?:the\s+)?(\w+(?:\s+skill))?/gi,
      /apply\s+(?:the\s+)?(\w+(?:\s+skill))?/gi,
      /call\s+(?:the\s+)?(\w+(?:\s+skill))?/gi,
      /(?:execute|run|invoke)\s+(?:the\s+)?(\w+(?:\s+skill))?/gi
    ];

    // Get all available skill names
    const availableSkillNames = Array.from(this.skills.keys());

    for (const pattern of patterns) {
      const matches = task.matchAll(pattern);
      for (const match of matches) {
        const skillName = match[1]?.toLowerCase().trim();
        if (!skillName) continue;

        // Find matching skill (case-insensitive)
        const matchedSkill = availableSkillNames.find(
          name => name.toLowerCase().includes(skillName) || skillName.includes(name.toLowerCase())
        );

        if (matchedSkill && !specifiedSkills.includes(matchedSkill)) {
          specifiedSkills.push(matchedSkill);
        }
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(specifiedSkills)];
  }

  /**
   * Step 1: Planning phase - Select appropriate skills.
   */
  private async planSkills(task: string, options?: PTCGenerationOptions): Promise<PTCResult> {
    // Build skills list
    const skillsList = Array.from(this.skills.values())
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n');

    // Note: If skills are filtered, the available list is already reduced
    // The constraint is implicit - only filtered skills are shown in the list

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

    // 检测用户明确要求的技能
    const explicitlyRequestedSkills: string[] = [];
    const skillNames = Array.from(this.skills.keys());

    for (const skillName of skillNames) {
      // 匹配多种表达方式：
      // - "use X skill"
      // - "using X"
      // - "with X skill"
      // - "X skill to"
      const patterns = [
        new RegExp(`use\\s+${skillName}\\s+skill`, 'i'),
        new RegExp(`using\\s+${skillName}`, 'i'),
        new RegExp(`with\\s+${skillName}\\s+skill`, 'i'),
        new RegExp(`${skillName}\\s+skill\\s+to`, 'i'),
        new RegExp(`use\\s+the\\s+${skillName}`, 'i'),
        new RegExp(`${skillName}\\s+must`, 'i'),
      ];

      if (patterns.some(pattern => pattern.test(task))) {
        explicitlyRequestedSkills.push(skillName);
      }
    }

    // 构建技能要求指令
    let skillRequirement = '';
    if (explicitlyRequestedSkills.length > 0) {
      skillRequirement = `
CRITICAL - USER EXPLICITLY REQUESTED SKILLS:
The user has explicitly requested the following skills:
${explicitlyRequestedSkills.map(s => `- ${s}`).join('\n')}

YOU MUST USE THESE SKILLS in your selected_skills array.
DO NOT ignore user's explicit skill requests.
DO NOT attempt to solve the task without using these skills.
These skills take priority over all other considerations.
`;
    }

    const prompt = `You are an agent that plans task execution by selecting skills.

${contextSection}
<available_skills>
${skillsList}
</available_skills>

<task>
${task}
</task>

${skillRequirement}

CRITICAL - SKILL NAME VALIDATION:
1. You MUST ONLY use skill names from the EXACT list above
2. DO NOT create, invent, or combine skill names
3. DO NOT make assumptions about skill names - use them EXACTLY as shown
4. For example:
   - ✅ CORRECT: Use "simple-code-generator" (exact match)
   - ❌ WRONG: Do NOT use "code_generator", "code-gen", "generator", etc.
   - ✅ CORRECT: Use "frontend-design" (exact match)
   - ❌ WRONG: Do NOT use "web-design", "ui-design", etc.
5. If a task mentions "code" or "generator", use "simple-code-generator"
6. If a task mentions "web" or "frontend", use "frontend-design"
7. The skill list above is the ONLY source of truth for valid skill names
8. NEVER try to guess or infer a skill name - always use exact match from the list

IMPORTANT GUIDELINES:
1. You MUST ONLY select skills from the available list above (${this.skills.size} skills provided)
2. PRIORITIZE using available skills over direct computation or common knowledge
3. For factual questions (locations, definitions, facts), ALWAYS use web-search skill
4. For calculations, you can compute directly, but if uncertain, use appropriate skills
5. NEVER return an empty selected_skills array - at least use web-search for factual queries
6. ${explicitlyRequestedSkills.length > 0 ?
   'CRITICAL: User explicitly requested skills - YOU MUST include them in selected_skills' :
   'If user mentions specific skills (e.g., "use X skill", "using Y"), you MUST select those skills'}

7. VIDEO GENERATION AND MODIFICATION:
   - ALL video creation, enhancement, or modification tasks MUST use remotion-generator skill
   - When user asks to "add to video", "enhance video", "modify animation", or similar:
     * Use remotion-generator to regenerate the ENTIRE video with new features
     * DO NOT attempt to read or modify temporary Remotion code files (they are ephemeral)
     * DO NOT use read-file, code-analysis, or other file manipulation skills for video tasks
   - remotion-generator can handle the complete video generation process from description
   - Include all desired features in the description rather than trying to modify existing code

8. CODE GENERATION TASKS:
   - When user asks to "generate code", "create a function", "write code":
     * Use "simple-code-generator" skill (NOT "code_generator")
     * DO NOT write code directly in the PTC code
     * Let the skill handle the code generation

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

    // ✅ 新增：验证技能名称
    const availableSkillNames = new Set(this.skills.keys());
    const invalidSkills = skillsArray.filter(
      (skill: string) => !availableSkillNames.has(skill)
    );

    if (invalidSkills.length > 0) {
      const suggestions = invalidSkills.map((skill: string) => {
        // 查找相似的技能名称
        const similar = this.findSimilarSkillName(skill);
        return {
          invalid: skill,
          suggestion: similar || null
        };
      });

      console.error('[PTC Generator] LLM returned invalid skill names', {
        invalidSkills,
        suggestions,
        availableSkills: Array.from(availableSkillNames)
      });

      const suggestionMessages = suggestions
        .filter(s => s.suggestion)
        .map(s => `Did you mean "${s.suggestion}" instead of "${s.invalid}"?`)
        .join(' ');

      throw new Error(
        `Invalid skill names selected: ${invalidSkills.join(', ')}. ` +
        `Available skills: ${Array.from(availableSkillNames).join(', ')}. ` +
        suggestionMessages
      );
    }

    console.info('[PTC Generator] Skills validated successfully', {
      selectedSkills: skillsArray
    });

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

    // Build parameter mapping for debugging
    const paramMapping: Record<string, string> = {};
    for (const skill of skillsDetails) {
      const taskParam = this.findTaskParameter(skill.name);
      paramMapping[skill.name] = taskParam;
    }

    console.info('[PTC Generator] Parameter mapping:', {
      mapping: paramMapping
    });

    // Build skills block for prompt
    const skillsBlock = skillsDetails
      .map((skill) => {
        const taskParam = this.findTaskParameter(skill.name);

        let skillInfo = `${skill.name}:
  Description: ${skill.description}
  Tags: ${skill.tags.join(', ')}
  Task Parameter: ${taskParam}`;

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
              const marker = paramName === taskParam ? ' ← MAIN TASK PARAMETER' : '';
              skillInfo += `\n    - ${paramName}${marker} (${paramType})${required ? ' [REQUIRED]' : ''}${defaultValue}: ${paramDesc}`;
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
    ? (() => {
        // Build parameter mapping instructions for each selected skill
        const skillParamInstructions = skillsDetails.map((skill, index) => {
          const taskParam = this.findTaskParameter(skill.name);
          return `# Skill ${index + 1}: ${skill.name}
# - Use '${taskParam}' parameter for the main task
# - Check the skill's parameter schema above for other required/optional parameters`;
        }).join('\n\n');

        const firstSkillParam = this.findTaskParameter(selectedSkills[0]);

        // Build skill-specific content preparation instructions
        let skillContentPrep = '';
        if (selectedSkills.includes('infographic-generator')) {
          skillContentPrep = `
# CRITICAL - INFOGRAPHIC CONTENT PREPARATION:
# infographic-generator needs DETAILED, STRUCTURED content - NOT just a brief task!
#
# When user gives a short instruction like "生成软件生命周期图", you MUST:
# 1. INTELLIGENTLY EXPAND the content based on the topic
# 2. Generate a DETAILED, STRUCTURED description with all stages/steps
# 3. Use proper format: numbered list, bullet points, or clear stages
#
# Example (WRONG - too brief):
#   content='生成一个软件生命周期图'  # ❌ This will produce poor results!
#
# Example (CORRECT - detailed and structured):
#   content='''
#   软件生命周期包括以下阶段：
#   1. 需求分析：明确用户需求和系统目标
#   2. 系统设计：架构设计、技术选型
#   3. 编码实现：开发功能模块
#   4. 测试验证：单元测试、集成测试
#   5. 部署上线：发布到生产环境
#   6. 运维监控：系统维护和性能监控
#   7. 退役更新：版本迭代或系统下线
#   '''  # ✅ Detailed, structured content!
#
# Common patterns you should expand:
# - "软件生命周期" → List all stages (需求→设计→开发→测试→部署→维护)
# - "产品开发流程" → List complete process steps
# - "技术栈对比" → Create detailed comparison items
# - "系统架构" → List all components and layers
# - "数据流程" → Show data flow through stages
#
# REMEMBER: The infographic-generator needs RICH, DETAILED content to create good visuals!
`;
        }

        return `CRITICAL - SKILL EXECUTION IS MANDATORY:
You have selected skills: ${selectedSkills.join(', ')}
You MUST use these skills - DO NOT write native Python code!

${skillParamInstructions}

Available skills:
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
#           '${firstSkillParam}': 'THE ACTUAL TASK FROM <task> SECTION ABOVE',  # CRITICAL: Use the mapped parameter name!
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
${skillContentPrep}
# CRITICAL - HOW TO PASS USER TASK TO SKILLS:
# You MUST use the '${firstSkillParam}' field to pass the actual user request
# Copy the COMPLETE task description from the <task> section above
# For infographic-generator: EXPAND brief instructions into DETAILED structured content!
# DO NOT use placeholders like 'task description' or 'detailed task'
#
# Example (WRONG - uses placeholder):
#   input_data={'description': 'task description'}  # ❌ This will fail!
#
# Example (CORRECT - uses actual task):
#   input_data={'${firstSkillParam}': '设计一个iphone17产品的前端介绍页面'}  # ✅ Copy from <task> section!

# MANDATORY: You must call execute_with_retry with the selected skill
# DO NOT write any Python code directly - ONLY call skills!

result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='${selectedSkills[0]}',  # MANDATORY: Use the selected skill
    input_data={
        '${firstSkillParam}': 'COPY THE ACTUAL TASK FROM <task> SECTION',  # CRITICAL: Use mapped parameter name!
        # Add other required parameters based on skill schema
    }
)

if result['success']:
    actual_output = result['content']  # Extract the real output
    print(f"Success after {result['attempts']} attempts")
else:
    error_message = result['content'].get('message', 'Unknown error')
    print(f"Failed after {result['attempts']} attempts: {error_message}")

# When chaining skills, pass result['content'] (NOT result) to the next skill:
# IMPORTANT: Check the Task Parameter for each skill in the SKILL PARAMETER MAPPING above
result1 = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='first-skill',
    input_data={
        'TASK_PARAM_FOR_FIRST_SKILL': 'COPY ACTUAL TASK FROM <task> SECTION'
    }
)

if result1['success']:
    result2 = await execute_with_retry(
        execute_func=executor.execute,
        skill_name='second-skill',
        input_data={
            'TASK_PARAM_FOR_SECOND_SKILL': 'process result from first skill',
            'input_data': result1['content']  # Pass ['content'], not result1
        }
    )`;
      })()
    : `CRITICAL - NO SKILLS SELECTED:
This is a FALLBACK path - you should only be here if NO skills matched the task.

You MUST solve the task directly with native Python code.
DO NOT try to call executor.execute() - no skills are available.

Write pure Python code to solve the task.
Use standard libraries and any available imports.
Print or return the result directly.`
}

Code requirements:

CRITICAL - USER TASK MUST BE PASSED CORRECTLY:
- When calling skills, you MUST pass the ACTUAL task from the <task> section
- Use the CORRECT parameter name for each skill (check "Task Parameter" above)
- Different skills use different parameter names (e.g., 'content', 'query', 'description')
- DO NOT use placeholders like 'task description', 'detailed task', etc.
- Copy the COMPLETE task text from <task> section to the skill input
- Example: If <task> says "设计一个iphone17产品的前端介绍页面"
           Then use: input_data={'task': '设计一个iphone17产品的前端介绍页面'}

General requirements:
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
# EXAMPLE: Execute a skill with user's actual task
# IMPORTANT: Replace 'frontend-design' and 'task' with the actual skill and parameter name from the mapping above
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='frontend-design',
    input_data={
        'task': '设计一个iphone17产品的前端介绍页面'  # Use EXACT task from <task> section!
    }
)

if result['success']:
    print(result['content'])  # Print ['content'], not result
else:
    error = result['content'].get('message', 'Unknown error')
    print(f"Error: {error}")
\`\`\`

REMINDER: ALWAYS copy the ACTUAL task text from the <task> section above into the correct parameter field!
DO NOT use placeholder text like 'task description' or 'detailed task'.
The skill needs the REAL user request to generate correct output.

IMPORTANT REMINDERS:
- ALWAYS use execute_with_retry() for skill execution (NEVER call executor.execute directly)
- Check result['success'] to determine if execution succeeded
- Extract actual output from result['content'] (NOT result['output'])
- When passing results to another skill, pass result['content'] (NOT result)
- Check the skill's input schema to understand expected parameter types
- ALWAYS use the correct parameter name for each skill (see "Task Parameter" in skill details above)
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
   * Find the correct task parameter name for a skill.
   *
   * Priority strategy:
   * 1. Check required list first - use the first standard parameter (task/description/content/query)
   * 2. If no standard params in required, check all properties with priority
   * 3. Fallback to first required parameter or 'task'
   *
   * Standard parameter priority: task > description > content > query
   *
   * @param skillName - Name of the skill
   * @returns The correct parameter name to use for the main task
   */
  private findTaskParameter(skillName: string): string {
    const skill = this.skills.get(skillName);
    if (!skill || !skill.metadata?.input_schema) {
      return 'task'; // Fallback: use 'task'
    }

    const schema = skill.metadata.input_schema;
    const standardParams = ['task', 'description', 'content', 'query'];

    // Priority 1: Check required list for standard parameters
    if (schema.required && schema.required.length > 0) {
      for (const param of standardParams) {
        if (schema.required.includes(param)) {
          return param;
        }
      }
    }

    // Priority 2: Explicit 'task' parameter (even if not required)
    if (schema.properties?.task) {
      return 'task';
    }

    // Priority 3: 'description' parameter
    if (schema.properties?.description) {
      return 'description';
    }

    // Priority 4: 'content' parameter
    if (schema.properties?.content) {
      return 'content';
    }

    // Priority 5: 'query' parameter
    if (schema.properties?.query) {
      return 'query';
    }

    // Priority 6: First required parameter (any name)
    if (schema.required && schema.required.length > 0) {
      return schema.required[0];
    }

    // Fallback: use 'task'
    return 'task';
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

  /**
   * Find similar skill name for typos or variations.
   */
  private findSimilarSkillName(invalidName: string): string | null {
    const availableNames = Array.from(this.skills.keys());
    const invalidLower = invalidName.toLowerCase().replace(/[_\s]/g, '-');

    // Direct substring match
    for (const available of availableNames) {
      const availableLower = available.toLowerCase();
      if (availableLower.includes(invalidLower) || invalidLower.includes(availableLower)) {
        return available;
      }
    }

    // Word-based matching (e.g., "code_generator" → "simple-code-generator")
    const invalidWords = invalidLower.split('-');
    for (const available of availableNames) {
      const availableWords = available.toLowerCase().split('-');
      const commonWords = invalidWords.filter(w => availableWords.includes(w));
      if (commonWords.length >= 2) {
        return available;
      }
    }

    return null;
  }
}
