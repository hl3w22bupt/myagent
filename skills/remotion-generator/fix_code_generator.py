#!/usr/bin/env python3
"""
快速修复 code_generator_v2.py 的 f-string 问题

将 _build_code_prompt_v2 方法改为使用 .format() 方法
"""

import re

# 读取文件
with open('/Users/leo/workspace/myagent/skills/remotion-generator/generators/code_generator_v2.py', 'r') as f:
    content = f.read()

# 找到 _build_code_prompt_v2 方法的开始和结束
start_pattern = r'def _build_code_prompt_v2\('
end_pattern = r'\n    def _format_scene_breakdown_v2\('

# 找到方法的开始
start_match = re.search(start_pattern, content)
if not start_match:
    print("❌ 找不到 _build_code_prompt_v2 方法")
    exit(1)

start_pos = start_match.start()

# 找到方法的结束
end_match = re.search(end_pattern, content[start_pos:])
if not end_match:
    print("❌ 找不到 _format_scene_breakdown_v2 方法")
    exit(1)

end_pos = start_pos + end_match.start()

# 提取方法之外的内容
before_method = content[:start_pos]
after_method = content[end_pos:]

print(f"✅ 找到 _build_code_prompt_v2 方法（行 {start_pos}-{end_pos}）")
print(f"方法长度: {end_pos - start_pos} 字符")

# 创建新的方法（使用 .format()）
new_method = '''    def _build_code_prompt_v2(
        self,
        analysis: Dict[str, Any],
        duration: int,
        fps: int,
        resolution: str,
        error_context: Optional[str] = None
    ) -> str:
        """Build enhanced code generation prompt with Few-Shot examples (v2.0)."""
        width, height = resolution.split("x")
        total_frames = duration * fps

        error_section = ""
        if error_context:
            error_section = """

## Previous Attempt Issues
{}

Please address these issues in your new implementation.""".format(error_context)

        # Get scene breakdown
        scene_breakdown = self._format_scene_breakdown_v2(analysis.get('scenes', []), total_frames)

        # Build prompt using format() to avoid f-string brace escaping
        prompt = """Generate complete Remotion TypeScript/React code based on the educational content analysis.

## Content Analysis
```json
{}
```

## Video Parameters
- Duration: {} seconds
- FPS: {}
- Resolution: {} ({}x{})
- Total Frames: {}

---

## Code Structure Requirements

### Component Organization
- Import Remotion and React
- Define TypeScript interfaces
- Create reusable visualization components
- Create scene-specific components
- Main video component with scene management
- Root composition

### Scene Management Pattern
```typescript
const MainVideo: React.FC<Props> = (props) => {{
  const {{ durationInFrames, width, height }} = useVideoConfig();
  const frame = useCurrentFrame();

  // Pre-calculate scene boundaries
  const scene1End = Math.floor(durationInFrames * 0.25);
  const scene2End = scene1End + Math.floor(durationInFrames * 0.35);
  const scene3End = scene2End + Math.floor(durationInFrames * 0.30);

  // Scene-specific animations (only when visible)
  const scene1Opacity = frame < scene1End ? interpolate(frame, [0, 30], [0, 1]) : 1;
  const scene2Opacity = frame >= scene1End && frame < scene2End ? interpolate(frame, [scene1End, scene1End + 30], [0, 1]) : 0;
  const scene3Opacity = frame >= scene2End ? interpolate(frame, [scene2End, scene2End + 30], [0, 1]) : 0;

  return (
    <AbsoluteFill style={{{{ backgroundColor: '#1F2937' }}}}>
      {{frame < scene1End && <Scene1 opacity={{scene1Opacity}} />}}
      {{frame >= scene1End && frame < scene2End && <Scene2 opacity={{scene2Opacity}} />}}
      {{frame >= scene2End && <Scene3 opacity={{scene3Opacity}} />}}
    </AbsoluteFill>
  );
}};
```

---

## Performance Optimization

### 1. Use useMemo for expensive calculations
```typescript
const points = useMemo(() => generatePoints(func), []);
```

### 2. Pre-calculate positions
```typescript
const centerPos = useMemo(() => ({{ x: width / 2, y: height / 2 }}), [width, height]);
```

### 3. Conditional rendering
```typescript
{{{{shouldShow && <Component />}}}}
```

---

## Visualization Components

### Formula Display
```typescript
const Formula: React.FC<{{ formula: string }}> = ({{ formula }}) => (
  <div style={{{{ fontFamily: 'Georgia, serif', fontSize: 48, color: '#E5E7EB' }}}}>
    {{formula}}
  </div>
);
```

### SVG Graph
```typescript
const Graph: React.FC<{{ points: [number, number][] }}> = ({{ points }}) => {
  const pathData = `M ${{points.map(p => p.join(',')).join(' L ')}}`;
  return (
    <svg viewBox="0 0 400 300">
      <path d={{pathData}} fill="none" stroke="#3B82F6" strokeWidth={{3}} />
    </svg>
  );
};
```

---

## Scene Breakdown
{}

## Topic-Specific Guidelines
{}

## Code Quality Checklist
- Valid TypeScript syntax
- Proper interfaces (no `any` without justification)
- Performance-optimized (useMemo, pre-calculate)
- Accessible (font sizes > 16, color contrast > 4.5:1)
- Scene timing sums to 100%
- No hardcoded frame numbers
- Complete, working code (no placeholders)

---

## Output Requirements

**CRITICAL**:
- Output ONLY the complete TypeScript code
- Wrap code in \\```typescript code blocks
- No explanations outside code blocks
- No placeholders - provide complete, working code
- Ensure code is ready to run without modifications

Generate the complete, production-ready Remotion code now.""".format(
    json.dumps(analysis, indent=2, ensure_ascii=False),
    duration, fps, resolution, width, height, total_frames,
    scene_breakdown,
    self._get_topic_guidelines_v2(analysis['topic'].get('category', 'general'))
)

        return prompt
'''

# 组合新的内容
new_content = before_method + new_method + after_method

# 写入文件
with open('/Users/leo/workspace/myagent/skills/remotion-generator/generators/code_generator_v2.py', 'w') as f:
    f.write(new_content)

print("✅ 修复完成！")
print("新的 _build_code_prompt_v2 方法使用 .format() 代替 f-string")
print("避免了所有的大括号转义问题")
