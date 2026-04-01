import React, { useState } from 'react';
import './ClarificationModal.css';

/**
 * ClarificationModal - 澄清回复模态框
 *
 * 自适应 UI：
 * - 如果有 options → 显示可点击的选项按钮
 * - 如果没有 options → 显示文本输入框
 *
 * Props:
 * - open: 是否打开模态框
 * - onClose: 关闭模态框的回调
 * - question: 澄清问题
 * - options: 可选的选项列表（如果有）
 * - onSubmit: 提交澄清结果的回调函数 (decision, feedback?) => Promise<void>
 */
const ClarificationModal = ({ open, onClose, question, options, onSubmit }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 重置状态
  React.useEffect(() => {
    if (open) {
      setSelectedOption(null);
      setTextInput('');
      setFeedback('');
      setIsSubmitting(false);
    }
  }, [open]);

  // 如果有选项，使用选项按钮；否则使用文本输入
  const hasOptions = options && options.length > 0;

  const handleSubmit = async () => {
    const decision = hasOptions ? selectedOption : textInput;

    if (!decision) {
      alert('请选择或输入您的回复');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(decision, feedback || undefined);
      onClose();
    } catch (error) {
      console.error('Failed to submit clarification:', error);
      alert('提交失败，请重试');
      setIsSubmitting(false);
    }
  };

  const handleOptionClick = (option) => {
    setSelectedOption(option);
  };

  if (!open) return null;

  return (
    <div className="clarification-modal-overlay" onClick={onClose}>
      <div className="clarification-modal" onClick={(e) => e.stopPropagation()}>
        {/* 模态框头部 */}
        <div className="clarification-modal-header">
          <h3 className="clarification-modal-title">需要澄清</h3>
          <button className="clarification-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 模态框内容 */}
        <div className="clarification-modal-body">
          <div className="clarification-modal-question">
            <strong>问题：</strong>{question}
          </div>

          {/* 选项按钮（如果有） */}
          {hasOptions && (
            <div className="clarification-modal-options">
              <div className="clarification-modal-options-label">请选择：</div>
              <div className="clarification-modal-options-grid">
                {options.map((option, index) => (
                  <button
                    key={index}
                    className={`clarification-option-btn ${selectedOption === option ? 'selected' : ''}`}
                    onClick={() => handleOptionClick(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 文本输入（如果没有选项） */}
          {!hasOptions && (
            <div className="clarification-modal-input">
              <label className="clarification-modal-input-label">您的回复：</label>
              <textarea
                className="clarification-modal-textarea"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="请输入您的回复..."
                rows={4}
              />
            </div>
          )}

          {/* 可选的补充反馈 */}
          <div className="clarification-modal-feedback">
            <label className="clarification-modal-feedback-label">
              补充说明（可选）：
            </label>
            <textarea
              className="clarification-modal-feedback-textarea"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="您可以提供更多背景信息..."
              rows={2}
            />
          </div>
        </div>

        {/* 模态框底部 */}
        <div className="clarification-modal-footer">
          <button
            className="clarification-modal-btn clarification-modal-btn-cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            className="clarification-modal-btn clarification-modal-btn-submit"
            onClick={handleSubmit}
            disabled={isSubmitting || (!hasOptions && !textInput) || (hasOptions && !selectedOption)}
          >
            {isSubmitting ? '提交中...' : '提交回复'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClarificationModal;
