"""
Simple Code Generator - Returns example code snippets
"""

import json
from typing import Dict, Any
import sys
import os

# 添加 skills/lib 到路径以导入 OutputBuilder
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate example code snippets.

    Args:
        input_data: Dictionary with 'task' and optional 'language'

    Returns:
        Result dictionary with code output
    """
    task = input_data.get('task', {})
    context = input_data.get('context', {})

    # Extract language from task
    language = 'python'
    task_str = str(task).lower()

    if 'javascript' in task_str or 'js' in task_str:
        language = 'javascript'
    elif 'typescript' in task_str or 'ts' in task_str:
        language = 'typescript'
    elif 'html' in task_str:
        language = 'html'
    elif 'css' in task_str:
        language = 'css'

    # Generate example code based on language
    if language == 'python':
        code = '''def greet(name: str) -> str:
    """
    Greet the person by name.

    Args:
        name: The name of the person to greet

    Returns:
        A greeting message
    """
    return f"Hello, {name}!"
'''
    elif language == 'javascript':
        code = '''function greet(name) {
    /**
     * Greet the person by name
     * @param {string} name - The name of the person to greet
     * @returns {string} A greeting message
     */
    return \`Hello, \${name}!\`;
}'''
    elif language == 'html':
        code = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Greeting Page</title>
</head>
<body>
    <h1>Hello, World!</h1>
</body>
</html>'''
    elif language == 'css':
        code = '''.greeting {
    color: #333;
    font-size: 24px;
    text-align: center;
}'''
    else:
        code = f'# Example {language} code'

    # 使用 OutputBuilder 返回统一格式
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder() \
            .set_code(code, language=language) \
            .set_title(f"Generated {language} code") \
            .build()

    # Fallback：旧格式（保持向后兼容）
    return {
        'success': True,
        'output': code,
        'artifact_type': 'code',
        'language': language
    }


if __name__ == "__main__":
    import sys
    input_data = json.loads(sys.stdin.read())
    result = execute(input_data)
    print(json.dumps(result, indent=2, ensure_ascii=False))
