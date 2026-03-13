---
name: file-operations
description: File system operations for listing, reading, and managing files
tags:
  - tools
  - files
  - filesystem
command-dispatch: tool
command-tool: tool-bash
metadata:
  openclaw:
    requires:
      bins: [ls, cat, head, tail, find]
      env: []
      config: []
    install: []
---

# File Operations Skill

Performs common file system operations using bash tools.

## Capabilities

- **List files**: List directory contents with details
- **Read files**: Display file contents
- **Search files**: Find files by name or content
- **File info**: Get file metadata and statistics

## Usage

Simply describe what you want to do with files:
- "List files in the current directory"
- "Show me the first 20 lines of package.json"
- "Find all Python files in src/"
- "Display README.md"
