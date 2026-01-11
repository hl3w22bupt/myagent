import { LLMClient } from './src/core/agent/llm-client.js';
import { PTCGenerator } from './src/core/agent/ptc-generator.js';

const llm = new LLMClient();
const skills = [
  { name: 'remotion-generator', description: 'Generate videos using Remotion framework from natural language descriptions', tags: ['remotion', 'video', 'animation', 'media-generation'] }
];

const generator = new PTCGenerator(llm, skills);

const task = '生成测试视频，显示文字 Hello World，时长2秒';

generator.generate(task).then(code => {
  console.log('=== Generated PTC Code ===');
  console.log(code);
  console.log('=== End of Code ===');
}).catch(err => {
  console.error('Error:', err);
});
