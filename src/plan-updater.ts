import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Plan, StageType, VALID_STAGES, STAGE_ORDER } from './types.js';
import { createStageProgress } from './plan-template.js';

export interface UpdateOptions {
  force?: boolean;
  markComplete?: boolean;
  sectionData?: Record<string, any>;
}

export interface UpdateResult {
  success: boolean;
  stage?: StageType;
  updatedAt?: string;
  warnings?: string[];
  error?: string;
}

export class PlanUpdater {
  private planFile: string;
  private plan: Plan | null = null;
  private warnings: string[] = [];

  constructor(planFile: string) {
    // Resolve plan file relative to current working directory (project root)
    this.planFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
  }

  async updateStage(targetStage: StageType, options: UpdateOptions = {}): Promise<UpdateResult> {
    const opts = {
      force: false,
      markComplete: true,
      ...options
    };

    try {
      await this.loadPlan();
      await this.validateStage(targetStage, opts.force);
      await this.updatePlanStructure(targetStage, opts);
      await this.savePlan();

      return {
        success: true,
        stage: targetStage,
        updatedAt: this.plan!.updated,
        warnings: this.warnings.length > 0 ? this.warnings : undefined
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async loadPlan(): Promise<void> {
    try {
      const content = await fs.readFile(this.planFile, 'utf-8');
      const data = yaml.load(content) as any;
      
      if (typeof data !== 'object' || data === null) {
        throw new Error(`Invalid plan file format: expected object, got ${typeof data}`);
      }

      this.plan = data as Plan;
      
      // Ensure required fields exist
      this.plan.progress = this.plan.progress || {} as any;
      this.plan.phase = this.plan.phase || 'scope_analysis';
      
      // Don't initialize all stages - only those in the workflow will exist
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Plan file not found: ${this.planFile}`);
      }
      throw new Error(`Error loading plan file: ${error.message}`);
    }
  }

  private async validateStage(targetStage: StageType, force: boolean = false): Promise<void> {
    // Check if it's a known stage or a custom stage
    const isKnownStage = VALID_STAGES.includes(targetStage);
    if (!isKnownStage && !force) {
      this.warnings.push(`Custom stage detected: ${targetStage}. This stage is not in the standard workflow stages.`);
    }

    const currentStage = this.plan!.phase as StageType;
    const currentStageIndex = STAGE_ORDER[currentStage];
    const targetStageIndex = STAGE_ORDER[targetStage];

    // If either stage is custom (not in STAGE_ORDER), skip ordering validation
    if (currentStageIndex === undefined || targetStageIndex === undefined) {
      if (!isKnownStage) {
        this.warnings.push(`Cannot validate stage order for custom stage: ${targetStage}`);
      }
      return;
    }

    // Allow moving to same stage or next stage
    if (targetStageIndex < currentStageIndex) {
      this.warnings.push(`Moving backwards from ${currentStage} to ${targetStage}`);
    } else if (targetStageIndex > currentStageIndex + 1) {
      // Check if all intermediate stages are complete
      const missingStages: string[] = [];
      for (let i = currentStageIndex; i < targetStageIndex; i++) {
        const stage = VALID_STAGES[i];
        // Only check stages that exist in the plan's progress
        if (this.plan!.progress[stage] && !this.isStageComplete(stage)) {
          missingStages.push(stage);
        }
      }

      if (missingStages.length > 0) {
        if (force) {
          this.warnings.push(`Forcing jump to ${targetStage} (skipping: ${missingStages.join(', ')})`);
        } else {
          throw new Error(`Cannot jump to ${targetStage}. Missing stages: ${missingStages.join(', ')}. Use --force to override.`);
        }
      } else {
        this.warnings.push(`Jumping from ${currentStage} to ${targetStage} (intermediate stages complete)`);
      }
    }

    // Validate plan status
    if (this.plan!.status === 'completed') {
      this.warnings.push('Plan is already marked as completed');
    } else if (this.plan!.status === 'failed') {
      this.warnings.push('Plan is marked as failed - updating anyway');
    }
  }

  private async updatePlanStructure(targetStage: StageType, options: UpdateOptions): Promise<void> {
    const currentStage = this.plan!.phase as StageType;
    const currentStageIndex = STAGE_ORDER[currentStage];
    const targetStageIndex = STAGE_ORDER[targetStage];

    // Mark all previous stages as complete if moving forward (only for known stages)
    if (currentStageIndex !== undefined && targetStageIndex !== undefined && 
        targetStageIndex > currentStageIndex) {
      for (let i = 0; i < targetStageIndex; i++) {
        const stage = VALID_STAGES[i];
        // Only update stages that exist in the plan's progress
        if (this.plan!.progress[stage]) {
          (this.plan!.progress[stage] as any).complete = true;
        }
      }
    }

    // Update current stage
    this.plan!.phase = targetStage;
    
    // Update stage section data if provided
    if (options.sectionData) {
      this.updateStageSection(targetStage, options.sectionData);
    }
    
    // Mark target stage as complete if requested
    if (options.markComplete) {
      (this.plan!.progress[targetStage] as any).complete = true;
    }

    // Update status if all stages are complete
    if (this.allStagesComplete()) {
      this.plan!.status = 'completed';
      this.warnings.push('All stages complete - marking plan as completed');
    } else if (this.plan!.status === 'completed') {
      // If we're updating a completed plan, change status back to active
      this.plan!.status = 'active';
      this.warnings.push('Plan status changed from completed to active');
    }

    // Update timestamp
    this.plan!.updated = new Date().toISOString();
  }

  private updateStageSection(stage: StageType | string, sectionData: Record<string, any>): void {
    // Ensure the stage progress section exists with appropriate structure
    if (!this.plan!.progress[stage as StageType]) {
      (this.plan!.progress as any)[stage] = createStageProgress(stage);
    }
    
    // Update the section with provided data, merging where appropriate
    for (const [key, value] of Object.entries(sectionData)) {
      const stageProgress = (this.plan!.progress as any)[stage];
      if (typeof stageProgress[key] === 'object' && 
          stageProgress[key] !== null && 
          typeof value === 'object' && 
          value !== null &&
          !Array.isArray(stageProgress[key]) &&
          !Array.isArray(value)) {
        // Merge objects
        stageProgress[key] = { ...stageProgress[key], ...value };
      } else {
        // Replace non-object values
        stageProgress[key] = value;
      }
    }
  }

  private async savePlan(): Promise<void> {
    // Validate plan structure before saving
    this.validatePlanStructure();
    
    // Generate YAML content
    const yamlContent = yaml.dump(this.plan, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    
    // Test that the generated YAML is valid by parsing it
    try {
      yaml.load(yamlContent);
    } catch (error: any) {
      throw new Error(`Generated YAML is invalid: ${error.message}`);
    }
    
    await fs.writeFile(this.planFile, yamlContent, 'utf-8');
  }

  private validatePlanStructure(): void {
    const requiredFields = ['task', 'slug', 'workflow', 'phase', 'status', 'created', 'updated'];
    for (const field of requiredFields) {
      if (!(field in this.plan!)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate progress structure - allow custom stages
    if (this.plan!.progress) {
      for (const [stage, data] of Object.entries(this.plan!.progress)) {
        if (typeof data !== 'object' || data === null || !('complete' in data)) {
          throw new Error(`Invalid progress structure for stage ${stage}: missing 'complete' field`);
        }
      }
    }
  }

  private isStageComplete(stage: StageType): boolean {
    return (this.plan!.progress[stage] as any)?.complete === true;
  }

  private allStagesComplete(): boolean {
    // Only check stages that exist in the plan's progress
    return Object.keys(this.plan!.progress).every(stage => 
      this.isStageComplete(stage as StageType)
    );
  }
}