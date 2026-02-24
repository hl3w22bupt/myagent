import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useMotiaStream } from '@motiadev/stream-client-react';

/**
 * PTC Code Tab Component
 *
 * Displays PTC (Programmatic Tool Calling) generated code for a task.
 * Shows all rounds of code generation with selected skills and reasoning.
 */
export default function PtcCodeTab({ taskId }) {
  const [ptcCodes, setPtcCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(null);
  const [error, setError] = useState(null);

  const { stream } = useMotiaStream();

  // 初始获取
  useEffect(() => {
    const fetchPtcCodes = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use relative URL to go through Vite proxy
        const response = await fetch(`/api/tasks/${taskId}/ptc-code`);
        const data = await response.json();

        if (data.success) {
          setPtcCodes(data.data || []);
          if (data.data && data.data.length > 0) {
            // Default to the latest round
            setSelectedRound(data.data[data.data.length - 1].round);
          }
        } else {
          setError(data.message || 'Failed to fetch PTC codes');
        }
      } catch (err) {
        console.error('Failed to fetch PTC codes:', err);
        setError('Network error while fetching PTC codes');
      } finally {
        setLoading(false);
      }
    };

    fetchPtcCodes();
  }, [taskId]);

  // 订阅 PTC 代码更新
  useEffect(() => {
    if (!stream || !taskId) return;

    let subscription = null;

    try {
      // 订阅 taskExecution stream
      subscription = stream.subscribeGroup('taskExecution', taskId);

      subscription.addChangeListener((data) => {
        console.log('[PtcCodeTab] Received task execution update:', data);

        // 重新获取完整的 PTC codes
        fetch(`/api/tasks/${taskId}/ptc-code`)
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              setPtcCodes(result.data || []);
              if (result.data && result.data.length > 0) {
                setSelectedRound(result.data[result.data.length - 1].round);
              }
            }
          })
          .catch(err => console.error('[PtcCodeTab] Failed to refresh PTC codes:', err));
      });

      console.log('[PtcCodeTab] Subscribed to task execution updates');
    } catch (error) {
      console.error('[PtcCodeTab] Failed to subscribe:', error);
    }

    return () => {
      if (subscription) {
        subscription.close();
        console.log('[PtcCodeTab] Unsubscribed from task execution updates');
      }
    };
  }, [stream, taskId]);

  if (loading) {
    return (
      <div className="tab-loading-state">
        <div className="spinner"></div>
        <span>Loading PTC codes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tab-error-state">
        <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{error}</span>
      </div>
    );
  }

  if (ptcCodes.length === 0) {
    return (
      <div className="tab-empty-state">
        <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>No PTC code records found for this task</span>
      </div>
    );
  }

  const selectedCode = ptcCodes.find(c => c.round === selectedRound);

  return (
    <div className="ptc-code-tab">
      {/* Round selector */}
      <div className="round-selector">
        {ptcCodes.map(record => (
          <button
            key={record.round}
            className={`round-button ${selectedRound === record.round ? 'active' : ''}`}
            onClick={() => setSelectedRound(record.round)}
          >
            Round {record.round}
            {record.selectedSkills && record.selectedSkills.length > 0 && (
              <span className="skill-count">
                {record.selectedSkills.length} skill{record.selectedSkills.length !== 1 ? 's' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Code display */}
      {selectedCode && (
        <div className="code-display">
          <div className="code-header">
            <h3>Round {selectedCode.round}</h3>
            <div className="code-meta">
              {selectedCode.selectedSkills && selectedCode.selectedSkills.length > 0 && (
                <span className="skills">
                  Skills: {selectedCode.selectedSkills.join(', ')}
                </span>
              )}
              <span className="timestamp">
                {new Date(selectedCode.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
          {selectedCode.reasoning && (
            <div className="reasoning">
              <strong>Reasoning:</strong> {selectedCode.reasoning}
            </div>
          )}
          <div className="code-content">
            <SyntaxHighlighter
              language="python"
              style={vscDarkPlus}
              showLineNumbers={true}
              customStyle={{ fontSize: '13px', lineHeight: '1.6' }}
            >
              {selectedCode.code}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
}
