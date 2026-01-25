/**
 * Unit tests for WebSearch Hook
 */

// Mock hook implementation for testing
class WebSearchHook {
  MIN_QUERY_LENGTH = 3;

  async preExec(context: any): Promise<any> {
    const query = context.inputData?.query || '';

    if (query.length < this.MIN_QUERY_LENGTH) {
      return {
        action: 'stop',
        reason: `Query too short (minimum ${this.MIN_QUERY_LENGTH} characters)`,
      };
    }

    return null;
  }

  async postExec(context: any, result: any): Promise<any> {
    if (result.success) {
      result.metadata = result.metadata || {};
      result.metadata.hook_processed = true;
    }

    return result;
  }

  async onProgressingNotify(context: any, progressData: any): Promise<any> {
    return {};
  }
}

describe('WebSearchHook', () => {
  let hook: WebSearchHook;

  beforeEach(() => {
    hook = new WebSearchHook();
  });

  describe('preExec', () => {
    it('should pass valid queries', async () => {
      const result = await hook.preExec({
        skillName: 'web-search',
        inputData: { query: 'valid search query' },
        taskId: 'test-123',
        sessionId: 'session-456',
        metadata: {},
        executionStartTime: Date.now(),
      });

      expect(result).toBeNull();
    });

    it('should stop execution for short queries', async () => {
      const result = await hook.preExec({
        skillName: 'web-search',
        inputData: { query: 'ab' }, // Only 2 chars
        taskId: 'test-123',
        sessionId: 'session-456',
        metadata: {},
        executionStartTime: Date.now(),
      });

      expect(result.action).toBe('stop');
      expect(result.reason).toContain('Query too short');
      expect(result.reason).toContain('minimum 3 characters');
    });

    it('should stop execution for empty query', async () => {
      const result = await hook.preExec({
        skillName: 'web-search',
        inputData: { query: '' },
        taskId: 'test-123',
        sessionId: 'session-456',
        metadata: {},
        executionStartTime: Date.now(),
      });

      expect(result.action).toBe('stop');
      expect(result.reason).toContain('Query too short');
    });

    it('should handle missing query field', async () => {
      const result = await hook.preExec({
        skillName: 'web-search',
        inputData: {},
        taskId: 'test-123',
        sessionId: 'session-456',
        metadata: {},
        executionStartTime: Date.now(),
      });

      expect(result.action).toBe('stop');
    });

    it('should allow exactly minimum length query', async () => {
      const result = await hook.preExec({
        skillName: 'web-search',
        inputData: { query: 'abc' }, // Exactly 3 chars
        taskId: 'test-123',
        sessionId: 'session-456',
        metadata: {},
        executionStartTime: Date.now(),
      });

      expect(result).toBeNull();
    });
  });

  describe('postExec', () => {
    it('should add hook_processed metadata on success', async () => {
      const result = await hook.postExec(
        {},
        { success: true, results: [1, 2, 3] }
      );

      expect(result.metadata).toEqual({ hook_processed: true });
      expect(result.success).toBe(true);
      expect(result.results).toEqual([1, 2, 3]);
    });

    it('should preserve existing metadata on success', async () => {
      const result = await hook.postExec(
        {},
        {
          success: true,
          results: [1, 2, 3],
          metadata: { existing: 'data' }
        }
      );

      expect(result.metadata).toEqual({
        existing: 'data',
        hook_processed: true
      });
    });

    it('should pass through failed results', async () => {
      const result = await hook.postExec(
        {},
        { success: false, error: 'Search failed' }
      );

      expect(result).toEqual({ success: false, error: 'Search failed' });
    });

    it('should not add metadata to failed results', async () => {
      const result = await hook.postExec(
        {},
        { success: false, error: 'Search failed' }
      );

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('onProgressingNotify', () => {
    it('should return empty dict', async () => {
      const result = await hook.onProgressingNotify(
        {},
        { message: 'Searching...' }
      );

      expect(result).toEqual({});
    });

    it('should handle progress data with message', async () => {
      const result = await hook.onProgressingNotify(
        { taskId: 'test-123' },
        { message: 'Processing results' }
      );

      expect(result).toEqual({});
    });

    it('should handle progress data without message', async () => {
      const result = await hook.onProgressingNotify(
        { taskId: 'test-123' },
        { step: 1 }
      );

      expect(result).toEqual({});
    });
  });
});
