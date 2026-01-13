# Integration Tests

## E2E Test for Remotion Generator

### Running the Test

```bash
# Method 1: Direct bash script (recommended)
npm run test:e2e

# Method 2: Jest wrapper
npm run test:e2e:jest

# Method 3: Direct script execution
bash tests/integration/test-e2e.sh
```

### What It Tests

1. **Server Restart** - Kills old `motia dev` process and starts fresh
2. **Task Submission** - POST to `/agent/execute` with natural language description
3. **Result Polling** - Calls `/agent/results?taskId=XXX` every 5 seconds
4. **Video Validation** - Checks that video file was created in `outputs/videos/`

### Success Criteria

✅ Task completes successfully (`result.success === true`)
✅ Video file exists in `outputs/videos/`
✅ File size is reasonable (hundreds of KB to few MB)

### Test Case

"生成一个泰勒公式的教学视频，重点讲解它的核心理念和本质"

Validates:
- Content analysis works correctly
- Code generation produces valid Remotion code
- Video rendering completes without errors
- Output file is created and accessible

### Expected Output

```
[INFO] 重启服务...
[INFO] 提交任务: 生成一个泰勒公式的教学视频...
[SUCCESS] 任务已提交: task-XXXXXXXXXXXXX
[INFO] 等待结果...
..................................[SUCCESS] 任务完成!
[SUCCESS] 测试通过! ✅
  视频: /Users/leo/workspace/myagent/outputs/videos/task_XXX_video_1.mp4
  大小: 881K
```

### Duration

Expected runtime: 2-3 minutes (includes video generation)

### Troubleshooting

If test fails:
1. Check `/tmp/motia-e2e.log` for server logs
2. Verify `npm run dev` starts correctly
3. Check if port 3031 is available
4. Ensure `python_modules` environment is set up correctly
