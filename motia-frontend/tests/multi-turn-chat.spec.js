import { test, expect } from '@playwright/test';

test('测试多轮对话功能', async ({ page }) => {
  // 访问任务列表页面
  await page.goto('http://localhost:5174/tasks');

  // 点击创建任务按钮
  await page.click('text=创建任务');

  // 输入任务内容
  await page.fill('input[placeholder="请输入任务内容..."]', '1 加 1 等于多少');

  // 点击提交按钮
  await page.click('text=提交任务');

  // 等待任务完成
  await page.waitForSelector('text=任务执行成功');

  // 点击任务详情链接
  await page.click('text=任务详情');

  // 等待任务详情页面加载
  await page.waitForSelector('text=任务信息');

  // 输入聊天消息
  await page.fill('input[placeholder="输入问题或指令..."]', '再加 1 呢？');

  // 点击发送按钮
  await page.click('button[title="发送消息"]');

  // 等待聊天回复
  await page.waitForSelector('text=3');

  // 验证回复内容
  const reply = await page.innerText('text=3');
  expect(reply).toBe('3');
});
