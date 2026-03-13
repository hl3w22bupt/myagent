---
name: test-scripts
description: A test skill with scripts/ directory for OpenClaw adapter validation
tags:
  - test
  - hybrid
metadata:
  openclaw:
    requires:
      bins: []
      env: []
      config: []
    install: []
---

# Test Scripts Skill

This is a test skill to validate that the OpenClaw adapter works correctly for skills with scripts/ directory.

## Instructions

When a user asks you to run a test script, you should execute the test script from {baseDir}/scripts/.

## Available Scripts

- test.sh: A simple test script

## Usage

Run: bash {baseDir}/scripts/test.sh
