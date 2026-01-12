#!/usr/bin/env python3
"""测试直接提供composition_code的功能"""
import sys
import asyncio
sys.path.insert(0, 'skills/remotion-generator')

from handler import RemotionVideoGenerator

async def test():
    gen = RemotionVideoGenerator()

    # 测试数据
    test_code = '''
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

export const TestVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  return (
    <AbsoluteFill style={{
      backgroundColor: '#4f46e5',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <h1 style={{color: 'white', fontSize: 100}}>
        Test Video
      </h1>
    </AbsoluteFill>
  );
};
'''

    input_data = {
        'composition_code': test_code,
        'composition_id': 'TestVideo',
        'duration_frames': 30,  # 1 second at 30fps
        'fps': 30,
        'width': 1280,
        'height': 720
    }

    try:
        result = await gen.generate_video(input_data)
        print(f"✅ 成功!")
        print(f"结果: {result}")
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test())
