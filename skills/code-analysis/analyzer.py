"""
Code Analysis Skill - Static Code Analysis

Analyzes code quality, complexity, and potential issues.
"""

import re
from typing import Dict, Any, List


def analyze(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze code quality and patterns.

    Args:
        input_data: Dictionary containing:
            - code: Source code to analyze
            - language: Programming language
            - checks: List of checks to perform

    Returns:
        Dictionary with analysis results
    """
    code = input_data.get('code', '')
    language = input_data.get('language', 'python')
    checks = input_data.get('checks', ['quality', 'complexity', 'security'])

    issues = []
    suggestions = []
    metrics = {}

    # Language-specific analysis
    if language == 'python':
        issues_py, suggestions_py, metrics_py = _analyze_python(code)
        issues.extend(issues_py)
        suggestions.extend(suggestions_py)
        metrics.update(metrics_py)

    elif language in ['javascript', 'typescript']:
        issues_js, suggestions_js, metrics_js = _analyze_javascript(code)
        issues.extend(issues_js)
        suggestions.extend(suggestions_js)
        metrics.update(metrics_js)

    # Calculate quality score
    base_score = 100
    critical_count = 0
    for s in suggestions:
        if isinstance(s, dict) and 'critical' in str(s).lower():
            critical_count += 1

    score = base_score - (len(issues) * 5) - (critical_count * 10)
    score = max(0, min(100, score))

    return {
        "score": score,
        "issues": issues,
        "suggestions": suggestions,
        "metrics": metrics,
        "language": language
    }


def _analyze_python(code: str) -> tuple:
    """Analyze Python code."""
    issues = []
    suggestions = []
    metrics = {}

    # Count lines of code
    lines = code.split('\n')
    metrics['lines_of_code'] = len([l for l in lines if l.strip() and not l.strip().startswith('#')])

    # Check for print statements
    print_matches = re.finditer(r'\bprint\s*\(', code)
    for match in print_matches:
        line_num = code[:match.start()].count('\n') + 1
        issues.append({
            "severity": "warning",
            "category": "best-practices",
            "message": "Print statement found in code",
            "line": line_num,
            "suggestion": "Consider using logging instead of print"
        })

    # Check for long functions
    functions = re.finditer(r'def\s+(\w+)\s*\([^)]*\)\s*:', code)
    for func_match in functions:
        func_name = func_match.group(1)
        func_start = func_match.start()
        # Find next 'def' or end of code
        next_def = code.find('\ndef ', func_start + 1)
        if next_def == -1:
            func_end = len(code)
        else:
            func_end = next_def

        func_code = code[func_start:func_end]
        func_lines = len([l for l in func_code.split('\n') if l.strip()])

        if func_lines > 50:
            issues.append({
                "severity": "info",
                "category": "complexity",
                "message": f"Function '{func_name}' is long ({func_lines} lines)",
                "line": code[:func_start].count('\n') + 1,
                "suggestion": "Consider breaking this function into smaller functions"
            })

    # Check for TODO comments
    todo_matches = re.finditer(r'#\s*TODO[:\s]*(.+)', code)
    for match in todo_matches:
        line_num = code[:match.start()].count('\n') + 1
        suggestions.append({
            "category": "maintenance",
            "message": f"TODO comment found: {match.group(1).strip()}",
            "line": line_num
        })

    # Calculate complexity (very basic)
    metrics['complexity'] = {
        'num_functions': len(list(functions)),
        'estimated_complexity': 'low' if len(list(functions)) < 5 else 'medium'
    }

    return issues, suggestions, metrics


def _analyze_javascript(code: str) -> tuple:
    """Analyze JavaScript/TypeScript code."""
    issues = []
    suggestions = []
    metrics = {}

    # Count lines of code
    lines = code.split('\n')
    metrics['lines_of_code'] = len([l for l in lines if l.strip() and not l.strip().startswith('//')])

    # Check for console.log
    console_matches = re.finditer(r'console\.log\s*\(', code)
    for match in console_matches:
        line_num = code[:match.start()].count('\n') + 1
        issues.append({
            "severity": "warning",
            "category": "best-practices",
            "message": "console.log statement found in code",
            "line": line_num,
            "suggestion": "Remove or replace with proper logging"
        })

    # Check for var usage
    var_matches = re.finditer(r'\bvar\s+', code)
    for match in var_matches:
        line_num = code[:match.start()].count('\n') + 1
        issues.append({
            "severity": "warning",
            "category": "modern-js",
            "message": "Usage of 'var' keyword",
            "line": line_num,
            "suggestion": "Use 'let' or 'const' instead of 'var'"
        })

    metrics['complexity'] = {
        'estimated_complexity': 'low'
    }

    return issues, suggestions, metrics


# For testing
if __name__ == "__main__":
    test_code = """
def calculate_sum(numbers):
    result = 0
    for num in numbers:
        result += num
        print(f"Adding {num}")  # TODO: Remove debug print
    return result
"""

    result = analyze({
        "code": test_code,
        "language": "python"
    })

    import json
    print(json.dumps(result, indent=2))
