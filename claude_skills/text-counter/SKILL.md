---
description: Counts words, characters, and lines in text
tags:
  - text
  - utility
  - analysis
---

# Text Counter Skill

Count words, characters, and lines in provided text.

## Input

- `text`: The text to analyze
- `mode`: Analysis mode - 'basic' or 'detailed' (default: 'basic')

## Output Format

JSON with count results.

## Examples

Example 1: Basic word count
```
Input: {"text": "Hello world"}
Output: {"words": 2, "characters": 11, "lines": 1}
```

Example 2: Detailed analysis
```
Input: {"text": "Hello\nworld", "mode": "detailed"}
Output: {"words": 2, "characters": 11, "lines": 2, "paragraphs": 2}
```
