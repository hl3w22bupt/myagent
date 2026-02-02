import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function createTask(options: {
  task: string;
  sessionId?: string;
}): Promise<{ id: string }> {
  const response = await axios.post(`${API_BASE_URL}/agent/execute`, {
    task: options.task,
    sessionId: options.sessionId || `test-${Date.now()}`,
  });

  return response.data;
}

export async function sendChatMessage(taskId: string, options: {
  message: string;
  sessionId: string;
}): Promise<void> {
  await axios.post(`${API_BASE_URL}/api/tasks/${taskId}/chat`, {
    message: options.message,
    sessionId: options.sessionId,
  });
}

export async function getTaskResult(taskId: string): Promise<any> {
  const response = await axios.get(`${API_BASE_URL}/agent/result`, {
    params: { id: taskId },
  });

  return response.data.result;
}

export async function getContext(taskId: string): Promise<any> {
  const response = await axios.get(`${API_BASE_URL}/api/context/${taskId}`);
  return response.data;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
