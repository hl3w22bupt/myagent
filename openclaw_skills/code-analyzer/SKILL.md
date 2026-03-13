---
name: code-analyzer
description: Analyze code quality, detect bugs, and suggest improvements
tags:
  - code
  - analysis
  - quality
  - tools
type: hybrid
metadata:
  openclaw:
    requires:
      bins: [python3]
      env: []
      config: []
    install:
    - pip install pylint
    - pip install bandit
---

# Code Analyzer Skill

Analyzes Python code for quality issues, security vulnerabilities, and potential bugs.

## Features

- **Quality Analysis**: Check code style and best practices
- **Security Scan**: Detect common security issues
- **Bug Detection**: Find potential bugs and anti-patterns
- **Metrics**: Calculate code complexity and maintainability

## Usage

Ask to analyze code:
- "Analyze src/main.py for bugs"
- "Check the quality of the codebase"
- "Scan for security vulnerabilities in api/"

## Tools Used

- **pylint**: Code quality linter
- **bandit**: Security vulnerability scanner
- **custom scripts**: Specialized analysis scripts
