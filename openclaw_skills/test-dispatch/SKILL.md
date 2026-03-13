---
name: test-dispatch
description: A test skill with command-dispatch for OpenClaw adapter validation
tags:
  - test
  - command-dispatch
command-dispatch: tool
command-tool: tool-bash
metadata:
  openclaw:
    requires:
      bins: []
      env: []
      config: []
    install: []
---

# Test Command Dispatch Skill

This is a test skill to validate that the OpenClaw adapter works correctly for command-dispatch skills.

## Behavior

This skill dispatches directly to the tool-bash handler without LLM invocation.

## Usage

When invoked, it will directly pass the user input to the tool-bash handler.
