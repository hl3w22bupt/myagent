#!/usr/bin/env python3
"""
Motia Skill Output Schema Validator

验证 Skill 输出是否符合统一的格式规范。
"""

import sys
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple
from dataclasses import dataclass
from enum import Enum


class ValidationResult(Enum):
    """验证结果状态"""
    VALID = "valid"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationIssue:
    """验证问题"""
    level: ValidationResult
    field: str
    message: str
    suggestion: str = ""


class SkillOutputValidator:
    """Skill 输出验证器"""

    # 定义有效的 result_type 枚举值
    VALID_RESULT_TYPES = {
        # 文本类型
        "text", "markdown", "code",
        # 媒体类型
        "image", "video", "audio", "gif",
        # 文档类型
        "infographic", "report", "spreadsheet", "presentation",
        # 数据类型
        "table", "json", "chart",
        # 特殊类型
        "error", "mixed", "unknown",
    }

    # 定义有效的错误类型
    VALID_ERROR_TYPES = {
        "validation", "execution", "timeout", "network",
        "resource", "permission", "dependency", "unknown",
    }

    def __init__(self):
        self.issues: List[ValidationIssue] = []

    def validate(self, output: Dict[str, Any]) -> Tuple[bool, List[ValidationIssue]]:
        """
        验证技能输出

        Args:
            output: 技能输出字典

        Returns:
            (is_valid, issues): 是否有效，问题列表
        """
        self.issues = []

        # 1. 验证必需字段
        self._validate_required_fields(output)

        # 2. 验证 result_type
        if "result_type" in output:
            self._validate_result_type(output["result_type"])

        # 3. 验证 success 字段
        if "success" in output:
            self._validate_success(output)

        # 4. 验证 content 字段
        if "content" in output:
            self._validate_content(output)

        # 5. 验证 metadata 字段
        if "metadata" in output:
            self._validate_metadata(output["metadata"])

        # 6. 验证路径规范
        self._validate_paths(output)

        return (
            all(issue.level != ValidationResult.ERROR for issue in self.issues),
            self.issues
        )

    def _validate_required_fields(self, output: Dict[str, Any]):
        """验证必需字段"""
        required_fields = ["result_type", "success", "content", "metadata"]

        for field in required_fields:
            if field not in output:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field=field,
                    message=f"缺少必需字段 '{field}'",
                    suggestion="所有输出必须包含 result_type, success, content, metadata 字段"
                ))

    def _validate_result_type(self, result_type: str):
        """验证 result_type"""
        if result_type not in self.VALID_RESULT_TYPES:
            self.issues.append(ValidationIssue(
                level=ValidationResult.ERROR,
                field="result_type",
                message=f"无效的 result_type: '{result_type}'",
                suggestion=f"必须是以下值之一: {', '.join(sorted(self.VALID_RESULT_TYPES))}"
            ))

    def _validate_success(self, output: Dict[str, Any]):
        """验证 success 字段"""
        success = output["success"]
        result_type = output["result_type"]

        if not isinstance(success, bool):
            self.issues.append(ValidationIssue(
                level=ValidationResult.ERROR,
                field="success",
                message=f"success 必须是布尔值，当前类型: {type(success).__name__}",
                suggestion="使用 true 或 false"
            ))

        # 如果 success=false，result_type 应该是 error
        if success is False and result_type != "error":
            self.issues.append(ValidationIssue(
                level=ValidationResult.WARNING,
                field="result_type",
                message=f"success=false 时，result_type 应该是 'error'，当前是 '{result_type}'",
                suggestion="设置 result_type='error' 并使用错误内容格式"
            ))

        # 如果 success=true，result_type 不应该是 error
        if success is True and result_type == "error":
            self.issues.append(ValidationIssue(
                level=ValidationResult.ERROR,
                field="result_type",
                message="success=true 时，result_type 不应该是 'error'",
                suggestion="使用正确的结果类型（如 image, video 等）"
            ))

    def _validate_content(self, output: Dict[str, Any]):
        """验证 content 字段"""
        content = output["content"]
        result_type = output["result_type"]
        success = output.get("success", True)

        # 错误内容验证
        if result_type == "error" or success is False:
            if not isinstance(content, dict):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content",
                    message="错误内容必须是对象格式",
                    suggestion="错误内容应包含 type, message 等字段"
                ))
                return

            # 验证错误内容字段
            if "type" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.type",
                    message="错误内容缺少 'type' 字段",
                    suggestion="必须指定错误类型（validation, execution, timeout 等）"
                ))
            elif content["type"] not in self.VALID_ERROR_TYPES:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.type",
                    message=f"无效的错误类型: '{content['type']}'",
                    suggestion=f"必须是以下值之一: {', '.join(self.VALID_ERROR_TYPES)}"
                ))

            if "message" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.message",
                    message="错误内容缺少 'message' 字段",
                    suggestion="必须提供用户友好的错误消息"
                ))

            return

        # 媒体类型验证
        if result_type in ["image", "video", "audio", "gif", "infographic"]:
            if not isinstance(content, dict):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content",
                    message=f"{result_type} 内容必须是对象格式",
                    suggestion="应包含 path, mime_type 等字段"
                ))
                return

            # 验证必需字段
            required_media_fields = ["path", "mime_type"]
            for field in required_media_fields:
                if field not in content:
                    self.issues.append(ValidationIssue(
                        level=ValidationResult.ERROR,
                        field=f"content.{field}",
                        message=f"媒体内容缺少必需字段 '{field}'",
                        suggestion="确保包含 path 和 mime_type"
                    ))

        # 代码类型验证
        elif result_type == "code":
            if not isinstance(content, dict):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content",
                    message="代码内容必须是对象格式",
                    suggestion="应包含 code, language 等字段"
                ))
                return

            if "code" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.code",
                    message="代码内容缺少 'code' 字段"
                ))

            if "language" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.language",
                    message="代码内容缺少 'language' 字段"
                ))

        # 表格类型验证
        elif result_type == "table":
            if not isinstance(content, dict):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content",
                    message="表格内容必须是对象格式",
                    suggestion="应包含 headers, rows 等字段"
                ))
                return

            if "headers" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.headers",
                    message="表格内容缺少 'headers' 字段"
                ))

            if "rows" not in content:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content.rows",
                    message="表格内容缺少 'rows' 字段"
                ))

        # 混合类型验证
        elif result_type == "mixed":
            if not isinstance(content, list):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="content",
                    message="混合内容必须是数组格式",
                    suggestion="内容项应包含 type, content 等字段"
                ))
                return

            # 验证每个内容项
            for idx, item in enumerate(content):
                if not isinstance(item, dict):
                    self.issues.append(ValidationIssue(
                        level=ValidationResult.ERROR,
                        field=f"content[{idx}]",
                        message="内容项必须是对象格式"
                    ))
                    continue

                if "type" not in item:
                    self.issues.append(ValidationIssue(
                        level=ValidationResult.ERROR,
                        field=f"content[{idx}].type",
                        message="内容项缺少 'type' 字段"
                    ))

                if "content" not in item:
                    self.issues.append(ValidationIssue(
                        level=ValidationResult.ERROR,
                        field=f"content[{idx}].content",
                        message="内容项缺少 'content' 字段"
                    ))

    def _validate_metadata(self, metadata: Dict[str, Any]):
        """验证 metadata 字段"""
        # 验证必需字段
        required_meta_fields = ["execution_time", "skills_used"]

        for field in required_meta_fields:
            if field not in metadata:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.WARNING,
                    field=f"metadata.{field}",
                    message=f"metadata 缺少推荐字段 '{field}'",
                    suggestion="建议提供 execution_time 和 skills_used 字段"
                ))

        # 验证 execution_time
        if "execution_time" in metadata:
            execution_time = metadata["execution_time"]
            if not isinstance(execution_time, int) or execution_time < 0:
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="metadata.execution_time",
                    message="execution_time 必须是正整数",
                    suggestion="使用毫秒为单位的整数"
                ))

        # 验证 skills_used
        if "skills_used" in metadata:
            skills_used = metadata["skills_used"]
            if not isinstance(skills_used, list):
                self.issues.append(ValidationIssue(
                    level=ValidationResult.ERROR,
                    field="metadata.skills_used",
                    message="skills_used 必须是数组",
                    suggestion="使用字符串数组，如 ['skill-1', 'skill-2']"
                ))

    def _validate_paths(self, output: Dict[str, Any]):
        """验证路径规范"""
        content = output.get("content")
        if not isinstance(content, dict):
            return

        # 检查各种可能的路径字段
        path_fields = ["path", "thumbnail_path", "thumbnailPath"]

        for field in path_fields:
            if field in content:
                path = content[field]
                if self._is_invalid_path(path):
                    self.issues.append(ValidationIssue(
                        level=ValidationResult.ERROR,
                        field=f"content.{field}",
                        message=f"路径格式错误: '{path}'",
                        suggestion="路径必须相对于 outputs/ 目录，不能包含 'outputs/' 前缀或绝对路径"
                    ))

    def _is_invalid_path(self, path: str) -> bool:
        """检查路径是否无效"""
        if not isinstance(path, str):
            return False

        # 检查是否包含 outputs/ 前缀
        if path.startswith("outputs/"):
            return True

        # 检查是否是绝对路径
        if path.startswith("/") or path.startswith("C:") or path.startswith("D:"):
            return True

        # 检查是否包含 .. (路径遍历)
        if ".." in path:
            return True

        return False


def print_validation_result(is_valid: bool, issues: List[ValidationIssue]):
    """打印验证结果"""
    if is_valid:
        print("✅ 验证通过！输出格式符合规范。")
        return

    # 按严重程度分组
    errors = [i for i in issues if i.level == ValidationResult.ERROR]
    warnings = [i for i in issues if i.level == ValidationResult.WARNING]

    if errors:
        print(f"\n❌ 发现 {len(errors)} 个错误:")
        for issue in errors:
            print(f"\n  • {issue.field}")
            print(f"    {issue.message}")
            if issue.suggestion:
                print(f"    💡 建议: {issue.suggestion}")

    if warnings:
        print(f"\n⚠️  发现 {len(warnings)} 个警告:")
        for issue in warnings:
            print(f"\n  • {issue.field}")
            print(f"    {issue.message}")
            if issue.suggestion:
                print(f"    💡 建议: {issue.suggestion}")


def validate_json_file(file_path: str):
    """验证 JSON 文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            output = json.load(f)

        validator = SkillOutputValidator()
        is_valid, issues = validator.validate(output)
        print_validation_result(is_valid, issues)

        return is_valid

    except FileNotFoundError:
        print(f"❌ 文件不存在: {file_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败: {e}")
        return False
    except Exception as e:
        print(f"❌ 验证失败: {e}")
        return False


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("Usage: python validate_skill_output.py <output.json>")
        print("\n示例:")
        print("  python validate_skill_output.py test_output.json")
        print("  python validate_skill_output.py skills/infographic-generator/test_output.json")
        sys.exit(1)

    file_path = sys.argv[1]
    is_valid = validate_json_file(file_path)
    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()
