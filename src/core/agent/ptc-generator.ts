/**
 * PTC (Programmatic Tool Calling) Code Generator.
 *
 * Implements two-step PTC generation:
 * 1. Planning: Select appropriate skills for the task
 * 2. Implementation: Generate Python code using selected skills
 */

import { LLMClient } from './llm-client';
import { LLMClientFactory } from '../llm/factory';
import { PTCGenerationOptions, PTCResult } from './types';
import { SkillMetadata as FullSkillMetadata } from './skill-discovery';

/**
 * Simplified Skill Metadata for PTC Generator.
 * Includes metadata field for input_schema and output_schema access.
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
  private systemPrompt?: string;

  constructor(llm: LLMClient, skills: SkillMetadata[], systemPrompt?: string) {
    this.llm = llm;
    this.skills = new Map();
    this.systemPrompt = systemPrompt;
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  /**
   * Static factory method to create PTCGenerator with agent's LLM configuration
   */
  static createWithAgentConfig(skills: SkillMetadata[], agentConfig: { llm?: any; systemPrompt?: string }): PTCGenerator {
    const llm = LLMClientFactory.createForAgent(agentConfig);
    return new PTCGenerator(llm, skills, agentConfig?.systemPrompt);
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
   * @param previousError - Optional: previous error message from retry attempt
   * @returns Generated PTC result with code, selected skills, and reasoning
   */
  async generateWithResult(
    task: string,
    options?: PTCGenerationOptions,
    previousError?: string
  ): Promise<PTCResult> {
    // Step 1: Plan - Select skills (with context)
    const plan = await this.planSkills(task, options);

    // Step 2: Implement - Generate Python code (with context and previous error)
    const code = await this.generateCode(task, plan.selectedSkills, options, previousError);

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
   * Made public for Agent to call as a gatekeeper before PTC generation.
   */
  public async planSkills(task: string, options?: PTCGenerationOptions): Promise<PTCResult> {
    // 🔥 CRITICAL: If no skills are available, directly return FALLBACK mode
    // This avoids the LLM trying to select skills from an empty list,
    // which causes confusion with the "NEVER return empty selected_skills" instruction.
    if (this.skills.size === 0) {
      console.info('[PTC Generator] No skills available - entering FALLBACK mode');
      return {
        code: '', // Will be generated in step 2
        selectedSkills: [], // Empty array triggers FALLBACK prompt in generateCode
        reasoning: 'No skills available - will solve task directly with pure Python code',
      };
    }

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
4. The skill list above is the ONLY source of truth for valid skill names
5. NEVER try to guess or infer a skill name - always use exact match from the list

IMPORTANT GUIDELINES:
1. You MUST ONLY select skills from the available list above (${this.skills.size} skills provided)
2. ONLY select skills when there is a CLEAR, DIRECT match with the task requirements
3. For simple conversational messages, greetings, or casual chat - return EMPTY selected_skills
4. For factual questions (locations, definitions, facts), use web-search skill
5. DO NOT force skill usage when the task doesn't clearly require it
6. ${explicitlyRequestedSkills.length > 0 ?
   'CRITICAL: User explicitly requested skills - YOU MUST include them in selected_skills' :
   'If user mentions specific skills (e.g., "use X skill", "using Y"), you MUST select those skills'}

SKILL SELECTION STRATEGY:
- First, determine if this is a CONVERSATIONAL task (chat, greeting, casual message) → NO skills needed
- Second, check if task explicitly requires a specific capability (search, generate, analyze) → select matching skills
- If unsure or the match is weak, prefer NO skills over using the wrong skill

CONVERSATIONAL TASK EXAMPLES (use NO skills):
- "今天天气真好" (casual chat)
- "我想去公园玩" (personal statement)
- "你好" (greeting)
- "在吗？" (casual check-in)

SKILL TASK EXAMPLES (use skills):
- "搜索一下北京天气" (requires web-search)
- "帮我生成一个视频" (requires video-generation)
- "分析这段文本的情感" (requires text-analyzer)
- Review the skill's input schema to ensure it can handle the task requirements
- CRITICAL: You MUST use exact skill names from the available skills list (see list below).
- DO NOT transform skill names (e.g., do not convert 'web-search' to 'web_search').
- DO NOT use placeholders like 'first-skill', 'second-skill' - always use the actual skill name.

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection

CRITICAL: Output MUST be valid JSON with proper quoting.
- The "reasoning" value MUST be a string in double quotes
- All string values MUST be enclosed in double quotes
- Do NOT use unquoted strings
- selected_skills CAN be an empty array for conversational tasks

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1", "skill2"],
  "reasoning": "First use skill1 to ..., then skill2 to ..."
}
</plan>`;

    // Build system prompt for skill selection
    const systemPrompt = `You are an expert at selecting appropriate skills for task execution.
Your role is to analyze tasks and choose the most suitable skills from the available list.
Always prioritize available skills over direct computation or common knowledge.`;

    const response = await this.llm.messagesCreate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ], {}, 'skill selection');

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

    // 📢 Log selected skills for debugging
    console.info('[PTC Generator] LLM selected skills:', {
      skills: skillsArray,
      count: skillsArray.length,
      reasoning: plan.reasoning || 'No reasoning provided'
    });

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
   * Generate explicit schema-to-schema mapping instructions for multi-skill chaining.
   * This tells LLM exactly which output fields map to which input fields.
   *
   * @param selectedSkills - Skills selected for execution
   * @param skillsDetails - Full skill metadata including schemas
   * @returns Schema mapping instructions as a formatted string
   */
  private generateSchemaMappingInstructions(
    selectedSkills: string[],
    skillsDetails: SkillMetadata[]
  ): string {
    if (selectedSkills.length <= 1) {
      return '';
    }

    const lines: string[] = [
      '',
      '# CRITICAL - SKILL OUTPUT/INPUT SCHEMA MAPPING:',
      '# When chaining skills, pass the OUTPUT from previous skill to INPUT of next skill',
      '#',
      '# 🔥 CRITICAL - DATA TYPE CONVERSION:',
      '# Different skills return different data formats. You MUST convert before passing to next skill:',
      '#   - Table data (dict with columns/rows): Use format_table_as_markdown() to convert to string',
      '#   - Object (dict): Convert to JSON string using json.dumps()',
      '#   - File result (dict with path): Extract the path value as string',
      '#   - String: Pass directly',
      '# See the multi-skill execution example below for complete formatting code.',
      ''
    ];

    for (let i = 0; i < selectedSkills.length - 1; i++) {
      const currentSkill = skillsDetails[i];
      const nextSkill = skillsDetails[i + 1];
      const currentTaskParam = this.findTaskParameter(selectedSkills[i]);
      const nextTaskParam = this.findTaskParameter(selectedSkills[i + 1]);

      lines.push(`# ${selectedSkills[i]} → ${selectedSkills[i + 1]}:`);

      // Get output schema from current skill
      const outputSchema = currentSkill.metadata?.output_schema;
      if (outputSchema?.properties) {
        const outputFields = Object.keys(outputSchema.properties);
        lines.push(`#   Output fields: ${outputFields.length > 0 ? outputFields.join(', ') : '(no schema defined)'}`);
      } else {
        lines.push('#   Output fields: (no output_schema defined)');
      }

      // Get input schema from next skill (excluding main task param)
      const inputSchema = nextSkill.metadata?.input_schema;
      if (inputSchema?.properties) {
        const inputFields = Object.keys(inputSchema.properties)
          .filter(f => f !== nextTaskParam);  // Skip the main task param
        lines.push(`#   Input fields (excluding main param '${nextTaskParam}'): ${inputFields.length > 0 ? inputFields.join(', ') : '(none)'}`);
      } else {
        lines.push(`#   Input fields: (no input_schema defined)`);
      }

      // Generate explicit mapping instruction
      lines.push(`#   Mapping: result${i + 1}['content'] → ${nextTaskParam}`);
      lines.push(`#   Example: ${nextTaskParam}='${currentTaskParam}'`);  // Use previous result's content
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate skill execution example for multi-skill chaining.
   * Shows the LLM exactly how to call multiple skills in sequence.
   *
   * @param selectedSkills - Skills selected for execution
   * @param skillsDetails - Full skill metadata
   * @returns Python code example showing multi-skill execution
   */
  private generateMultiSkillExecutionExample(
    selectedSkills: string[],
    _skillsDetails: SkillMetadata[]
  ): string {
    const lines: string[] = [
      '',
      `# 🔥 MANDATORY: YOU MUST CALL ALL ${selectedSkills.length} SELECTED SKILLS!`,
      `# Selected skills: ${selectedSkills.join(', ')}`,
      `# DO NOT skip any skill - call ALL of them in order!`,
      ''
    ];

    for (let i = 0; i < selectedSkills.length; i++) {
      const skillName = selectedSkills[i];
      const taskParam = this.findTaskParameter(skillName);
      const resultVar = `result${i + 1}`;
      const prevResultVar = i > 0 ? `result${i}` : null;

      if (i === 0) {
        // First skill - use the task description directly
        lines.push(`# Step 1: Call ${skillName}`);
        lines.push(`${resultVar} = await execute_with_retry(`);
        lines.push(`    execute_func=executor.execute,`);
        lines.push(`    skill_name='${skillName}',  # ← REAL skill name, not placeholder`);
        lines.push(`    input_data={`);
        lines.push(`        '${taskParam}': '''COPY THE ACTUAL TASK FROM <task> SECTION''',`);
        lines.push(`        # Add other parameters based on skill schema...`);
        lines.push(`    }`);
        lines.push(`)`);
        // Add error handling for first skill
        lines.push(``);
        lines.push(`# 🔥 CRITICAL: If first skill fails, stop execution`);
        lines.push(`if not ${resultVar}['success']:`);
        lines.push(`    error_msg = ${resultVar}['content'].get('message', 'Unknown error') if isinstance(${resultVar}['content'], dict) else str(${resultVar}['content'])`);
        lines.push(`    print(f'Skill ${skillName} failed: {error_msg}')`);
        lines.push(`    # Exit early - don't continue with remaining skills`);
        lines.push(`    return`);
      } else {
        // Subsequent skills - chain from previous result WITH FORMAT CONVERSION
        lines.push('');
        lines.push(`# Step ${i + 1}: Call ${skillName} (receives output from step ${i})`);
        lines.push(`# 🔥 CRITICAL: Format the previous skill output for ${skillName}`);
        lines.push(`# Different skills return different data formats - convert before passing:`);
        lines.push(`#`);
        lines.push(`# PREVIOUS OUTPUT TYPES → CONVERSION (implement inline):`);
        lines.push(`#   - Table (dict with 'columns'/'rows'): Format as markdown list`);
        lines.push(`#   - Object (dict): Convert to JSON string`);
        lines.push(`#   - File (dict with 'path'): Extract the path value`);
        lines.push(`#   - String: Use as-is`);
        lines.push(`#`);
        lines.push(`# ⚠️ IMPORTANT: Check the skill's schema to know which parameter receives the formatted content!`);
        lines.push(`#   - For ${skillName}:`);
        lines.push(`#     - Main task parameter: '${taskParam}'`);
        lines.push(`#     - If skill has 'content' parameter (like tool-write), pass formatted content there`);
        lines.push(`#     - Otherwise pass to the main task parameter`);
        lines.push(`#`);
        lines.push(`# 🔥 CRITICAL: Only proceed if previous step succeeded`);
        lines.push(`if ${prevResultVar}['success']:`);
        lines.push(`    # Format previous output for ${skillName} - IMPLEMENT INLINE`);
        lines.push(`    raw_content = ${prevResultVar}['content']`);
        lines.push(``);
        lines.push(`    # Apply smart formatting based on content type`);
        lines.push(`    if isinstance(raw_content, dict) and 'columns' in raw_content and 'rows' in raw_content:`);
        lines.push(`        # Table data - format as markdown list`);
        lines.push(`        lines = []`);
        lines.push(`        for row in raw_content['rows'][:10]:  # Limit to first 10 rows`);
        lines.push(`            if len(row) >= 2:`);
        lines.push(`                lines.append(f"- **{row[0]}**: {row[1]}")`);
        lines.push(`        formatted_content = '\\n'.join(lines)`);
        lines.push(`    elif isinstance(raw_content, dict) and 'path' in raw_content:`);
        lines.push(`        # File result - extract path`);
        lines.push(`        formatted_content = raw_content['path']`);
        lines.push(`    elif isinstance(raw_content, dict):`);
        lines.push(`        # Generic dict - convert to JSON string`);
        lines.push(`        import json`);
        lines.push(`        formatted_content = json.dumps(raw_content, ensure_ascii=False, indent=2)`);
        lines.push(`    else:`);
        lines.push(`        # Already a string or other type`);
        lines.push(`        formatted_content = str(raw_content)`);
        lines.push(``);
        lines.push(`    # Now call next skill with formatted content`);
        lines.push(`    ${resultVar} = await execute_with_retry(`);
        lines.push(`        execute_func=executor.execute,`);
        lines.push(`        skill_name='${skillName}',  # ← REAL skill name`);
        lines.push(`        input_data={`);
        lines.push(`            '${taskParam}': '''TASK DESCRIPTION FOR ${skillName}''',  # Main task parameter`);
        lines.push(`            'content': formatted_content,  # ✅ Pass formatted content to 'content' parameter`);
        lines.push(`            # Add other parameters based on skill schema...`);
        lines.push(`        }`);
        lines.push(`    )`);
        lines.push(`else:`);
        lines.push(`    # Previous skill failed - don't continue`);
        lines.push(`    print(f'Step ${i} failed, skipping ${skillName}')`);
        lines.push(`    ${resultVar} = {'success': False, 'content': {'message': 'Previous step failed'}}`);
      }
    }

    // Add final result handling
    const finalResult = `result${selectedSkills.length}`;
    lines.push('');
    lines.push(`# Output final result`);
    lines.push(`if ${finalResult}['success']:`);
    lines.push(`    actual_output = ${finalResult}['content']`);
    lines.push(`    print(f'Task completed successfully')`);
    lines.push(`else:`);
    lines.push(`    error_msg = ${finalResult}['content'].get('message', 'Unknown error') if isinstance(${finalResult}['content'], dict) else str(${finalResult}['content'])`);
    lines.push(`    print(f'Task failed: {error_msg}')`);

    return lines.join('\n');
  }

  /**
   * Step 2: Implementation phase - Generate Python code.
   * Made public for Agent to call directly after skill selection.
   *
   * @param task - User task description
   * @param selectedSkills - Skills to use in the code
   * @param options - Generation options (including context)
   * @param previousError - Optional: previous error message from retry attempt
   */
  public async generateCode(
    task: string,
    selectedSkills: string[],
    options?: PTCGenerationOptions,
    previousError?: string
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

        // Add output schema if available - NEW for multi-skill chaining
        if (skill.metadata && skill.metadata.output_schema) {
          const schema = skill.metadata.output_schema;
          if (schema.properties && Object.keys(schema.properties).length > 0) {
            skillInfo += '\n  Output Fields:';
            for (const [fieldName, fieldInfo] of Object.entries(schema.properties)) {
              const info = fieldInfo as { type?: string; description?: string };
              const fieldType = info.type || 'any';
              const fieldDesc = info.description || '';
              skillInfo += `\n    - ${fieldName} (${fieldType}): ${fieldDesc}`;
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

    // IMPORTANT: Add previous error if this is a retry attempt
    let errorSection = '';
    if (previousError) {
      errorSection = `<previous_error>
⚠️  THE PREVIOUS ATTEMPT FAILED WITH THE FOLLOWING ERROR:

${previousError}

CRITICAL - YOU MUST FIX THIS ERROR:
1. Analyze the error above to understand what went wrong
2. Generate DIFFERENT code that avoids the same mistake
3. Common fixes:
   - Check if you used the correct parameter name for the skill
   - Verify you passed the actual task content (not placeholders)
   - Ensure proper async/await usage
   - Check skill parameter names match the schema exactly
4. DO NOT repeat the same code that caused this error
</previous_error>

`;
      console.log('[PTC Generator] Including previous error in prompt:', previousError.substring(0, 100));
    }

    // IMPORTANT: Add agent system prompt section at the beginning
    // This ensures subagent's personality and behavior guidelines are passed to code generation
    let agentSystemPromptSection = '';
    if (this.systemPrompt && this.systemPrompt.trim()) {
      agentSystemPromptSection = `<agent_system_prompt>
${this.systemPrompt}
</agent_system_prompt>

CRITICAL - AGENT BEHAVIOR GUIDELINES:
The <agent_system_prompt> above contains YOUR AGENT'S PERSONALITY AND BEHAVIOR RULES.
You MUST follow these guidelines when generating code:
1. Match the tone and personality described in the system prompt
2. Follow any specific behavioral instructions
3. Use the designated response format if specified
4. Apply any constraints mentioned in the system prompt

`;
      console.log('[PTC Generator] Using agent systemPrompt in code generation');
    }

    const prompt = `${agentSystemPromptSection}<context>
${contextSection}
</context>

${errorSection}<task>
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

${this.generateSchemaMappingInstructions(selectedSkills, skillsDetails)}

<available_skills>
${skillsDetails.map(skill => `- ${skill.name}: ${skill.description}
  Tags: ${skill.tags.join(', ')}
  Task Parameter: ${this.findTaskParameter(skill.name)}`).join('\n')}
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
# - Check the skill's parameter schema above for other required/optional parameters
# - EXTRACT ALL PARAMETERS from the task description (e.g., duration, fps, resolution)`;
        }).join('\n\n');

        const firstSkillParam = this.findTaskParameter(selectedSkills[0]);

        // Build skill-specific parameter extraction instructions
        // Generic approach: LLM extracts parameters based on schema
        const skillsWithParams = skillsDetails.filter(skill =>
          skill.metadata?.input_schema?.properties &&
          Object.keys(skill.metadata.input_schema.properties).length > 1
        );

        let skillParamExtraction = '';
        if (skillsWithParams.length > 0) {
          skillParamExtraction = `
# PARAMETER EXTRACTION FROM NATURAL LANGUAGE:
# The following skills have additional parameters:
# - [REQUIRED]: MUST extract from task, fail if missing
# - (default: X): Optional, extract if present, otherwise use default
# - No default, not required: Extract if present, otherwise omit
#
${skillsWithParams.map(skill => {
  const schema = skill.metadata!.input_schema;
  const taskParam = this.findTaskParameter(skill.name);
  const params = Object.entries(schema.properties)
    .filter(([name]) => name !== taskParam)
    .map(([name, info]: [string, any]) => {
      const required = schema.required?.includes(name) ? ' [REQUIRED]' : '';
      const def = info.default !== undefined ? ` (default: ${info.default})` : '';
      return `    - ${name} (${info.type})${required}${def}: ${info.description || 'No description'}`;
    });

  return `# ${skill.name}:
#   Main parameter: ${taskParam}
#   Additional parameters:
${params.join('\n')}
#   Example: If task says "duration 15s", extract: 'duration': 15`;
}).join('\n\n')}
#
# EXTRACTION STRATEGY:
# 1. REQUIRED parameters: MUST extract from task or report error
# 2. Optional parameters with defaults: Extract if mentioned, otherwise use default
# 3. Optional parameters without defaults: Extract if mentioned, otherwise omit entirely
# 4. Match values to parameter types (e.g., "15s" → duration=15, "1080p" → resolution="1920x1080")
`;
        }

        // Build skill-specific content preparation instructions
        // Generic approach: Based on skill tags and description
        let skillContentPrep = '';
        const skillsNeedingDetailedContent = skillsDetails.filter(skill =>
          skill.tags.includes('visualization') ||
          skill.tags.includes('infographic') ||
          (skill.description.toLowerCase().includes('detailed content') ||
           skill.description.toLowerCase().includes('structured'))
        );

        if (skillsNeedingDetailedContent.length > 0) {
          skillContentPrep = `
# CRITICAL - CONTENT PREPARATION FOR VISUALIZATION SKILLS:
# The following skills require DETAILED, STRUCTURED content for best results:
${skillsNeedingDetailedContent.map(skill =>
  `# - ${skill.name}: ${skill.description}`
).join('\n')}
#
# When the task provides a brief instruction, you MUST:
# 1. INTELLIGENTLY EXPAND the content based on domain knowledge
# 2. Generate a DETAILED, STRUCTURED description with all necessary elements
# 3. Use proper formatting: numbered lists, bullet points, clear stages
#
# Example (WRONG - too brief):
#   content='生成软件生命周期图'  # ❌ Too brief!
#
# Example (CORRECT - expanded):
#   content='''
#   软件生命周期包括以下阶段：
#   1. 需求分析：明确用户需求和系统目标
#   2. 系统设计：架构设计、技术选型
#   3. 编码实现：开发功能模块
#   4. 测试验证：单元测试、集成测试
#   5. 部署上线：发布到生产环境
#   6. 运维监控：系统维护和性能监控
#   '''  # ✅ Detailed and structured!
`;
        }

        return `CRITICAL - SKILL EXECUTION IS MANDATORY:
You have selected skills: ${selectedSkills.join(', ')}
You MUST use these skills - DO NOT write native Python code!

${skillParamInstructions}

CRITICAL - PARAMETER EXTRACTION REQUIREMENTS:
For each skill, you MUST extract ALL mentioned parameters from the task:
1. SCAN the task description for parameter values (duration, fps, resolution, etc.)
2. EXTRACT numeric values with their units
3. PASS as SEPARATE parameters in input_data (NOT just in the task string)
4. Use DEFAULT values for unspecified parameters based on skill schema

from core.skill.executor import SkillExecutor
from core.sandbox.retry_utils import execute_with_retry
from core.skill.adapters.virtual_skill_registry import create_virtual_registry
import os

# Get notify API URL from environment
notify_hook_api_url = os.getenv('MOTIA_NOTIFY_API_URL')
task_id = os.getenv('MOTIA_TASK_ID')  # Task ID for tracking and file naming

# Create virtual registry for Claude Skills support
# This enables discovery and execution of Claude Skills (SKILL.md files)
virtual_registry = __import__('asyncio').run(create_virtual_registry())

# Create SkillExecutor with virtual registry support (includes Claude Skills)
executor = SkillExecutor(notify_hook_api_url=notify_hook_api_url, virtual_registry=virtual_registry)

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
${skillParamExtraction}
# CRITICAL - HOW TO PASS USER TASK TO SKILLS:
# You MUST use the '${firstSkillParam}' field to pass the actual user request
# Copy the COMPLETE task description from the <task> section above
# DO NOT use placeholders like 'task description' or 'detailed task'
#
# CRITICAL: EXTRACT AND PASS STRUCTURED PARAMETERS:
# Check the skill's parameter schema above:
# - [REQUIRED] parameters: MUST extract from task
# - Optional with defaults: Extract if mentioned, otherwise use default
# - Optional without defaults: Extract if mentioned, otherwise omit
#
# Example 1 (WRONG - required parameter not extracted):
#   input_data={'task': '创建视频，时长 15s'}  # ❌ duration not extracted!
#
# Example 2 (CORRECT - all parameters extracted):
#   input_data={
#       'task': '创建一个教学视频，时长 15s',
#       'duration': 15,  # ✅ Extracted from "15s"
#       'fps': 30       # ✅ Default from schema (optional, can omit if not in task)
#   }
#
# Example 3 (CORRECT - optional param not mentioned, omit it):
#   input_data={
#       'task': '创建一个教学视频'  # No duration/fps mentioned
#       # Only required param (task) is included
#       # Optional params with defaults will be handled by the skill
#   }
#
# MANDATORY: You must call execute_with_retry with the selected skill
# DO NOT write any Python code directly - ONLY call skills!

${this.generateMultiSkillExecutionExample(selectedSkills, skillsDetails)}`;
      })()
    : `CRITICAL - NO SKILLS SELECTED:
This is a FALLBACK path - solve the task directly with native Python code.
DO NOT try to call executor.execute() - no skills are available.

🔥 MANDATORY: YOU MUST USE THE AGENT LOOP PATTERN BELOW FOR ALL TASKS!
Even if the task seems simple, you MUST wrap your code in the loop structure.
MAX_ITERATIONS is available (default: 5).

⚠️ CRITICAL: NEVER use undefined variables!
⚠️ The 'task' variable is NOT automatically available.
⚠️ You MUST define it yourself using: task = '''...'''

REQUIRED LOOP PATTERN:

# ⚠️ CRITICAL: task variable must be defined before use
task = """Paste the actual task from <task> section here"""

# Context accumulates information across iterations
context = {
    "task": task,  # ✅ task is now defined
    "iteration": 0,
    "findings": [],
    "intermediate_results": {}
}

for i in range(MAX_ITERATIONS):
    context["iteration"] = i + 1

    # STEP 1: Do work for this iteration
    result = process_step(context)
    context["intermediate_results"][f"step_{i+1}"] = result

    # STEP 2: Check if task is complete
    if is_task_complete(result):
        print(format_final_result(result))
        break

    # STEP 3: Accumulate findings for next iteration
    context["findings"].append(extract_findings(result))

    # STEP 4: Update context with new insights
    context = update_context(context, result)
else:
    # Max iterations reached, return best partial result
    print(format_partial_result(context))

IMPORTANT GUIDELINES:
1. Each iteration should make PROGRESS toward the goal
2. Accumulate useful information in context for next iteration
3. Check completion condition clearly after each step
4. Use context["findings"] to track discoveries
5. If MAX_ITERATIONS is reached, return best partial result
6. Use standard libraries and any available imports
7. For simple tasks, the loop will complete in 1 iteration - that's fine!`
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
# EXAMPLE: Execute skill with extracted parameters
# Check the skill's schema and extract parameters from the task:
# - [REQUIRED]: Must extract from task
# - Optional with default: Extract if mentioned, or omit (skill uses default)
# - Optional without default: Extract if mentioned, or omit
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='skill-name',
    input_data={
        'task_parameter': 'Copy actual task from <task> section',
        # 'param1': 'value1',  # Extract if mentioned in task
        # 'param2': 'value2'   # Or omit - skill will use default if available
    }
)

if result['success']:
    print(result['content'])
else:
    error = result['content'].get('message', 'Unknown error')
    print(f"Error: {error}")
\`\`\`

# EXAMPLE: Execute skill with simple task (no extra parameters)
\`\`\`python
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='skill-name',  # Use exact skill name from selection
    input_data={
        'task': 'Copy exact task from <task> section'  # Use EXACT task from <task> section!
    }
)

if result['success']:
    print(result['content'])
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

    // Build system prompt for code generation
    const codegenSystemPrompt = `You are a Python code generator. Your role is to generate clean, efficient Python code that uses the provided skills correctly.
Always follow the skill execution patterns and parameter requirements specified in the task.
Generate production-ready code with proper error handling and async patterns.`;

    const response = await this.llm.messagesCreate([
      { role: 'system', content: codegenSystemPrompt },
      { role: 'user', content: prompt }
    ], {}, 'ptc codegen');

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
    const standardParams = ['task', 'text', 'description', 'content', 'query'];

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

    // Priority 3: 'text' parameter (for TTS skills)
    if (schema.properties?.text) {
      return 'text';
    }

    // Priority 4: 'description' parameter
    if (schema.properties?.description) {
      return 'description';
    }

    // Priority 5: 'content' parameter
    if (schema.properties?.content) {
      return 'content';
    }

    // Priority 6: 'query' parameter
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
