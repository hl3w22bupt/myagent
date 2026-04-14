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
import { ContextManager } from '../context/manager';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

// 对话历史配置（与 agent.ts 保持一致）
const MAX_CONVERSATION_MESSAGES = 50;  // 最大保留的对话消息数（约25轮对话）

// 自然语言参数名约定：这些参数接收自然语言描述，skill 内部会用 LLM 解析
const NATURAL_LANGUAGE_PARAMS = new Set(['task', 'text', 'query', 'description']);

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
  private confidenceThreshold: number;

  constructor(llm: LLMClient, skills: SkillMetadata[], systemPrompt?: string, confidenceThreshold: number = 0.6) {
    this.llm = llm;
    this.skills = new Map();
    this.systemPrompt = systemPrompt;
    this.confidenceThreshold = confidenceThreshold;
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

    // IMPORTANT: Environment configuration comes FIRST (before original_task)
    // This provides structured context like workspace, gitUrl, language, etc.
    if (options?.environment && Object.keys(options.environment).length > 0) {
      contextSection += '<environment>\n';
      for (const [key, value] of Object.entries(options.environment)) {
        // Format the value nicely
        const formattedValue = typeof value === 'string' ? value : JSON.stringify(value);
        contextSection += `${key}: ${formattedValue}\n`;
      }
      contextSection += '</environment>\n\n';
      console.log('[PTC Generator] Using environment config:', Object.keys(options.environment));
    }

    // IMPORTANT: If originalTask is provided (from MasterAgent), use it as the primary task
    // This ensures the PTC code generator respects the original user request
    const originalTask = options?.variables?.originalTask || options?.originalTask;
    if (originalTask) {
      contextSection += `<original_task>\n${originalTask}\n</original_task>\n\n`;
      console.log('[PTC Generator] Using originalTask from context:', originalTask.substring(0, 100));
    }

    if (options?.history && options.history.length > 0) {
      contextSection += '<conversation_history>\n';
      for (const msg of options.history.slice(-MAX_CONVERSATION_MESSAGES)) {
        // 最近 MAX_CONVERSATION_MESSAGES 条消息
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

    const prompt = `CRITICAL - SKILL NAME VALIDATION:
1. You MUST ONLY use skill names from the EXACT list below
2. DO NOT create, invent, or combine skill names
3. DO NOT make assumptions about skill names - use them EXACTLY as shown
4. The skill list below is the ONLY source of truth for valid skill names
5. NEVER try to guess or infer a skill name - always use exact match from the list

IMPORTANT GUIDELINES:
1. You MUST ONLY select skills from the available list below (${this.skills.size} skills provided)
2. ONLY select skills when there is a CLEAR, DIRECT match with the task requirements
3. For simple conversational messages, greetings, or casual chat - return EMPTY selected_skills
4. For factual questions (locations, definitions, facts), use web-search skill
5. DO NOT force skill usage when the task doesn't clearly require it
6. If user mentions specific skills (e.g., "use X skill", "using Y"), you MUST select those skills

SKILL SELECTION STRATEGY:
- First, determine if this is a CONVERSATIONAL task (chat, greeting, casual message) → NO skills needed
- Second, check if task explicitly requires a specific capability (search, generate, analyze) → select matching skills
- If unsure or the match is weak, prefer NO skills over using the wrong skill

CONFIDENCE EVALUATION:
- You MUST provide a "confidence" score (0.0 to 1.0) for your skill selection
- confidence = 1.0: Task perfectly matches the skill's purpose
- confidence = 0.8: Task clearly requires the skill, but not a perfect match
- confidence = 0.6: Task might use the skill, but alternative approaches exist
- confidence < 0.6: Weak or uncertain match - prefer NO skills
- For conversational tasks with no clear skill requirement: confidence = 0.0, selected_skills = []

CONFIDENCE EXAMPLES:
- "用 volcano-tts 把这段文字转成语音" → confidence: 1.0, selected_skills: ["volcano-tts"]
- "帮我搜索北京天气" → confidence: 0.9, selected_skills: ["web-search"]
- "今天天气真好" → confidence: 0.0, selected_skills: []
- "买，买，再买根金链子" → confidence: 0.0, selected_skills: [] (conversational, no clear TTS intent)

CONVERSATIONAL TASK EXAMPLES (use NO skills, confidence 0.0):
- "今天天气真好" (casual chat)
- "我想去公园玩" (personal statement)
- "你好" (greeting)
- "在吗？" (casual check-in)
- "牛啊" (casual praise)
- "买，买，再买根金链子" (casual talk)

SKILL TASK EXAMPLES (use skills with confidence > 0.6):
- "搜索一下北京天气" → confidence: 0.9, selected_skills: ["web-search"]
- "帮我生成一个视频" → confidence: 0.8, selected_skills: ["remotion-generator"]
- "创建带讲解的教学视频" → confidence: 0.9, selected_skills: ["remotion-generator", "volcano-tts", "ffmpeg"]
  Reasoning: 生成视频结构 + 添加语音解说 + 合并音视频
- "分析这段文本的情感" → confidence: 0.8, selected_skills: ["text-analyzer"]
- "用 volcano-tts 读这段话" → confidence: 1.0, selected_skills: ["volcano-tts"]

<available_skills>
${skillsList}
</available_skills>

${contextSection}
<task>
${task}
</task>

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection
3. Confidence score (0.0 to 1.0) for this selection

CRITICAL: Output MUST be valid JSON with proper quoting.
- The "reasoning" value MUST be a string in double quotes
- The "confidence" value MUST be a number between 0.0 and 1.0
- All string values MUST be enclosed in double quotes
- Do NOT use unquoted strings
- selected_skills CAN be an empty array for conversational tasks

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1", "skill2"],
  "reasoning": "First use skill1 to ..., then skill2 to ...",
  "confidence": 0.8
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

    // Extract and evaluate confidence score
    const confidence = plan.confidence !== undefined ? Number(plan.confidence) : 0.5; // Default to 0.5 if not provided
    console.info('[PTC Generator] Confidence evaluation:', {
      confidence,
      threshold: this.confidenceThreshold,
      meetsThreshold: confidence >= this.confidenceThreshold,
    });

    // If confidence is below threshold, return empty skills
    if (confidence < this.confidenceThreshold) {
      console.warn('[PTC Generator] Confidence below threshold - treating as no suitable skills', {
        confidence,
        threshold: this.confidenceThreshold,
        originalSelection: skillsArray,
        reasoning: plan.reasoning || 'No reasoning provided',
      });
      return {
        code: '',
        selectedSkills: [], // Empty array - no suitable skills found
        reasoning: `Low confidence (${confidence.toFixed(2)} < ${this.confidenceThreshold}): ${plan.reasoning || 'No reasoning provided'}`,
      };
    }

    return {
      code: '', // Will be generated in step 2
      selectedSkills: skillsArray,
      reasoning: plan.reasoning || 'No reasoning provided',
      confidence, // Include confidence in result
    };
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
        // First skill - show structured parameter usage
        const skillMeta = this.skills.get(skillName);
        const directParams = skillMeta ? this.findDirectParameters(skillMeta) : [];

        lines.push(`# Step 1: Call ${skillName}`);
        lines.push(`# Follow the Skill Invocation Methodology:`);
        lines.push(`#   ${skillName} structured parameters: ${directParams.length > 0 ? directParams.join(', ') : '(check schema)'}`);
        lines.push(`#   ${skillName} fallback parameter: '${taskParam}'`);
        lines.push(`${resultVar} = await execute_with_retry(`);
        lines.push(`    execute_func=executor.execute,`);
        lines.push(`    skill_name='${skillName}',`);
        lines.push(`    input_data={`);
        if (directParams.length > 0) {
          // Show structured params as the primary approach
          for (const p of directParams.slice(0, 3)) {
            lines.push(`        '${p}': extracted_value,  # Extract from task or use exact value`);
          }
          if (directParams.length > 3) {
            lines.push(`        # ... other params from schema`);
          }
        } else {
          lines.push(`        '${taskParam}': TASK_JSON,  # Task from <task> section`);
        }
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
        // Subsequent skills - chain from previous result
        // Get structured parameters for this skill (for the example)
        const skillMeta = this.skills.get(skillName);
        const directParams = skillMeta ? this.findDirectParameters(skillMeta) : [];

        lines.push('');
        lines.push(`# Step ${i + 1}: Call ${skillName} (receives output from step ${i})`);
        lines.push(`# Follow the Skill Invocation Methodology:`);
        lines.push(`#   1. Extract EXACT values from ${prevResultVar}['content']`);
        lines.push(`#   2. Pass them as STRUCTURED parameters to ${skillName}`);
        lines.push(`#   3. Check ${skillName}'s schema above for parameter names`);
        lines.push(`#`);
        lines.push(`# ${skillName} structured parameters: ${directParams.length > 0 ? directParams.join(', ') : '(check schema)'}`);
        lines.push(`# ${skillName} fallback parameter: '${taskParam}' (only if you can't determine exact values)`);
        lines.push(`#`);
        lines.push(`# ⚠️ NEVER pass parameters that don't exist in ${skillName}'s schema!`);
        lines.push(`#`);
        lines.push(`# 🔥 CRITICAL: Only proceed if previous step succeeded`);
        lines.push(`if ${prevResultVar}['success']:`);
        lines.push(`    # Extract exact values from previous output for ${skillName}'s structured parameters`);
        lines.push(`    prev_output = ${prevResultVar}['content']`);
        lines.push(``);
        lines.push(`    # Now call ${skillName} with structured parameters from schema`);
        lines.push(`    ${resultVar} = await execute_with_retry(`);
        lines.push(`        execute_func=executor.execute,`);
        lines.push(`        skill_name='${skillName}',`);
        lines.push(`        input_data={`);
        if (directParams.length > 0) {
          for (const p of directParams) {
            lines.push(`            '${p}': extracted_value_for_${p},  # Extract from prev_output`);
          }
        } else {
          lines.push(`            '${taskParam}': TASK_JSON,  # Task description for ${skillName}`);
        }
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

    // Build context section
    let contextSection = '';

    // IMPORTANT: Environment configuration comes FIRST (before original_task)
    // This provides structured context like workspace, gitUrl, language, etc.
    if (options?.environment && Object.keys(options.environment).length > 0) {
      contextSection += '<environment>\n';
      for (const [key, value] of Object.entries(options.environment)) {
        // Format the value nicely
        const formattedValue = typeof value === 'string' ? value : JSON.stringify(value);
        contextSection += `${key}: ${formattedValue}\n`;
      }
      contextSection += '</environment>\n\n';
      console.log('[PTC Generator] Using environment config:', Object.keys(options.environment));
    }

    // IMPORTANT: If originalTask is provided (from MasterAgent), use it as the primary task
    // This ensures the PTC code generator respects the original user request
    const originalTask = options?.variables?.originalTask || options?.originalTask;
    if (originalTask) {
      contextSection += `<original_task>\n${originalTask}\n</original_task>\n\n`;
      console.log('[PTC Generator] Using originalTask from context:', originalTask.substring(0, 100));
    }

    if (options?.history && options.history.length > 0) {
      contextSection += '<conversation_history>\n';
      for (const msg of options.history.slice(-MAX_CONVERSATION_MESSAGES)) {
        // 最近 MAX_CONVERSATION_MESSAGES 条消息
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
      // Build template data from options
      const templateData: any = {};

      // Add userContext (from options.userContext)
      if (options?.userContext) {
        templateData.userContext = options.userContext;
        console.log('[PTC Generator] Rendering systemPrompt with userContext', {
          hasName: !!options.userContext.name,
          hasPersonality: !!options.userContext.personality,
        });
      }

      // Add userProfile (from options.userProfile)
      if (options?.userProfile) {
        templateData.userProfile = options.userProfile;
        console.log('[PTC Generator] Rendering systemPrompt with userProfile', {
          hasPreferences: !!options.userProfile.preferences,
          hasHabits: !!options.userProfile.habits,
        });
      }

      // Render the template (works fine even without template syntax)
      let renderedPrompt = this.systemPrompt;
      try {
        const template = Handlebars.compile(this.systemPrompt);
        renderedPrompt = template(templateData);
        console.log('[PTC Generator] System prompt rendered successfully', {
          originalLength: this.systemPrompt.length,
          renderedLength: renderedPrompt.length,
        });
      } catch (error) {
        console.warn('[PTC Generator] Failed to render systemPrompt template, using raw:', error);
        renderedPrompt = this.systemPrompt;
      }

      agentSystemPromptSection = `<agent_system_prompt>
${renderedPrompt}
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

    // IMPORTANT: Add user profile section for personalization
    // This enables cross-session user preference injection
    let userProfileSection = '';
    if (options?.userProfile) {
      const contextManager = new ContextManager();
      const profileText = contextManager.formatUserProfile(options.userProfile);
      if (profileText) {
        userProfileSection = `${profileText}

CRITICAL - USER PREFERENCE GUIDELINES:
The <用户画像> above contains USER'S PREFERENCES AND HABITS.
You MUST follow these guidelines when generating code:
1. Match the code style to user preferences (e.g., "喜欢简洁回复" → concise code)
2. Consider user habits when structuring output (e.g., "夜间活跃" → detailed logging)
3. Apply user-specific patterns and conventions
4. Adjust communication style based on user profile

`;
        console.log('[PTC Generator] Using user profile in code generation');
      }
    }

    // Format execution history if available
    let executionHistorySection = '';
    if (options?.recentSkillExecutions && options.recentSkillExecutions.length > 0) {
      executionHistorySection += this.formatRecentSkillExecutions(options.recentSkillExecutions);
      console.log('[PTC Generator] Including recent skill executions in prompt', {
        count: options.recentSkillExecutions.length,
      });
    }

    if (options?.failureExperiences && options.failureExperiences.length > 0) {
      executionHistorySection += this.formatFailureExperiences(options.failureExperiences);
      console.log('[PTC Generator] Including failure experiences in prompt', {
        count: options.failureExperiences.length,
      });
    }

    const _firstSkillParam = selectedSkills.length > 0
      ? this.findTaskParameter(selectedSkills[0])
      : 'task';  // fallback for no skills case

    // Load skill invocation methodology template
    const methodologyTemplate = this.loadSkillInvocationPrompt();
    const skillsBlockForTemplate = this.buildSkillsBlockForTemplate(skillsDetails);
    const methodologySection = methodologyTemplate
      ? methodologyTemplate.replace('{{SKILLS_BLOCK}}', skillsBlockForTemplate)
      : '';

    const prompt = `CRITICAL LANGUAGE REQUIREMENT:
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

${agentSystemPromptSection}${userProfileSection}
${methodologySection}

${
  selectedSkills.length > 0
    ? `CRITICAL - SKILL EXECUTION IS MANDATORY:
You have selected skills: ${selectedSkills.join(', ')}
You MUST use these skills - DO NOT write native Python code!

Follow the Skill Invocation Methodology above for correct parameter passing.

IMPORTANT - DO NOT CREATE THESE OBJECTS YOURSELF:
The following variables are ALREADY AVAILABLE as global variables (created by the sandbox wrapper):
- executor: SkillExecutor instance (ready to use)
- execute_with_retry: async retry wrapper function
- task_id: Current task ID from MOTIA_TASK_ID env var
- notify_hook_api_url: Notify API URL from MOTIA_NOTIFY_API_URL env var
- STRUCTURED_OUTPUT_DIR: Directory for structured output files

DO NOT import SkillExecutor, create_virtual_registry, or call asyncio.run()!
DO NOT create executor or virtual_registry yourself!
Just use 'executor' and 'execute_with_retry' directly.

# Result format (unified):
#   {
#       'success': bool,
#       'content': any,
#       'result_type': str,
#       'metadata': dict,
#       'attempts': int
#   }

${this.generateMultiSkillExecutionExample(selectedSkills, skillsDetails)}`
    : `CRITICAL - NO SKILLS SELECTED:
This is a FALLBACK path - solve the task directly with native Python code.
DO NOT try to call executor.execute() - no skills are available.

🔥 MANDATORY: YOU MUST USE THE AGENT LOOP PATTERN BELOW FOR ALL TASKS!
Even if the task seems simple, you MUST wrap your code in the loop structure.
MAX_ITERATIONS is available (default: 5).

⚠️ CRITICAL: NEVER use undefined variables!
⚠️ The 'task' variable is NOT automatically available.
⚠️ You MUST define it yourself using: task = TASK_JSON
⚠️ TASK_JSON is a global variable containing the task string.

REQUIRED LOOP PATTERN:

# ⚠️ CRITICAL: task variable must be defined before use
task = TASK_JSON

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

General requirements:
- Use 'await' for any async operations (like skill execution)
- Print the final result
- DO NOT use try/except blocks (they are added automatically)
- Only output the code logic, no function definitions or boilerplate

CRITICAL: You MUST wrap your code in \`\`\`python code blocks.

IMPORTANT REMINDERS:
- ALWAYS use execute_with_retry() for skill execution (NEVER call executor.execute directly)
- Check result['success'] to determine if execution succeeded
- Extract actual output from result['content'] (NOT result['output'])

TIPS FOR FILE/VIDEO GENERATION:
- Use 'task_id' variable for file naming: f"video_{task_id}.mp4" or f"output_{task_id}.txt"
- Available environment variables:
  - MOTIA_TASK_ID: Current task ID
  - MOTIA_NOTIFY_API_URL: API endpoint for progress notifications
  - MOTIA_SESSION_ID: Current session ID
  - MOTIA_TRACE_ID: Trace ID for debugging

${executionHistorySection}=== TASK CONTEXT ===
<context>
${contextSection}
</context>

${errorSection}<task>
${task}
</task>

${originalTask ? `IMPORTANT INSTRUCTION:
The <original_task> in the <context> section above contains the USER'S ACTUAL REQUEST.
The <task> section below is MasterAgent's execution plan.

YOU MUST:
1. Follow MasterAgent's execution plan (the <task> section)
2. But use the <original_task> to understand the TRUE INTENT and SPECIFIC REQUIREMENTS
3. If there's a conflict, prioritize the original_task's specific requirements over general plan steps

Example:
- If original_task says "Add animation highlights to emphasize number relationships"
- And task says "Step 1: Add animation highlights (Execute directly)"
- You MUST generate code that ADDS ANIMATIONS, not a generic Pascal Triangle video

` : ''}Generate the code now:`;

    // Build system prompt for code generation
    const codegenSystemPrompt = `You are a Python code generator. Your role is to generate clean, efficient Python code that uses the provided skills correctly.
Always follow the skill execution patterns and parameter requirements specified in the task.
Generate production-ready code with proper error handling and async patterns.`;

    // Debug log: log firstSkillParam for each selected skill
    console.log('[PTC Generator] Generating code with parameters:');
    for (const skill of selectedSkills) {
      const param = this.findTaskParameter(skill);
      console.log(`[PTC Generator]   - ${skill}: ${param}`);
    }

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
   * Load the skill invocation methodology prompt template.
   * Cached after first read.
   */
  private static skillInvocationPromptCache: string | null = null;
  private loadSkillInvocationPrompt(): string {
    if (PTCGenerator.skillInvocationPromptCache) {
      return PTCGenerator.skillInvocationPromptCache;
    }
    try {
      const templatePath = join(__dirname, 'ptc-prompts', 'skill-invocation.md');
      PTCGenerator.skillInvocationPromptCache = readFileSync(templatePath, 'utf-8');
      console.log('[PTC Generator] Loaded skill invocation methodology prompt');
      return PTCGenerator.skillInvocationPromptCache;
    } catch {
      console.warn('[PTC Generator] Failed to load skill invocation prompt, using fallback');
      return '';
    }
  }

  /**
   * Build the {{SKILLS_BLOCK}} content for the skill invocation prompt.
   * Lists each selected skill's parameters, annotated with type classification.
   */
  private buildSkillsBlockForTemplate(skillsDetails: SkillMetadata[]): string {
    return skillsDetails.map(skill => {
      const _taskParam = this.findTaskParameter(skill.name);

      let block = `### ${skill.name}\n`;
      block += `Description: ${skill.description}\n`;

      if (skill.metadata?.input_schema?.properties) {
        const schema = skill.metadata.input_schema;
        const props = Object.entries(schema.properties);

        // Classify parameters
        const directParams: string[] = [];
        const fallbackParams: string[] = [];

        for (const [paramName] of props) {
          if (NATURAL_LANGUAGE_PARAMS.has(paramName)) {
            fallbackParams.push(paramName);
          } else {
            directParams.push(paramName);
          }
        }

        block += `Parameters:\n`;
        for (const [paramName, paramInfo] of props) {
          const info = paramInfo as { type?: string; description?: string; default?: any };
          const required = schema.required?.includes(paramName);
          const paramType = info.type || 'any';
          const paramDesc = info.description || '';
          const defaultValue = info.default !== undefined ? ` (default: ${info.default})` : '';
          const category = NATURAL_LANGUAGE_PARAMS.has(paramName) ? '[fallback]' : '[direct]';
          block += `  - ${paramName} ${category} (${paramType})${required ? ' REQUIRED' : ''}${defaultValue}: ${paramDesc}\n`;
        }
      }

      // Add output schema
      if (skill.metadata?.output_schema?.properties) {
        const schema = skill.metadata.output_schema;
        const outputFields = Object.entries(schema.properties)
          .map(([name, info]: [string, any]) => `  - ${name} (${info.type || 'any'}): ${info.description || ''}`)
          .join('\n');
        if (outputFields) {
          block += `Output:\n${outputFields}\n`;
        }
      }

      return block;
    }).join('\n');
  }

  /**
   * Find the direct-mode parameters for a skill.
   *
   * Direct mode = structured parameters with exact values (NOT natural language).
   * Task mode = natural language description that requires internal LLM parsing.
   *
   * Rules:
   * - tool-bash: 'command' + 'args' (direct) vs 'task' (LLM generates command)
   * - tool-edit: 'file_path' + 'old_string' + 'new_string' (direct) vs 'task' (LLM parses)
   * - tool-write: 'file_path' + 'content' (direct) vs 'task' (LLM parses)
   * - tool-read: 'file_path' (direct) vs 'task' (LLM parses)
   * - Generic: all parameters except 'task' and metadata fields
   *
   * @param skill - Skill metadata
   * @returns Array of parameter names for direct mode
   */
  private findDirectParameters(skill: SkillMetadata): string[] {
    if (!skill.metadata?.input_schema?.properties) {
      return [];
    }

    const props = Object.keys(skill.metadata.input_schema.properties);
    // Exclude natural language 'task' parameter and metadata/context parameters
    const excludeParams = ['task', 'environment', 'env', 'metadata', 'timeout', 'working_dir'];

    const directParams = props.filter(p => !excludeParams.includes(p));

    return directParams;
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

  /**
   * 格式化最近的技能执行记录为提示词片段
   */
  private formatRecentSkillExecutions(executions: Array<{
    skillName: string;
    success: boolean;
    timestamp: Date;
    error?: string;
    scenario?: string;
  }>): string {
    let section = '\n\n## 📋 Recent Skill Executions\n\n';
    section += 'Recent skill executions in this session (most recent first):\n\n';

    for (let i = 0; i < executions.length; i++) {
      const exec = executions[i];
      const statusIcon = exec.success ? '✓' : '✗';
      const timeAgo = this.formatTimeAgo(exec.timestamp);

      section += `- **${exec.skillName}**: ${statusIcon} ${exec.success ? 'Success' : 'Failed'}`;

      if (exec.error) {
        section += ` - ${exec.error}`;
      }

      section += ` (${timeAgo})\n`;
    }

    section += '---\n';

    return section;
  }

  /**
   * 格式化失败经验为提示词片段
   */
  private formatFailureExperiences(experiences: Array<{
    skillName: string;
    scenario: string;
    error: string;
    solution: string;
    frequency: number;
    lastOccurred: Date;
  }>): string {
    let section = '\n\n## ⚠️ Relevant Failure Experiences\n\n';
    section += 'The following failures occurred in similar scenarios. Consider these lessons to avoid repeating mistakes:\n\n';

    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];
      section += `### Experience ${i + 1}\n`;

      if (exp.skillName) {
        section += `- **Skill**: ${exp.skillName}\n`;
      }

      section += `- **Scenario**: ${exp.scenario}\n`;
      section += `- **Error**: ${exp.error}\n`;
      section += `- **Solution**: ${exp.solution}\n`;

      if (exp.frequency > 1) {
        section += `- **Frequency**: Occurred ${exp.frequency} times\n`;
      }

      section += `- **Last Occurred**: ${exp.lastOccurred.toISOString()}\n\n`;
    }

    section += '---\n';

    return section;
  }

  /**
   * 格式化时间戳为相对时间描述
   */
  private formatTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
  }
}
