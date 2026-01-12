#!/bin/bash

# Chrome Launcher Script for Remotion
# This script wraps the system Chrome with --headless=new flag

# Direct path to our Chrome wrapper script
CHROME_WRAPPER="/Users/leo/workspace/myagent/skills/remotion-generator/template/.cache/remotion/chrome/chrome-headless-shell/chrome-headless-shell"

# Add headless=new flag and pass all arguments
exec "$CHROME_WRAPPER" --headless=new "$@"
