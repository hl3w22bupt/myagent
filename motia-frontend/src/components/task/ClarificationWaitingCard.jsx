import React from 'react';
import { HelpCircle, Bot, Clock, CheckCircle } from 'lucide-react';
import './ClarificationWaitingCard.css';

/**
 * ClarificationWaitingCard - HITL 状态卡片
 *
 * 显示在任务进度流中，展示 HITL 澄清的状态：
 * - awaiting: 等待用户回复（橙色，可点击回复）
 * - completed (human): 用户已回复（绿色，只读）
 * - completed (timeout): 超时自动继续（灰色，只读）
 *
 * Props:
 * - agentName: 请求澄清的 Agent 名称
 * - question: 澄清问题（用于预览）
 * - status: HITL 状态 ('awaiting' | 'completed')
 * - resolvedBy: 解决方式 ('human' | 'timeout')
 * - onExpand: 点击展开时的回调函数
 */
const ClarificationWaitingCard = ({ agentName, question, status = 'awaiting', resolvedBy, onExpand }) => {
  console.log('[ClarificationWaitingCard] Rendered with:', { agentName, question, status, resolvedBy })

  // 截取问题预览（最多 50 个字符）
  const questionPreview = (question || '').length > 50
    ? `${question.substring(0, 50)}...`
    : (question || '');

  // 根据状态确定样式和内容
  const isCompleted = status === 'completed';
  const isTimeout = resolvedBy === 'timeout';

  const title = isCompleted
    ? (isTimeout ? '超时自动继续' : '已收到澄清回复')
    : '等待澄清回复';

  const Icon = isCompleted
    ? (isTimeout ? Clock : CheckCircle)
    : HelpCircle;

  return (
    <div className={`clarification-waiting-card ${isCompleted ? (isTimeout ? 'clarification-card--timeout' : 'clarification-card--resolved') : ''}`}>
      <div className="clarification-card-header">
        <div className={`clarification-card-icon ${isCompleted ? (isTimeout ? 'icon-timeout' : 'icon-resolved') : ''}`}>
          <Icon size={32} strokeWidth={1.5} />
        </div>
        <div className="clarification-card-content">
          <div className={`clarification-card-title ${isCompleted ? (isTimeout ? 'title-timeout' : 'title-resolved') : ''}`}>
            {title}
          </div>
          <div className="clarification-card-agent">
            <Bot size={14} strokeWidth={2} />
            <span>{agentName}</span>
          </div>
          <div className="clarification-card-question">{questionPreview}</div>
        </div>
        {!isCompleted && (
          <button
            className="clarification-card-expand-btn"
            onClick={onExpand}
          >
            回复澄清 →
          </button>
        )}
      </div>
    </div>
  );
};

export default ClarificationWaitingCard;
