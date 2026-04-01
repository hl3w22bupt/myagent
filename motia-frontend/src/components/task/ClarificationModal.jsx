import React, { useState, useRef } from 'react';
import { X, Info, Check, AlertCircle } from 'lucide-react';
import './ClarificationModal.css';

/**
 * ClarificationModal - 澄清回复模态框（优化版本）
 *
 * 基于 Swiss Modernism 2.0 + SaaS 配色方案
 * 优化点：
 * - 更清晰的视觉层次和间距
 * - 更好的交互反馈和动画
 * - 完整的可访问性支持
 * - 优雅的 loading 状态
 * - 使用 SVG 图标替代 emoji
 * - 添加验证错误提示
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
  const [validationError, setValidationError] = useState('');

  // Ref for focus trap (可访问性)
  const modalRef = useRef(null);
  const firstFocusableRef = useRef(null);
  const lastFocusableRef = useRef(null);

  // 重置状态 + focus trap
  React.useEffect(() => {
    if (open) {
      setSelectedOption(null);
      setTextInput('');
      setFeedback('');
      setIsSubmitting(false);
      setValidationError('');

      // 延迟聚焦到第一个可交互元素（等待动画完成）
      const timer = setTimeout(() => {
        if (firstFocusableRef.current) {
          firstFocusableRef.current.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [open]);

  // ESC 键关闭（可访问性）
  React.useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose, isSubmitting]);

  // 如果有选项，使用选项按钮；否则使用文本输入
  const hasOptions = options && options.length > 0;

  const handleSubmit = async () => {
    const decision = hasOptions ? selectedOption : textInput.trim();

    if (!decision) {
      // 显示验证错误提示
      setValidationError(hasOptions ? '请选择一个选项' : '请输入您的回复');
      return;
    }

    setValidationError('');
    setIsSubmitting(true);
    try {
      await onSubmit(decision, feedback.trim() || undefined);
      onClose();
    } catch (error) {
      console.error('Failed to submit clarification:', error);
      setIsSubmitting(false);
    }
  };

  const handleOptionClick = (option) => {
    setSelectedOption(option);
  };

  const handleKeyDown = (e) => {
    // Enter 键提交（可访问性）
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!open) return null;

  const canSubmit = hasOptions ? selectedOption : textInput.trim();

  return (
    <div
      className="clarification-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="clarification-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clarification-title"
      >
        {/* 模态框头部 */}
        <div className="clarification-modal-header">
          <h3 id="clarification-title" className="clarification-modal-title">
            需要澄清
          </h3>
          <button
            className="clarification-modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="关闭对话框"
            ref={firstFocusableRef}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* 模态框内容 */}
        <div className="clarification-modal-body">
          {/* 验证错误提示 */}
          {validationError && (
            <div className="clarification-modal-validation-error" role="alert">
              <AlertCircle size={16} strokeWidth={2} />
              <span>{validationError}</span>
            </div>
          )}

          <div className="clarification-modal-question">
            <div className="clarification-modal-question-header">
              <AlertCircle size={18} strokeWidth={2} className="question-icon" />
              <strong>问题：</strong>
            </div>
            <div className="clarification-modal-question-text">{question}</div>
          </div>

          {/* 选项按钮（如果有） */}
          {hasOptions && (
            <div className="clarification-modal-options">
              <div className="clarification-modal-options-label">请选择：</div>
              <div className="clarification-modal-options-grid" role="radiogroup">
                {options.map((option, index) => {
                  const isSelected = selectedOption === option;
                  return (
                    <button
                      key={index}
                      className={`clarification-option-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleOptionClick(option)}
                      disabled={isSubmitting}
                      aria-pressed={isSelected}
                      aria-label={`选项 ${index + 1}: ${option}`}
                    >
                      <span className="option-text">{option}</span>
                      {isSelected && (
                        <Check size={18} strokeWidth={2.5} className="option-check" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 文本输入（如果没有选项） */}
          {!hasOptions && (
            <div className="clarification-modal-input">
              <label
                htmlFor="clarification-textarea"
                className="clarification-modal-input-label"
              >
                您的回复：
              </label>
              <textarea
                id="clarification-textarea"
                className="clarification-modal-textarea"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="请输入您的回复..."
                rows={4}
                disabled={isSubmitting}
                ref={firstFocusableRef}
                aria-describedby="clarification-help"
              />
            </div>
          )}

          {/* 可选的补充反馈 */}
          <div className="clarification-modal-feedback">
            <label
              htmlFor="clarification-feedback"
              className="clarification-modal-feedback-label"
            >
              <Info size={14} strokeWidth={2} />
              <span>补充说明（可选）</span>
            </label>
            <textarea
              id="clarification-feedback"
              className="clarification-modal-feedback-textarea"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="您可以提供更多背景信息..."
              rows={2}
              disabled={isSubmitting}
              aria-describedby="clarification-help"
            />
            <div id="clarification-help" className="sr-only">
              提供更多详细信息可以帮助我更好地理解您的需求
            </div>
          </div>
        </div>

        {/* 模态框底部 */}
        <div className="clarification-modal-footer">
          <button
            className="clarification-modal-btn clarification-modal-btn-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            ref={lastFocusableRef}
          >
            取消
          </button>
          <button
            className={`clarification-modal-btn clarification-modal-btn-submit ${isSubmitting ? 'loading' : ''}`}
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            aria-label={isSubmitting ? '提交中...' : '提交回复'}
          >
            {isSubmitting ? '提交中...' : '提交回复'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClarificationModal;
