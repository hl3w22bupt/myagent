#!/bin/bash

# Remotion Template Setup Script
# This script creates the template directory needed by remotion-generator skill

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$PROJECT_ROOT/skills/remotion-generator/template"

echo "🎬 Setting up Remotion template directory..."
echo "Template path: $TEMPLATE_DIR"

# Check if template already exists
if [ -d "$TEMPLATE_DIR" ]; then
    echo "⚠️  Template directory already exists"
    read -p "Delete and recreate? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$TEMPLATE_DIR"
    else
        echo "Aborted"
        exit 1
    fi
fi

# Create template directory
mkdir -p "$TEMPLATE_DIR"
cd "$TEMPLATE_DIR"

echo "📦 Initializing Remotion project..."

# Initialize npm project
npm init -y > /dev/null 2>&1

# Install Remotion and dependencies
echo "📥 Installing Remotion and dependencies..."
npm install remotion@^4.0.0 react@^18.0.0 react-dom@^18.0.0 > /dev/null 2>&1

# Create src directory
mkdir -p src

# Create Root.tsx (will be overwritten by generated code)
cat > src/Root.tsx << 'EOF'
import {Composition} from 'remotion';
import {MinimalVideo} from './MinimalVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MinimalVideo"
        component={MinimalVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
EOF

# Create MinimalVideo.tsx
cat > src/MinimalVideo.tsx << 'EOF'
import {AbsoluteFill} from 'remotion';

export const MinimalVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: 'white'}} />
  );
};
EOF

# Create index.ts
cat > src/index.ts << 'EOF'
import {Composition} from 'remotion';
import {MinimalVideo} from './MinimalVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MinimalVideo"
        component={MinimalVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
EOF

# Create remotion.config.ts
cat > remotion.config.ts << 'EOF'
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
EOF

# Create package.json with proper configuration
cat > package.json << 'EOF'
{
  "name": "remotion-template",
  "version": "1.0.0",
  "description": "Remotion template for video generation",
  "type": "module",
  "scripts": {
    "start": "remotion studio",
    "build": "remotion bundle",
    "remotion": "remotion"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.227",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "remotion": "^4.0.227"
  }
}
EOF

# Reinstall dependencies to ensure package.json is used
echo "📥 Installing dependencies..."
npm install > /dev/null 2>&1

echo ""
echo "✅ Remotion template setup complete!"
echo ""
echo "Template directory: $TEMPLATE_DIR"
echo ""
echo "Next steps:"
echo "  1. Test the skill: python3 scripts/test-composition-code.py"
echo "  2. Run golden sample: python3 scripts/test-golden-sample.py"
echo ""
