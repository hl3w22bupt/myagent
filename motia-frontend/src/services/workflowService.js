/**
 * Workflow Service
 *
 * Handles API calls for workflow operations
 */

const API_BASE = 'http://localhost:3000';

/**
 * Get all workflows
 */
export async function getWorkflows() {
  try {
    const response = await fetch(`${API_BASE}/api/workflows`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      return data.workflows;
    } else {
      throw new Error(data.message || 'Failed to fetch workflows');
    }
  } catch (error) {
    console.error('Error fetching workflows:', error);
    throw error;
  }
}

/**
 * Get workflow details by name
 */
export async function getWorkflowDetail(workflowName) {
  try {
    const response = await fetch(`${API_BASE}/api/workflows/${encodeURIComponent(workflowName)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      return data.workflow;
    } else {
      throw new Error(data.message || 'Failed to fetch workflow details');
    }
  } catch (error) {
    console.error('Error fetching workflow detail:', error);
    throw error;
  }
}

/**
 * Get step count from workflow detail
 */
export function getStepCount(workflow) {
  return workflow.step_count || workflow.steps?.length || 0;
}
