import { Plan, WorkflowType, PriorityType, StatusType, StageType } from './types.js';
import { WorkflowManager } from './workflows.js';

export interface PlanOptions {
  workflow?: WorkflowType;
  priority?: PriorityType;
  status?: StatusType;
  type?: 'plan' | 'subtask';
  initialPhase?: StageType;
  baseDir?: string;
}

// Create appropriate progress structure for a stage
export function createStageProgress(stage: string): any {
  // Known stage structures
  switch (stage) {
    case 'scope_analysis':
      return {
        complete: false,
        findings: {}
      };
    case 'context_gathering':
      return {
        complete: false,
        findings: {}
      };
    case 'solution_design':
      return {
        complete: false,
        artifacts: {},
        checklist: []
      };
    case 'implementation':
      return {
        complete: false,
        changes: []
      };
    case 'validation':
      return {
        complete: false,
        results: {},
        validation_status: 'in_progress',
        issues_found: [],
        fix_cycles: []
      };
    case 'documentation':
      return {
        complete: false,
        files: []
      };
    case 'knowledge_capture':
      return {
        complete: false,
        learnings: {}
      };
    default:
      // For custom stages, provide a generic structure
      return {
        complete: false,
        data: {},
        notes: []
      };
  }
}

export async function generatePlan(
  taskDescription: string,
  taskSlug: string,
  options: PlanOptions = {}
): Promise<Plan> {
  const type = options.type || 'plan';
  const defaultStatus = type === 'subtask' ? 'pending' : 'active';
  const workflow = options.workflow || (type === 'subtask' ? 'medium' : 'medium');
  
  // Get the workflow steps
  const baseDir = options.baseDir || '.';
  const workflowManager = new WorkflowManager(baseDir);
  const steps = await workflowManager.getWorkflowSteps(workflow);
  
  // Get the initial phase from workflow if not specified
  const initialPhase = options.initialPhase || steps[0] || 'scope_analysis';

  // Build progress object based on workflow steps
  const progress: any = {};
  
  for (const step of steps) {
    progress[step] = createStageProgress(step);
  }

  return {
    task: taskDescription,
    slug: taskSlug,
    workflow: workflow,
    phase: initialPhase,
    status: options.status || defaultStatus,
    priority: options.priority || 'medium',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    sub_tasks: [],
    progress: progress
  };
}

export function generateSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .slice(0, 50);
}