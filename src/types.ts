export interface Plan {
  task: string;
  slug: string;
  workflow: string;
  phase: string;
  status: string;
  priority: string;
  created: string;
  updated: string;
  sub_tasks: SubTask[];
  progress: Progress;
  parent_plan?: ParentPlan;
  type?: string;
  parent_task?: string;
}

export interface SubTask {
  description: string;
  slug: string;
  priority: string;
  status: string;
  type?: string;
  plan_file?: string;
  created: string;
}

export interface ParentPlan {
  file: string;
  task: string;
  slug: string;
}

export interface Progress {
  scope_analysis: StageProgress;
  context_gathering: StageProgress;
  solution_design: SolutionDesignProgress;
  implementation: ImplementationProgress;
  validation: ValidationProgress;
  documentation: DocumentationProgress;
  knowledge_capture: StageProgress;
}

export interface StageProgress {
  complete: boolean;
  findings?: Record<string, any>;
  results?: Record<string, any>;
  learnings?: Record<string, any>;
}

export interface SolutionDesignProgress extends StageProgress {
  artifacts?: Record<string, any>;
  checklist?: ChecklistItem[];
}

export interface ImplementationProgress extends StageProgress {
  changes?: any[];
}

export interface ValidationProgress extends StageProgress {
  validation_status?: 'passed' | 'failed' | 'awaiting_fixes' | 'in_progress';
  issues_found?: string[];
  fix_cycles?: FixCycle[];
}

export interface FixCycle {
  cycle: number;
  subplan_file: string;
  issues: string[];
  created: string;
  status: 'active' | 'completed' | 'failed';
  resolved: boolean;
}

export interface DocumentationProgress extends StageProgress {
  files?: string[];
}

export interface ChecklistItem {
  task: string;
  complete: boolean;
}

export type WorkflowType = 'micro' | 'small' | 'medium' | 'large' | 'epic';
export type PriorityType = 'high' | 'medium' | 'low';
export type StatusType = 'active' | 'pending' | 'completed' | 'failed' | 'promoted' | 'independent';
export type StageType = 'scope_analysis' | 'context_gathering' | 'solution_design' | 'implementation' | 'validation' | 'documentation' | 'knowledge_capture';

export const VALID_STAGES: StageType[] = [
  'scope_analysis',
  'context_gathering',
  'solution_design',
  'implementation',
  'validation',
  'documentation',
  'knowledge_capture'
];

export const STAGE_ORDER: Record<StageType, number> = {
  scope_analysis: 0,
  context_gathering: 1,
  solution_design: 2,
  implementation: 3,
  validation: 4,
  documentation: 5,
  knowledge_capture: 6
};