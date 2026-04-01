import React from 'react';
import { HelpCircle, Bot } from 'lucide-react';
import './ClarificationWaitingCard.css';

/**
 * ClarificationWaitingCard - 等待澄清回复的折叠卡片
 *
 * 显示在任务进度流中，提示用户有澄清请求待处理
 *
 * Props:
 * - agentName: 请求澄清的 Agent 名称
 * - question: 澄清问题（用于预览）
 * - onExpand: 点击展开时的回调函数
 */
const ClarificationWaitingCard = ({ agentName, question, onExpand }) => {
  // 调试日志
  console.log('[ClarificationWaitingCard] Rendered with:', { agentName, question })

  // 截取问题预览（最多 50 个字符）
  const questionPreview = question.length > 50
    ? `${question.substring(0, 50)}...`
    : question;

  return (
    <div className="clarification-waiting-card">
      <div className="clarification-card-header">
        <div className="clarification-card-icon">
          <HelpCircle size={32} strokeWidth={1.5} />
        </div>
        <div className="clarification-card-content">
          <div className="clarification-card-title">等待澄清回复</div>
          <div className="clarification-card-agent">
            <Bot size={14} strokeWidth={2} />
            <span>{agentName}</span>
          </div>
          <div className="clarification-card-question">{questionPreview}</div>
        </div>
        <button
          className="clarification-card-expand-btn"
          onClick={onExpand}
        >
          回复澄清 →
        </button>
      </div>
    </div>
  );
};

export default ClarificationWaitingCard;
