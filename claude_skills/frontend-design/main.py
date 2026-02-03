"""
Frontend Design Skill - Generate production-grade frontend interfaces
"""

import json
import sys
import os
from pathlib import Path
from typing import Dict, Any

# Add skill directory to sys.path
SKILL_DIR = Path(__file__).parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

# Try to import LLMClient from remotion-generator
LLM_CLIENT_AVAILABLE = False
llm_client = None

try:
    # Import LLMClient from remotion-generator's generators
    # We need to add remotion-generator to sys.path first
    remotion_generator_dir = SKILL_DIR.parent.parent / "remotion-generator"
    if remotion_generator_dir.exists():
        sys.path.insert(0, str(remotion_generator_dir))
        from generators.llm_client import LLMClient
        llm_client = LLMClient()
        LLM_CLIENT_AVAILABLE = True
        print(f"[INFO] Using LLMClient from remotion-generator")
except ImportError as e:
    print(f"[WARN] Could not import LLMClient: {e}")
    print(f"[INFO] Falling back to direct Anthropic API calls")

import asyncio


async def generate_frontend_code(task_description: str, skill_template: str) -> str:
    """
    使用 LLM 生成前端代码

    Args:
        task_description: 用户的任务描述
        skill_template: SKILL.md 的内容（设计指导）

    Returns:
        生成的前端代码
    """
    # 构建完整的 prompt
    prompt = f"""You are an expert frontend designer and developer. Read the following skill guide and complete the user's request.

{skill_template}

## User Request
{task_description}

## Requirements
1. Return production-ready, working code (HTML/CSS/JS, React, Vue, etc.)
2. Follow the aesthetic guidelines from the skill guide above
3. Make it distinctive and memorable - avoid generic AI aesthetics
4. Ensure all code is functional and can be directly used
5. Include any necessary styles and scripts
6. Return ONLY the code with brief explanations where needed

Please generate the complete frontend code now:"""

    max_tokens = 8192  # 足够生成完整的前端代码

    if LLM_CLIENT_AVAILABLE and llm_client:
        # 使用 LLMClient（异步）
        try:
            response = await llm_client.generate(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.7  # 稍高的创造性
            )
            return response.content
        except Exception as e:
            print(f"[ERROR] LLMClient.generate() failed: {e}")
            raise
    else:
        # 直接使用 Anthropic API
        try:
            import anthropic

            api_key = os.getenv('ANTHROPIC_API_KEY')
            if not api_key:
                raise ValueError('ANTHROPIC_API_KEY not found')

            client = anthropic.Anthropic(api_key=api_key)
            model = os.getenv('DEFAULT_LLM_MODEL', 'claude-sonnet-4-20250514')

            message = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}]
            )

            return message.content[0].text

        except Exception as e:
            raise Exception(f'Failed to call Anthropic API: {str(e)}')


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main execution function.

    Args:
        input_data: Dictionary with 'task' and optional 'context'

    Returns:
        Result dictionary with success/output/error
    """
    task = input_data.get('task', {})
    context = input_data.get('context', {})

    # 提取任务描述
    task_description = task.get('text', task.get('task', str(task)))

    # 读取 SKILL.md
    skill_md_path = Path(__file__).parent / 'SKILL.md'
    try:
        with open(skill_md_path, 'r', encoding='utf-8') as f:
            skill_template = f.read()
    except Exception as e:
        return {
            'success': False,
            'error': f'Failed to read SKILL.md: {str(e)}',
            'artifact_type': 'text'
        }

    try:
        # 调用异步生成函数
        generated_code = asyncio.run(generate_frontend_code(task_description, skill_template))

        return {
            'success': True,
            'output': generated_code,
            'artifact_type': 'code'  # 明确标记为代码类型
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'artifact_type': 'text'
        }


if __name__ == "__main__":
    # Read from stdin
    input_data = json.loads(sys.stdin.read())

    # Execute
    result = execute(input_data)

    # Write to stdout
    print(json.dumps(result, indent=2, ensure_ascii=False))
