# skills/lib/tests/test_output_builder.py
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from output_builder import OutputBuilder, MediaInfo, ErrorInfo, get_relative_path


def test_build_infographic_output():
    """测试构建 infographic 输出"""
    output = OutputBuilder() \
        .set_infographic(
            path="infographics/test.svg",
            mime_type="image/svg+xml",
            size=12345,
            width=1920,
            height=1080,
            template="column-chart",
            theme="business"
        ) \
        .set_title("测试信息图") \
        .add_skill("infographic-generator") \
        .build()

    # 验证必需字段
    assert "result_type" in output
    assert output["result_type"] == "infographic"
    assert output["success"] == True
    assert "content" in output
    assert "metadata" in output

    # 验证 content 格式
    assert output["content"]["path"] == "infographics/test.svg"
    assert output["content"]["mime_type"] == "image/svg+xml"
    assert output["content"]["size"] == 12345
    assert output["content"]["template"] == "column-chart"

    # 验证 metadata
    assert "execution_time" in output["metadata"]
    assert "skills_used" in output["metadata"]
    assert "infographic-generator" in output["metadata"]["skills_used"]

    print("✅ test_build_infographic_output PASSED")


def test_build_video_output():
    """测试构建 video 输出"""
    output = OutputBuilder() \
        .set_media(MediaInfo(
            path="videos/test.mp4",
            mime_type="video/mp4",
            size=543210,
            width=1920,
            height=1080,
            duration=10.5,
            fps=30
        )) \
        .set_title("测试视频") \
        .add_skill("remotion-generator") \
        .build()

    assert output["result_type"] == "video"
    assert output["content"]["path"] == "videos/test.mp4"
    assert output["content"]["duration"] == 10.5
    assert output["content"]["fps"] == 30

    print("✅ test_build_video_output PASSED")


def test_build_error_output():
    """测试构建错误输出"""
    try:
        raise ValueError("测试错误")
    except Exception as e:
        output = OutputBuilder() \
            .set_error(
                error=e,
                suggestions=["建议1", "建议2"]
            ) \
            .add_skill("test-skill") \
            .build()

    assert output["result_type"] == "error"
    assert output["success"] == False
    assert output["content"]["type"] == "validation"
    assert output["content"]["message"] == "测试错误"
    assert "suggestions" in output["content"]

    print("✅ test_build_error_output PASSED")


def test_build_table_output():
    """测试构建 table 输出"""
    output = OutputBuilder() \
        .set_table(
            headers=["列1", "列2", "列3"],
            rows=[
                ["数据1", "数据2", "数据3"],
                ["数据4", "数据5", "数据6"]
            ],
            title="测试表格",
            sortable=True
        ) \
        .build()

    assert output["result_type"] == "table"
    assert output["content"]["headers"] == ["列1", "列2", "列3"]
    assert len(output["content"]["rows"]) == 2
    assert output["content"]["title"] == "测试表格"
    assert output["content"]["sortable"] == True

    print("✅ test_build_table_output PASSED")


def test_get_relative_path():
    """测试路径处理"""
    # 测试完整路径
    full_path = "/Users/leo/workspace/myagent/outputs/infographics/test.svg"
    relative = get_relative_path(full_path)
    assert relative == "infographics/test.svg"

    # 测试包含 outputs/ 前缀的完整路径
    full_path_with_prefix = "/Users/leo/workspace/myagent/outputs/videos/test.mp4"
    relative2 = get_relative_path(full_path_with_prefix)
    assert relative2 == "videos/test.mp4"

    print("✅ test_get_relative_path PASSED")


if __name__ == "__main__":
    test_build_infographic_output()
    test_build_video_output()
    test_build_error_output()
    test_build_table_output()
    test_get_relative_path()
    print("\n✅ 所有测试通过!")
