import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { StageType } from './types.js';

export interface WorkflowDefinition {
  description: string;
  steps: StageType[];
}

export interface WorkflowsConfig {
  workflows: Record<string, WorkflowDefinition>;
  default: WorkflowDefinition;
}

export class WorkflowManager {
  private workflowsFile: string;
  private workflows: WorkflowsConfig | null = null;

  constructor(baseDir: string = '.') {
    this.workflowsFile = `${baseDir}/.llms/workflows.yml`;
  }

  async loadWorkflows(): Promise<WorkflowsConfig> {
    // Always reload for testing - in production this could be cached
    // if (this.workflows) {
    //   return this.workflows;
    // }

    try {
      const content = await fs.readFile(this.workflowsFile, 'utf-8');
      this.workflows = yaml.load(content) as WorkflowsConfig;
      return this.workflows;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Return default workflows if file doesn't exist
        return this.getDefaultWorkflows();
      }
      throw new Error(`Error loading workflows file: ${error.message}`);
    }
  }

  async createWorkflowsFile(force: boolean = false): Promise<void> {
    try {
      await fs.access(this.workflowsFile);
      if (!force) {
        throw new Error(`Workflows file already exists at ${this.workflowsFile}. Use force: true to overwrite.`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT' && !force) {
        throw error;
      }
    }

    // Ensure .llms directory exists with retry logic
    const llmsDir = path.dirname(this.workflowsFile);
    try {
      await fs.mkdir(llmsDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        // If it's not "already exists", try one more time
        await fs.mkdir(llmsDir, { recursive: true });
      }
    }

    const workflows = this.getDefaultWorkflows();
    await fs.writeFile(this.workflowsFile, yaml.dump(workflows));
  }

  async getWorkflowSteps(workflowType: string): Promise<StageType[]> {
    const workflows = await this.loadWorkflows();
    
    if (workflows.workflows[workflowType]) {
      return workflows.workflows[workflowType].steps;
    }
    
    // Return default workflow steps if type not found
    return workflows.default.steps;
  }

  async getNextSteps(workflowType: string, currentPhase: StageType, completed: boolean = false): Promise<{
    currentStep: StageType;
    nextStep: StageType | null;
    remainingSteps: StageType[];
    isComplete: boolean;
  }> {
    const steps = await this.getWorkflowSteps(workflowType);
    const currentIndex = steps.indexOf(currentPhase);
    
    if (currentIndex === -1) {
      // Current phase not in workflow, start from beginning
      return {
        currentStep: steps[0],
        nextStep: steps.length > 1 ? steps[1] : null,
        remainingSteps: steps.slice(1),
        isComplete: false
      };
    }

    const nextIndex = completed ? currentIndex + 1 : currentIndex;
    const isComplete = nextIndex >= steps.length;
    
    return {
      currentStep: currentPhase,
      nextStep: completed && nextIndex < steps.length ? steps[nextIndex] : (!completed && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null),
      remainingSteps: completed ? steps.slice(nextIndex + 1) : steps.slice(currentIndex + 1),
      isComplete
    };
  }

  async validateWorkflowStep(workflowType: string, step: StageType): Promise<boolean> {
    const steps = await this.getWorkflowSteps(workflowType);
    return steps.includes(step);
  }

  private getDefaultWorkflows(): WorkflowsConfig {
    return {
      workflows: {
        micro: {
          description: 'Very small tasks that require minimal analysis and implementation',
          steps: ['implementation'] as StageType[]
        },
        small: {
          description: 'Small tasks requiring basic design and implementation',
          steps: ['scope_analysis', 'context_gathering', 'implementation', 'validation'] as StageType[]
        },
        medium: {
          description: 'Medium-sized tasks requiring full analysis and design',
          steps: ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation'] as StageType[]
        },
        large: {
          description: 'Large tasks requiring comprehensive analysis, design, and documentation',
          steps: ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation', 'knowledge_capture'] as StageType[]
        },
        epic: {
          description: 'Complex tasks requiring full workflow with extensive documentation',
          steps: ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation', 'knowledge_capture'] as StageType[]
        }
      },
      default: {
        description: 'Default workflow for unspecified workflow types',
        steps: ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation'] as StageType[]
      }
    };
  }
}