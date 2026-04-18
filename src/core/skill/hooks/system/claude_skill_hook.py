"""
Claude Skill Hook

Analyzes skill execution results to infer artifact types and paths.
For pure-prompt Claude skills, this hook uses LLM to infer artifacts.
"""

import os
import json
import shutil
from typing import Any, Dict, Optional
from ..base import BaseHook, SkillContext

# 支持的 artifact types
SUPPORTED_ARTIFACT_TYPES = [
    "video", "audio", "image", "code", "table", "infographic",
    "markdown", "text", "json", "file"
]

# 产物类型到输出目录的映射
ARTIFACT_TYPE_TO_DIR = {
    "video": "outputs/videos",
    "audio": "outputs/audios",
    "image": "outputs/images",
}


def _ensure_output_dir(artifact_type: str) -> str:
    """
    确保输出目录存在，返回目录路径
    """
    if artifact_type not in ARTIFACT_TYPE_TO_DIR:
        return None

    rel_dir = ARTIFACT_TYPE_TO_DIR[artifact_type]
    project_root = os.getcwd()
    output_dir = os.path.join(project_root, rel_dir)

    # 创建目录（如果不存在）
    os.makedirs(output_dir, exist_ok=True)

    return output_dir


def _normalize_artifact_path(source_path: str, artifact_type: str) -> str:
    """
    将产物文件移动到规范的 outputs/ 目录

    Args:
        source_path: 源文件路径（可能是绝对路径或相对路径）
        artifact_type: 产物类型 (video, audio, image)

    Returns:
        移动后的新路径，如果不需要移动或移动失败则返回原路径
    """
    if artifact_type not in ARTIFACT_TYPE_TO_DIR:
        return source_path

    output_dir = _ensure_output_dir(artifact_type)
    if not output_dir:
        return source_path

    # 如果文件已经在正确的目录中，直接返回
    if output_dir in source_path:
        return source_path

    # 检查源文件是否存在
    if not os.path.exists(source_path):
        print(f"[ClaudeSkillHook] Source file doesn't exist: {source_path}")
        return source_path

    # 获取文件名
    filename = os.path.basename(source_path)
    dest_path = os.path.join(output_dir, filename)

    # 如果目标文件已存在，添加时间戳避免冲突
    if os.path.exists(dest_path):
        name, ext = os.path.splitext(filename)
        import time
        dest_path = os.path.join(output_dir, f"{name}_{int(time.time())}{ext}")

    try:
        # 移动文件
        shutil.move(source_path, dest_path)
        print(f"[ClaudeSkillHook] Moved artifact: {source_path} -> {dest_path}")
        return dest_path
    except Exception as e:
        print(f"[ClaudeSkillHook] Failed to move artifact: {e}")
        return source_path


async def _infer_artifacts_with_llm(
    skill_name: str,
    input_data: Dict[str, Any],
    result: Dict[str, Any]
) -> Dict[str, Any]:
    """
    使用 LLM 推理 skill 产物的类型和路径。

    完全不依赖 skill_name 穷举，让 LLM 根据输入和输出推断。

    Returns:
        {
            'artifact_type': str | None,
            'artifacts': list of dict with 'path' and 'type',
            'confidence': float (0-1),
            'reasoning': str
        }
    """
    try:
        # 直接创建底层 SDK client，不走 LLMClient trace 系统
        provider = os.getenv("DEFAULT_LLM_PROVIDER", "anthropic")
        api_key = os.getenv("LLM_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return {'artifact_type': None, 'artifacts': [], 'confidence': 0.0, 'reasoning': 'No API key'}

        base_url = os.getenv("LLM_BASE_URL")

        if provider == "openai-compatible":
            from openai import OpenAI as OpenAISDK
            raw_client = OpenAISDK(api_key=api_key, base_url=base_url)
        else:
            import anthropic
            raw_client = anthropic.Anthropic(api_key=api_key, base_url=base_url)

        # 构建输出描述
        result_type = result.get("result_type", "unknown")
        result_content = result.get("content", "")

        if isinstance(result_content, dict):
            content_desc = json.dumps(result_content, ensure_ascii=False)[:2000]
        else:
            content_desc = str(result_content)[:5000]

        # 获取项目根目录，让 LLM 知道在哪里查找文件
        project_root = os.getcwd()

        prompt = f"""You are analyzing the result of a skill execution to determine what artifacts were produced.

## Skill Name
{skill_name}

## Skill Input
```json
{json.dumps(input_data, ensure_ascii=False, indent=2)[:2000]}
```

## Skill Result
- result_type: {result_type}
- content: {content_desc}

## Project Root
{project_root}

## Supported Artifact Types
{', '.join(SUPPORTED_ARTIFACT_TYPES)}

## Task
Analyze what this skill ACTUALLY produced (not what it returned, but what actual files/artifacts were created).

Important context:
- Some skills return code/text but actually execute and create files (e.g., ffmpeg returns bash code but actually runs it and creates a video file)
- Check if the skill input indicates file operations (merging, converting, etc.)
- The project root is {project_root}, look for output files in {project_root}/outputs/

Rules:
1. If the skill result is code but the skill actually executes (like ffmpeg), infer the REAL output file
2. Video files are usually in outputs/videos/ and end in .mp4
3. Audio files are usually in outputs/audios/ and end in .wav, .mp3
4. Look for patterns like "merged", "output", the task_id in filenames
5. Return absolute paths for any artifacts found

Return ONLY a JSON object (no markdown):
{{
    "artifact_type": "video|audio|image|code|text|...",
    "artifacts": [
        {{"path": "/full/path/to/file", "type": "video"}}
    ],
    "confidence": 0.95,
    "reasoning": "Brief explanation of how you determined this..."
}}
"""

        model = os.getenv('DEFAULT_LLM_MODEL', 'glm-4.7')

        if provider == "openai-compatible":
            resp = raw_client.chat.completions.create(
                model=model,
                max_tokens=1024,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}],
                extra_body={"thinking": {"type": "disabled"}}
            )
            response_text = (resp.choices[0].message.content or "").strip()
        else:
            resp = raw_client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            response_text = resp.content[0].text.strip()

        # 移除可能的 markdown 代码块标记
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            if lines[0].startswith('```'):
                response_text = '\n'.join(lines[1:])
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            response_text = response_text.strip()

        result = json.loads(response_text)

        # 验证路径是否存在，如果不存在尝试在项目根目录查找
        artifacts = result.get('artifacts', [])
        for artifact in artifacts:
            path = artifact.get('path')
            if path and not os.path.exists(path):
                print(f"[ClaudeSkillHook] LLM inferred path doesn't exist: {path}")
                # 尝试从路径中提取文件名，在项目根目录查找
                filename = os.path.basename(path)
                project_root_path = os.path.join(project_root, filename)
                if os.path.exists(project_root_path):
                    print(f"[ClaudeSkillHook] Found file in project root: {project_root_path}")
                    artifact['path'] = project_root_path
                else:
                    result['confidence'] = max(0.5, result.get('confidence', 0.0) - 0.3)

        return {
            'artifact_type': result.get('artifact_type'),
            'artifacts': artifacts,
            'confidence': result.get('confidence', 0.0),
            'reasoning': result.get('reasoning', '')
        }

    except Exception as e:
        print(f"[ClaudeSkillHook] LLM inference failed: {e}")
        return {'artifact_type': None, 'artifacts': [], 'confidence': 0.0, 'reasoning': str(e)}


class ClaudeSkillHook(BaseHook):
    """Hook for handling Claude skill-specific logic like artifact inference."""

    async def pre_exec(self, context: SkillContext) -> Optional[Dict[str, Any]]:
        """Pre-execution: nothing to do."""
        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Post-execution: infer artifacts using LLM.

        Handles text, code, markdown, json, html types - uses LLM to determine the actual artifacts produced.
        Also handles output_files directly if available.

        只对 Claude skills 生效，native skills (tool-*) 直接返回。
        """
        # ClaudeSkillHook 只处理 Claude skills，不对 native skills 生效
        # native skills 有明确的 result_type，不需要 LLM 推理
        if context.skill_type == "native":
            return None

        result_type = result.get("result_type")
        metadata = result.get("metadata", {})
        output_files = result.get("output_files", [])
        if not isinstance(output_files, list):
            output_files = []

        if output_files and result_type not in ("video", "image", "audio", "gif", "infographic", "report"):
            # 对于非媒体类型，如果有 output_files，直接创建 artifacts
            file_path = output_files[0] if output_files else None
            if file_path:
                # 确定 artifact_type
                artifact_type = result_type
                if result_type == "code":
                    artifact_type = "code"
                elif result_type == "json":
                    artifact_type = "code"  # JSON 也作为代码类型处理
                elif result_type == "html":
                    artifact_type = "code"
                elif result_type == "markdown":
                    artifact_type = "code"
                else:
                    artifact_type = "text"

                # 创建 artifacts
                artifacts = [{"path": file_path, "type": artifact_type}]

                # 确保 metadata 是字典
                if not isinstance(metadata, dict):
                    metadata = {}
                if "skill_name" not in metadata:
                    metadata["skill_name"] = context.skill_name

                # ⚠️ 重要：保留原始 content，只添加 artifacts 字段
                # 不要覆盖 content，因为 tool-write 已经设置了正确的格式 {code, language, filename}
                result["artifacts"] = artifacts
                result["metadata"] = metadata
                print(f"[ClaudeSkillHook] Direct artifact from output_files: {file_path} (type: {artifact_type})")
                return result

        # 处理 text、code、markdown、json、html 类型 - 用 LLM 推理
        if result_type not in ("text", "code", "markdown", "json", "html"):
            return None

        print(f"[ClaudeSkillHook] Inferring artifacts for skill: {context.skill_name}, result_type: {result_type}")

        # 使用 LLM 推理产物信息（传入完整 result，不只是 content）
        inferred = await _infer_artifacts_with_llm(
            context.skill_name,
            context.input_data,
            result
        )

        confidence = inferred.get("confidence", 0.0)

        if confidence > 0.7:
            artifact_type = inferred.get("artifact_type", result_type)
            artifacts = inferred.get("artifacts", [])

            # 如果有 artifacts，取第一个 path
            if artifacts and "path" in artifacts[0]:
                path = artifacts[0]["path"]
            else:
                path = None

            # 将产物文件移动到规范的 outputs/ 目录
            if path and artifact_type in ARTIFACT_TYPE_TO_DIR:
                path = _normalize_artifact_path(path, artifact_type)
                # 更新 artifacts 中的路径
                if artifacts:
                    artifacts[0]["path"] = path

            # 确保 metadata 存在并保留 skill_name
            metadata = result.get("metadata", {})
            if not isinstance(metadata, dict):
                metadata = {}
            if "skill_name" not in metadata:
                metadata["skill_name"] = context.skill_name

            # 更新 result
            result.update({
                "result_type": artifact_type,
                "content": {"path": path} if path else result.get("content"),
                "inferred": True,
                "inference_confidence": confidence,
                "artifacts": artifacts,
                "metadata": metadata,
            })
            print(f"[ClaudeSkillHook] Inferred: {context.skill_name} -> {artifact_type} (confidence: {confidence})")
            print(f"[ClaudeSkillHook] Reasoning: {inferred.get('reasoning', '')}")
            if path:
                print(f"[ClaudeSkillHook] Artifact path: {path}")
        else:
            print(f"[ClaudeSkillHook] Low confidence ({confidence}), keeping original result_type: {result_type}")

        return result
