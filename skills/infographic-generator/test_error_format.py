#!/usr/bin/env python3
"""
Test error output format
"""
import sys
from pathlib import Path

sys.path.insert(0, "/Users/leo/workspace/myagent/skills/lib")

from output_builder import OutputBuilder
import json

def test_error_output():
    """测试错误输出格式"""
    print("Testing error output format...")

    # 测试验证错误
    error_output = OutputBuilder() \
        .set_error(
            error=ValueError("Content is required"),
            suggestions=["请提供要生成信息图的内容描述"]
        ) \
        .add_skill("infographic-generator") \
        .build()

    print("Error output:")
    print(json.dumps(error_output, indent=2, ensure_ascii=False))

    # 验证结构
    assert error_output["result_type"] == "error"
    assert error_output["success"] == False
    assert error_output["content"]["type"] == "validation"
    assert error_output["content"]["message"] == "Content is required"
    assert "suggestions" in error_output["content"]
    assert "infographic-generator" in error_output["metadata"]["skills_used"]

    print("\n✅ Error output format is correct!")

    # 保存用于验证
    with open("/tmp/infographic_error_output.json", "w") as f:
        json.dump(error_output, f, indent=2, ensure_ascii=False)

    return error_output


if __name__ == "__main__":
    test_error_output()
