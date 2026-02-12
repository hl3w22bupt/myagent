# Bug Fix: favoriteArtifacts.get is not a function

## 错误信息

```
TaskDetail.jsx:2486 Uncaught (in promise) TypeError: favoriteArtifacts.get is not a function
    at handleRemoveFromFavorites (TaskDetail.jsx:2486:42)
    at onClick (TaskDetail.jsx:1268:34)
```

## 根本原因

### 问题定位

**文件**: `motia-frontend/src/pages/TaskDetail.jsx`

**错误行**: 第 2517-2521 行

```javascript
// ❌ 错误代码
const favorites = await favoritesAPI.getFavorites({ taskId: task?.taskId })

// 建立 artifactId -> favoriteId 映射
const favoriteMap = new Map()
favorites.forEach(fav => {  // ← favorites 不是数组！
  if (fav.artifactId) {
    favoriteMap.set(fav.artifactId, fav.id)
  }
})
```

### 问题分析

1. **后端 API 返回结构** (`steps/api/favorites-api.step.ts:220-228`):
   ```javascript
   return {
     status: 200,
     body: {
       success: true,
       favorites: [...],  // ← 数组嵌套在 favorites 字段中
       total: ...,
       page: ...,
       totalPages: ...,
     },
   };
   ```

2. **前端期望的结构**:
   ```javascript
   const favorites = await favoritesAPI.getFavorites({ taskId: task?.taskId })
   favorites.forEach(...)  // ← 期望 favorites 是数组
   ```

3. **实际结构**:
   ```javascript
   favorites = {
     favorites: [...],  // ← 实际是一个对象
     total: 10,
     page: 1
   }
   favorites.forEach() // ❌ TypeError: favorites.forEach is not a function
   ```

## 解决方案

### 修改代码

**文件**: `motia-frontend/src/pages/TaskDetail.jsx`

**修改位置**: 第 2511-2531 行

```javascript
// ✅ 修复后的代码
const checkFavoritesStatus = async (artifacts) => {
  if (!artifacts || artifacts.length === 0) return

  try {
    // 获取当前任务的所有精选
    const response = await favoritesAPI.getFavorites({ taskId: task?.taskId })

    // API 返回 { favorites: [...], total, ... } 结构
    const favorites = response.favorites || []  // ← 修复：提取 favorites 数组

    // 建立 artifactId -> favoriteId 映射
    const favoriteMap = new Map()
    favorites.forEach(fav => {
      if (fav.artifactId) {
        favoriteMap.set(fav.artifactId, fav.id)
      }
    })

    setFavoriteArtifacts(favoriteMap)
  } catch (error) {
    console.error('检查收藏状态失败:', error)
  }
}
```

## 验证步骤

1. **重新构建前端**
   ```bash
   cd motia-frontend
   npm run build
   ```

2. **重启前端开发服务器**（如果在运行）
   ```bash
   # Ctrl+C 停止，然后重新运行
   npm run dev
   ```

3. **测试功能**
   - 打开任务详情页
   - 点击 "添加到精选" 按钮
   - 刷新页面，确认收藏状态正确显示
   - 点击 "从精选移除" 按钮
   - 确认不再报错

## 影响范围

- ✅ 只修改了前端代码，不影响后端
- ✅ 不影响其他功能
- ✅ 向后兼容（如果 API 返回格式改变，使用 `|| []` 提供默认值）

## 相关文件

- `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx` - 前端修复（已完成）
- `/Users/leo/workspace/myagent/steps/api/favorites-api.step.ts` - 后端 API（无需修改）
- `/Users/leo/workspace/myagent/motia-frontend/src/services/api.js` - API 客户端（无需修改）

## 技术细节

### API 响应结构

**GET /api/favorites?taskId=xxx** 返回:

```javascript
{
  "success": true,
  "favorites": [
    {
      "id": "favorite-123",
      "artifactId": "artifact-456",
      "artifactType": "video",
      "taskId": "task-789",
      "createdAt": "2026-02-10T12:00:00Z",
      // ...
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 12,
  "totalPages": 1
}
```

### 正确的访问方式

```javascript
// ✅ 正确
const response = await favoritesAPI.getFavorites({ taskId: task?.taskId })
const favorites = response.favorites  // ← 提取 favorites 数组
favorites.forEach(fav => { ... })

// ❌ 错误
const favorites = await favoritesAPI.getFavorites({ taskId: task?.taskId })
favorites.forEach(fav => { ... })  // ← favorites 是对象，不是数组
```

## 预防措施

为了避免类似的 API 数据结构问题，建议：

1. **统一 API 响应格式**
   - 明确定义所有 API 的响应结构
   - 在文档中说明返回的数据格式

2. **TypeScript 类型定义**
   ```typescript
   interface GetFavoritesResponse {
     success: boolean;
     favorites: Favorite[];
     total: number;
     page: number;
     limit: number;
     totalPages: number;
   }
   ```

3. **添加运行时检查**
   ```javascript
   const response = await favoritesAPI.getFavorites({ taskId: task?.taskId })
   const favorites = Array.isArray(response) ? response : (response.favorites || [])
   ```

## 修复完成时间

2026-02-10 12:45 UTC

## 测试状态

✅ 代码已修改
⏳ 等待用户测试确认
