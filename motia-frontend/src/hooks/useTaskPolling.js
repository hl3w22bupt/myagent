import { useState, useEffect, useCallback } from 'react';
import { tasksAPI } from '../services/api';

/**
 * useTaskPolling - 轮询任务状态和 HITL 状态
 *
 * 同时轮询 /api/tasks/:id 和 /api/contexts/:id
 * 返回任务信息和 HITL 状态
 *
 * @param {string} taskId - 任务 ID
 * @param {number} interval - 轮询间隔（毫秒），默认 2000ms
 * @returns {object} { task, hitlState, isLoading, error, refresh }
 */
export const useTaskPolling = (taskId, interval = 2000) => {
  const [task, setTask] = useState(null);
  const [hitlState, setHITLState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 获取任务信息
  const fetchTask = useCallback(async () => {
    if (!taskId) return null;

    try {
      const response = await tasksAPI.getTaskDetails(taskId);
      return response;
    } catch (err) {
      console.error('[useTaskPolling] Failed to fetch task:', err);
      throw err;
    }
  }, [taskId]);

  // 获取 HITL 状态（从 TaskContext）
  const fetchHITLState = useCallback(async () => {
    if (!taskId) return null;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/contexts/${taskId}`);
      if (!response.ok) {
        console.error('[useTaskPolling] API response not OK:', response.status);
        return null;
      }
      const result = await response.json();
      console.log('[useTaskPolling] HITL API response:', result);
      const hitlState = result.data?.hitlState || null;
      console.log('[useTaskPolling] Extracted HITL state:', hitlState);
      return hitlState;
    } catch (err) {
      console.error('[useTaskPolling] Failed to fetch HITL state:', err);
      return null;
    }
  }, [taskId]);

  // 刷新数据
  const refresh = useCallback(async () => {
    if (!taskId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [taskData, hitlData] = await Promise.all([
        fetchTask(),
        fetchHITLState(),
      ]);

      setTask(taskData);
      setHITLState(hitlData);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, fetchTask, fetchHITLState]);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [taskId]);

  // 轮询逻辑
  useEffect(() => {
    if (!taskId) return;

    const pollTimer = setInterval(() => {
      refresh();
    }, interval);

    return () => clearInterval(pollTimer);
  }, [taskId, interval, refresh]);

  return {
    task,
    hitlState,
    isLoading,
    error,
    refresh,
  };
};
