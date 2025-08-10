import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { generatePlan, generateSlug } from './plan-template.js';
import { PlanUpdater } from './plan-updater.js';
import { Plan, SubTask, WorkflowType, PriorityType, StatusType, StageType } from './types.js';
import { WorkflowManager } from './workflows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PlanServer {
  private server: Server;
  private workflowManager: WorkflowManager;

  constructor() {
    this.workflowManager = new WorkflowManager('.');
    this.server = new Server(
      {
        name: 'mcp-plan-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {
            listChanged: false
          },
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_plan',
          description: 'Create a new development plan for a task',
          inputSchema: {
            type: 'object',
            properties: {
              taskDescription: {
                type: 'string',
                description: 'The task description'
              },
              workflow: {
                type: 'string',
                enum: ['micro', 'small', 'medium', 'large', 'epic'],
                description: 'Workflow type'
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Task priority',
                default: 'medium'
              },
              status: {
                type: 'string',
                enum: ['active', 'pending'],
                description: 'Initial status',
                default: 'active'
              }
            },
            required: ['taskDescription', 'workflow']
          }
        },
        {
          name: 'create_subtask_plan',
          description: 'Create an independent subtask plan',
          inputSchema: {
            type: 'object',
            properties: {
              subtaskDescription: {
                type: 'string',
                description: 'The subtask description'
              },
              workflow: {
                type: 'string',
                enum: ['micro', 'small', 'medium', 'large', 'epic'],
                description: 'Workflow type'
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Priority',
                default: 'medium'
              },
              status: {
                type: 'string',
                enum: ['active', 'pending'],
                description: 'Initial status',
                default: 'active'
              }
            },
            required: ['subtaskDescription', 'workflow']
          }
        },
        {
          name: 'update_plan',
          description: 'Update a development plan stage',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file'
              },
              stage: {
                type: 'string',
                description: 'The stage to update to (can be a standard stage or custom stage defined in workflows.yml)'
              },
              sectionData: {
                type: 'object',
                description: 'Optional data to merge into the stage section'
              },
              force: {
                type: 'boolean',
                description: 'Force update even if validation fails',
                default: false
              },
              incomplete: {
                type: 'boolean',
                description: 'Do not mark the stage as complete',
                default: false
              }
            },
            required: ['planFile', 'stage']
          }
        },
        {
          name: 'read_plan',
          description: 'Read a development plan file',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file'
              }
            },
            required: ['planFile']
          }
        },
        {
          name: 'list_plans',
          description: 'List all development plans in the .llms directory',
          inputSchema: {
            type: 'object',
            properties: {
              includeSubtasks: {
                type: 'boolean',
                description: 'Include subtask plans in the listing',
                default: true
              }
            }
          }
        },
        {
          name: 'promote_subtask',
          description: 'Promote a subtask to an independent plan',
          inputSchema: {
            type: 'object',
            properties: {
              subtaskSlug: {
                type: 'string',
                description: 'The slug of the subtask to promote'
              },
              workflow: {
                type: 'string',
                enum: ['micro', 'small', 'medium', 'large', 'epic'],
                description: 'Workflow type for the promoted subtask'
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Priority',
                default: 'medium'
              }
            },
            required: ['subtaskSlug', 'workflow']
          }
        },
        {
          name: 'get_workflow_next_steps',
          description: 'Get the next steps for a plan based on its workflow',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file'
              }
            },
            required: ['planFile']
          }
        },
        {
          name: 'create_workflows_file',
          description: 'Create or update the workflows.yml file',
          inputSchema: {
            type: 'object',
            properties: {
              force: {
                type: 'boolean',
                description: 'Force overwrite existing file',
                default: false
              }
            }
          }
        },
        {
          name: 'list_workflows',
          description: 'List all available workflows and their steps',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'init_agent_system',
          description: 'Initialize .llms directory with default agent prompts',
          inputSchema: {
            type: 'object',
            properties: {
              force: {
                type: 'boolean',
                description: 'Force overwrite existing prompts',
                default: false
              }
            }
          }
        },
        {
          name: 'execute_next_phase',
          description: 'Get orchestrator prompt for next phase in plan workflow',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file',
                default: '.llms/.dev-plan-main.yaml'
              },
              phase: {
                type: 'string',
                description: 'Specific phase to execute (optional - auto-determines if not provided)'
              }
            }
          }
        },
        {
          name: 'update_checklist_item',
          description: 'Update a specific checklist item in a plan stage',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file'
              },
              stage: {
                type: 'string',
                description: 'The stage containing the checklist'
              },
              taskPattern: {
                type: 'string',
                description: 'Pattern to match the task description (supports partial matches)'
              },
              complete: {
                type: 'boolean',
                description: 'Whether to mark the task as complete',
                default: true
              },
              newTask: {
                type: 'string',
                description: 'Optional new task description (for updating task text)'
              }
            },
            required: ['planFile', 'stage', 'taskPattern']
          }
        },
        {
          name: 'add_checklist_item',
          description: 'Add a new item to a stage checklist',
          inputSchema: {
            type: 'object',
            properties: {
              planFile: {
                type: 'string',
                description: 'Path to the plan file'
              },
              stage: {
                type: 'string',
                description: 'The stage to add the checklist item to'
              },
              task: {
                type: 'string',
                description: 'The task description'
              },
              complete: {
                type: 'boolean',
                description: 'Whether the task is already complete',
                default: false
              },
              insertAt: {
                type: 'number',
                description: 'Position to insert at (0-based index, defaults to end)'
              }
            },
            required: ['planFile', 'stage', 'task']
          }
        },
      ],
    }));

    // Setup prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const agentTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
      
      return {
        prompts: agentTypes.map(agentType => ({
          name: agentType,
          title: `${agentType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Agent`,
          description: `Orchestrator guidance for ${agentType.replace('-', ' ')} phase`,
          arguments: [
            {
              name: 'planFile',
              description: 'Path to the plan file to inject context',
              required: false
            },
            {
              name: 'customContext', 
              description: 'Additional context to include',
              required: false
            }
          ]
        }))
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      const { planFile, customContext } = args;

      // Validate prompt name
      const validAgentTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
      if (!validAgentTypes.includes(name)) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
      }

      try {
        // Check for user override first (.llms/prompts/[agent-type].md)
        let promptContent: string;
        const userOverridePath = path.join('.llms', 'prompts', `${name}.md`);
        
        try {
          promptContent = await fs.readFile(userOverridePath, 'utf-8');
        } catch {
          // Fall back to built-in prompt
          const builtinPath = path.join(__dirname, 'prompts', `${name}.md`);
          promptContent = await fs.readFile(builtinPath, 'utf-8');
        }

        // Inject plan context if provided
        if (planFile) {
          try {
            const planContent = await fs.readFile(planFile, 'utf-8');
            const plan = yaml.load(planContent) as Plan;
            promptContent += `\n\n## Current Plan Context\n**Task:** ${plan.task}\n**Phase:** ${plan.phase}\n**Status:** ${plan.status}`;
          } catch (error: any) {
            // Don't fail if plan can't be loaded, just skip context injection
            console.error(`Warning: Could not load plan context: ${error.message}`);
          }
        }

        // Add custom context if provided
        if (customContext) {
          promptContent += `\n\n## Additional Context\n${customContext}`;
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptContent
              }
            }
          ]
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `Error loading prompt: ${error.message}`);
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'create_plan':
          return await this.createPlan(args);
        case 'create_subtask_plan':
          return await this.createSubtaskPlan(args);
        case 'update_plan':
          return await this.updatePlan(args);
        case 'read_plan':
          return await this.readPlan(args);
        case 'list_plans':
          return await this.listPlans(args);
        case 'promote_subtask':
          return await this.promoteSubtask(args);
        case 'get_workflow_next_steps':
          return await this.getWorkflowNextSteps(args);
        case 'create_workflows_file':
          return await this.createWorkflowsFile(args);
        case 'list_workflows':
          return await this.listWorkflows(args);
        case 'init_agent_system':
          return await this.initAgentSystem(args);
        case 'execute_next_phase':
          return await this.executeNextPhase(args);
        case 'update_checklist_item':
          return await this.updateChecklistItem(args);
        case 'add_checklist_item':
          return await this.addChecklistItem(args);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  private async createPlan(args: any) {
    const { taskDescription, workflow, priority, status } = args;
    
    // Ensure .llms directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const planFile = path.join('.llms', '.dev-plan-main.yaml');
    
    // Check if main plan already exists
    try {
      await fs.access(planFile);
      return {
        content: [{
          type: 'text',
          text: `❌ Main plan file already exists: ${planFile}\nUse 'create_subtask_plan' to add tasks to existing plan`
        }]
      };
    } catch {}

    // Generate plan
    const taskSlug = generateSlug(taskDescription);
    const plan = await generatePlan(taskDescription, taskSlug, {
      workflow: workflow as WorkflowType,
      priority: priority as PriorityType,
      status: status as StatusType
    });

    // Write plan file
    await fs.writeFile(planFile, yaml.dump(plan));

    return {
      content: [{
        type: 'text',
        text: `✅ Main development plan created successfully!
📁 Plan file: ${planFile}
📝 Task: ${taskDescription}
🏷️  Slug: ${taskSlug}
🛠️  Workflow: ${plan.workflow}
📅 Priority: ${plan.priority}
🔄 Status: ${plan.status}
🎯 Phase: ${plan.phase}`
      }]
    };
  }

  private async createSubtaskPlan(args: any) {
    const { subtaskDescription, workflow, priority, status } = args;
    
    const mainPlanFile = path.join('.llms', '.dev-plan-main.yaml');
    
    // Check if main plan exists
    try {
      await fs.access(mainPlanFile);
    } catch {
      return {
        content: [{
          type: 'text',
          text: `❌ Main plan file not found: ${mainPlanFile}\nCreate a main plan first with 'create_plan'`
        }]
      };
    }

    // Load main plan
    const mainPlanContent = await fs.readFile(mainPlanFile, 'utf-8');
    const mainPlan = yaml.load(mainPlanContent) as Plan;

    // Create subtask directory
    const mainPlanBasename = path.basename(mainPlanFile, '.yaml');
    const subtasksDir = path.join('.llms', mainPlanBasename, 'subtasks');
    await fs.mkdir(subtasksDir, { recursive: true });

    // Generate subtask plan
    const subtaskSlug = generateSlug(subtaskDescription);
    const subtaskPlanFile = path.join(subtasksDir, `.dev-plan-${subtaskSlug}.yaml`);

    // Check if subtask already exists
    try {
      await fs.access(subtaskPlanFile);
      return {
        content: [{
          type: 'text',
          text: `❌ Subtask plan already exists: ${subtaskPlanFile}`
        }]
      };
    } catch {}

    // Create subtask plan
    const subtaskPlan = await generatePlan(subtaskDescription, subtaskSlug, {
      workflow: workflow as WorkflowType,
      priority: priority as PriorityType,
      status: status as StatusType,
      type: 'subtask'
    });

    // Add parent plan reference
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    // Write subtask plan
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Update main plan with subtask reference
    mainPlan.sub_tasks = mainPlan.sub_tasks || [];
    mainPlan.sub_tasks.push({
      description: subtaskDescription,
      slug: subtaskSlug,
      priority: priority || 'medium',
      status: 'independent',
      type: 'independent_plan',
      plan_file: subtaskPlanFile,
      created: new Date().toISOString()
    });
    mainPlan.updated = new Date().toISOString();

    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    return {
      content: [{
        type: 'text',
        text: `✅ Independent subtask plan created!
📁 Subtask plan: ${subtaskPlanFile}
📝 Subtask: ${subtaskDescription}
🛠️  Workflow: ${workflow}
📅 Priority: ${priority || 'medium'}
🔄 Status: ${status || 'active'}`
      }]
    };
  }

  private async updatePlan(args: any) {
    const { planFile, stage, sectionData, force, incomplete } = args;

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage(stage as StageType, {
      force: force || false,
      markComplete: !incomplete,
      sectionData: sectionData || {}
    });

    if (result.success) {
      let response = `✅ Plan updated successfully!
📁 Plan file: ${planFile}
🎯 Updated to stage: ${result.stage}
📅 Updated at: ${result.updatedAt}`;

      if (sectionData && Object.keys(sectionData).length > 0) {
        response += `\n📝 Section data updated:\n${JSON.stringify(sectionData, null, 2)}`;
      }

      if (result.warnings && result.warnings.length > 0) {
        response += `\n\n⚠️  Warnings:\n${result.warnings.map(w => `  - ${w}`).join('\n')}`;
      }

      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to update plan: ${result.error}${!force ? '\n💡 Use force: true to override validation' : ''}`
        }]
      };
    }
  }

  private async readPlan(args: any) {
    const { planFile } = args;

    try {
      // Resolve plan file relative to current working directory (project root)
      const resolvedPlanFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
      const content = await fs.readFile(resolvedPlanFile, 'utf-8');
      const plan = yaml.load(content) as Plan;

      return {
        content: [{
          type: 'text',
          text: yaml.dump(plan, { lineWidth: -1, noRefs: true })
        }]
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidRequest, `Plan file not found: ${planFile}`);
      }
      throw new McpError(ErrorCode.InternalError, `Error reading plan: ${error.message}`);
    }
  }

  private async listPlans(args: any) {
    const { includeSubtasks = true } = args;

    try {
      await fs.access('.llms');
    } catch {
      return {
        content: [{
          type: 'text',
          text: 'No .llms directory found. Create a plan first with create_plan.'
        }]
      };
    }

    const plans: Array<{ file: string; plan: Plan }> = [];

    // Find main plan
    const mainPlanFile = path.join('.llms', '.dev-plan-main.yaml');
    try {
      const content = await fs.readFile(mainPlanFile, 'utf-8');
      const plan = yaml.load(content) as Plan;
      plans.push({ file: mainPlanFile, plan });

      // Find subtask plans if requested
      if (includeSubtasks) {
        const mainPlanBasename = path.basename(mainPlanFile, '.yaml');
        const subtasksDir = path.join('.llms', mainPlanBasename, 'subtasks');
        
        try {
          const files = await fs.readdir(subtasksDir);
          for (const file of files) {
            if (file.endsWith('.yaml')) {
              const subtaskFile = path.join(subtasksDir, file);
              const subtaskContent = await fs.readFile(subtaskFile, 'utf-8');
              const subtaskPlan = yaml.load(subtaskContent) as Plan;
              plans.push({ file: subtaskFile, plan: subtaskPlan });
            }
          }
        } catch {}
      }
    } catch {}

    if (plans.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No plans found in .llms directory.'
        }]
      };
    }

    let response = `Found ${plans.length} plan(s):\n\n`;
    
    for (const { file, plan } of plans) {
      response += `📁 ${file}
📝 Task: ${plan.task}
🏷️  Slug: ${plan.slug}
🛠️  Workflow: ${plan.workflow}
📅 Priority: ${plan.priority}
🔄 Status: ${plan.status}
🎯 Phase: ${plan.phase}
${plan.type === 'subtask' ? `👆 Parent: ${plan.parent_task}\n` : ''}
---\n`;
    }

    return {
      content: [{
        type: 'text',
        text: response.trim()
      }]
    };
  }

  private async promoteSubtask(args: any) {
    const { subtaskSlug, workflow, priority } = args;
    
    const mainPlanFile = path.join('.llms', '.dev-plan-main.yaml');
    
    // Load main plan
    let mainPlan: Plan;
    try {
      const content = await fs.readFile(mainPlanFile, 'utf-8');
      mainPlan = yaml.load(content) as Plan;
    } catch {
      return {
        content: [{
          type: 'text',
          text: `❌ Main plan file not found: ${mainPlanFile}`
        }]
      };
    }

    // Find subtask
    const subtask = mainPlan.sub_tasks?.find(st => st.slug === subtaskSlug);
    if (!subtask) {
      return {
        content: [{
          type: 'text',
          text: `❌ Subtask with slug '${subtaskSlug}' not found in main plan`
        }]
      };
    }

    // Create subtask plan file
    const mainPlanBasename = path.basename(mainPlanFile, '.yaml');
    const subtasksDir = path.join('.llms', mainPlanBasename, 'subtasks');
    await fs.mkdir(subtasksDir, { recursive: true });
    
    const subtaskPlanFile = path.join(subtasksDir, `.dev-plan-${subtaskSlug}.yaml`);

    // Check if already exists
    try {
      await fs.access(subtaskPlanFile);
      return {
        content: [{
          type: 'text',
          text: `❌ Subtask plan already exists: ${subtaskPlanFile}`
        }]
      };
    } catch {}

    // Create subtask plan
    const subtaskPlan = await generatePlan(subtask.description, subtask.slug, {
      workflow: workflow as WorkflowType,
      priority: (priority || subtask.priority) as PriorityType,
      type: 'subtask'
    });

    // Add parent reference
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    // Write subtask plan
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Update main plan
    subtask.type = 'independent_plan';
    subtask.plan_file = subtaskPlanFile;
    subtask.status = 'promoted';
    mainPlan.updated = new Date().toISOString();

    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    return {
      content: [{
        type: 'text',
        text: `✅ Subtask promoted to independent plan!
📁 Subtask plan: ${subtaskPlanFile}
📝 Subtask: ${subtask.description}
🛠️  Workflow: ${workflow}
📅 Priority: ${priority || subtask.priority}`
      }]
    };
  }

  private async getWorkflowNextSteps(args: any) {
    const { planFile } = args;

    try {
      // Resolve plan file relative to current working directory (project root)
      const resolvedPlanFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
      const content = await fs.readFile(resolvedPlanFile, 'utf-8');
      const plan = yaml.load(content) as Plan;
      
      const currentPhase = plan.phase as StageType;
      const isCurrentComplete = plan.progress[currentPhase]?.complete || false;
      
      const nextSteps = await this.workflowManager.getNextSteps(
        plan.workflow,
        currentPhase,
        isCurrentComplete
      );

      let response = `📋 Plan: ${plan.task}
🛠️  Workflow: ${plan.workflow}
🎯 Current Phase: ${nextSteps.currentStep}${isCurrentComplete ? ' ✅' : ' 🔄'}

`;

      if (nextSteps.isComplete) {
        response += '🎉 All workflow steps are complete!';
      } else if (nextSteps.nextStep) {
        response += `➡️  Next Step: ${nextSteps.nextStep}`;
        
        if (nextSteps.remainingSteps.length > 0) {
          response += `\n📝 Remaining Steps: ${nextSteps.remainingSteps.join(' → ')}`;
        }
      }

      // Show all workflow steps
      const allSteps = await this.workflowManager.getWorkflowSteps(plan.workflow);
      response += `\n\n📊 Full Workflow (${plan.workflow}):\n`;
      allSteps.forEach((step, index) => {
        const isComplete = plan.progress[step]?.complete || false;
        const isCurrent = step === currentPhase;
        response += `${index + 1}. ${step}${isComplete ? ' ✅' : ''}${isCurrent ? ' ← current' : ''}\n`;
      });

      return {
        content: [{
          type: 'text',
          text: response.trim()
        }]
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidRequest, `Plan file not found: ${planFile}`);
      }
      throw new McpError(ErrorCode.InternalError, `Error reading plan: ${error.message}`);
    }
  }

  private async createWorkflowsFile(args: any) {
    const { force = false } = args;

    try {
      await this.workflowManager.createWorkflowsFile(force);
      const workflows = await this.workflowManager.loadWorkflows();

      let response = `✅ Created workflows configuration at .llms/workflows.yml

🎯 Available workflow types:`;

      for (const [workflowType, config] of Object.entries(workflows.workflows)) {
        response += `\n  ${workflowType.padEnd(8)} - ${config.steps.join(' → ')}`;
      }

      response += `\n\n💡 You can now customize the workflow steps for each type by editing .llms/workflows.yml`;

      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InvalidRequest, error.message);
    }
  }

  private async listWorkflows(args: any) {
    try {
      const workflows = await this.workflowManager.loadWorkflows();
      
      let response = `📋 Available Workflows:\n\n`;

      for (const [workflowType, config] of Object.entries(workflows.workflows)) {
        response += `🛠️  ${workflowType}\n`;
        response += `   ${config.description}\n`;
        response += `   Steps: ${config.steps.join(' → ')}\n\n`;
      }

      response += `📌 Default Workflow:\n`;
      response += `   ${workflows.default.description}\n`;
      response += `   Steps: ${workflows.default.steps.join(' → ')}`;

      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Error loading workflows: ${error.message}`);
    }
  }


  private async initAgentSystem(args: any) {
    const { force = false } = args;

    try {
      // Create .llms/prompts directory
      const promptsDir = path.join('.llms', 'prompts');
      await fs.mkdir(promptsDir, { recursive: true });

      const agentTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
      const created = [];
      const skipped = [];

      for (const agentType of agentTypes) {
        const userPromptPath = path.join(promptsDir, `${agentType}.md`);
        const builtinPath = path.join(__dirname, 'prompts', `${agentType}.md`);

        // Check if user prompt already exists
        const exists = await fs.access(userPromptPath).then(() => true).catch(() => false);
        
        if (exists && !force) {
          skipped.push(agentType);
          continue;
        }

        // Copy built-in prompt to user directory
        const builtinContent = await fs.readFile(builtinPath, 'utf-8');
        await fs.writeFile(userPromptPath, builtinContent);
        created.push(agentType);
      }

      let response = '✅ Agent system initialized!\n\n';
      
      if (created.length > 0) {
        response += `📝 Created prompts:\n${created.map(a => `  - .llms/prompts/${a}.md`).join('\n')}\n\n`;
      }
      
      if (skipped.length > 0) {
        response += `⏭️  Skipped existing:\n${skipped.map(a => `  - .llms/prompts/${a}.md`).join('\n')}\n\n`;
        response += '💡 Use force: true to overwrite existing prompts\n\n';
      }

      response += '🎯 You can now customize these prompts for your specific needs!';

      return {
        content: [{
          type: 'text',
          text: response
        }]
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Error initializing agent system: ${error.message}`);
    }
  }

  private async executeNextPhase(args: any) {
    const { planFile = '.llms/.dev-plan-main.yaml', phase } = args;

    try {
      // Resolve plan file relative to current working directory (project root)
      const resolvedPlanFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
      
      // Read current plan
      const planContent = await fs.readFile(resolvedPlanFile, 'utf-8');
      
      const plan = yaml.load(planContent) as Plan;

      // Determine which phase to execute
      let targetPhase: string;
      if (phase) {
        targetPhase = phase;
      } else {
        // Auto-determine next phase
        const nextSteps = await this.workflowManager.getNextSteps(
          plan.workflow,
          plan.phase as StageType,
          plan.progress[plan.phase as StageType]?.complete || false
        );
        
        if (nextSteps.isComplete) {
          return {
            content: [{
              type: 'text',
              text: '🎉 Plan is already complete! All workflow phases have been finished.\n\nUse `list_plans` to see the final state or create a new plan for additional work.'
            }]
          };
        }
        
        targetPhase = nextSteps.nextStep || plan.phase;
      }

      // Map phase to agent type (for .claude/agents)
      const phaseToAgent: Record<string, string> = {
        'scope_analysis': 'plan-mcp-scope-analysis',
        'context_gathering': 'plan-mcp-context-gathering', 
        'solution_design': 'plan-mcp-solution-design',
        'implementation': 'plan-mcp-implementation',
        'validation': 'plan-mcp-validation',
        'documentation': 'plan-mcp-documentation',
        'knowledge_capture': 'plan-mcp-knowledge-capture'
      };

      // Map phase to prompt name (for .llms/prompts)
      const phaseToPrompt: Record<string, string> = {
        'scope_analysis': 'scope-analyst',
        'context_gathering': 'context-gatherer',
        'solution_design': 'solution-designer',
        'implementation': 'implementer',
        'validation': 'validator',
        'documentation': 'documenter',
        'knowledge_capture': 'knowledge-capturer'
      };

      const agentType = phaseToAgent[targetPhase] || 'plan-mcp-scope-analysis';
      const promptType = phaseToPrompt[targetPhase] || 'scope-analyst';

      // Get the orchestrator prompt for this phase
      let promptContent: string;
      const userOverridePath = path.join('.llms', 'prompts', `${promptType}.md`);
      
      try {
        promptContent = await fs.readFile(userOverridePath, 'utf-8');
      } catch {
        // Fall back to built-in prompt - handle both src and dist directories
        const srcDir = __dirname.includes('dist') ? path.join(__dirname, '..', 'src') : __dirname;
        const builtinPath = path.join(srcDir, 'prompts', `${promptType}.md`);
        promptContent = await fs.readFile(builtinPath, 'utf-8');
      }

      // Inject plan context
      promptContent += `\n\n## Current Plan Context\n**Task:** ${plan.task}\n**Phase:** ${plan.phase}\n**Status:** ${plan.status}`;
      
      // Add execution context
      promptContent += `\n\n## Additional Context\nReady to execute ${targetPhase} phase. The sub-agent file is available at .claude/agents/${agentType}.md for autonomous execution.`;

      // Add execution guidance
      const executionGuidance = `

## Execution Options

**Manual Guidance**: Use the prompt above to guide your work through this phase.

**Autonomous Execution**: Use Claude Code's Task tool to spawn the ${agentType}:

\`\`\`typescript
Task({
  subagent_type: "general-purpose",
  description: "Execute ${targetPhase} phase for plan",
  prompt: "Load the ${agentType} from .claude/agents/${agentType}.md and execute it for the plan at ${planFile}. Follow all the agent's instructions and update the plan using MCP tools."
});
\`\`\`

**Current Plan Status**:
- **Task**: ${plan.task}
- **Current Phase**: ${plan.phase}
- **Target Phase**: ${targetPhase}
- **Workflow**: ${plan.workflow}
- **Status**: ${plan.status}
`;

      return {
        content: [{
          type: 'text',
          text: promptContent + executionGuidance
        }]
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          content: [{
            type: 'text',
            text: `❌ Plan file not found: ${planFile}\n\nCreate a plan first using \`create_plan\` tool.`
          }]
        };
      }
      throw new McpError(ErrorCode.InternalError, `Error executing next phase: ${error.message}`);
    }
  }

  private async updateChecklistItem(args: any) {
    const { planFile, stage, taskPattern, complete = true, newTask } = args;

    try {
      // Resolve plan file relative to current working directory (project root)
      const resolvedPlanFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
      const content = await fs.readFile(resolvedPlanFile, 'utf-8');
      const plan = yaml.load(content) as Plan;

      // Check if stage exists in plan
      if (!plan.progress[stage as StageType]) {
        return {
          content: [{
            type: 'text',
            text: `❌ Stage '${stage}' not found in plan progress`
          }]
        };
      }

      const stageProgress = (plan.progress as any)[stage];
      
      // Check if checklist exists
      if (!stageProgress.checklist || !Array.isArray(stageProgress.checklist)) {
        return {
          content: [{
            type: 'text',
            text: `❌ No checklist found for stage '${stage}'`
          }]
        };
      }

      // Find matching task(s)
      const matchingItems = stageProgress.checklist.filter((item: any) => 
        item.task && item.task.toLowerCase().includes(taskPattern.toLowerCase())
      );

      if (matchingItems.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ No checklist items found matching pattern: '${taskPattern}'`
          }]
        };
      }

      // Update matching items
      let updatedCount = 0;
      stageProgress.checklist = stageProgress.checklist.map((item: any) => {
        if (item.task && item.task.toLowerCase().includes(taskPattern.toLowerCase())) {
          const updatedItem = { ...item };
          updatedItem.complete = complete;
          if (newTask) {
            updatedItem.task = newTask;
          }
          updatedCount++;
          return updatedItem;
        }
        return item;
      });

      // Update plan timestamp
      plan.updated = new Date().toISOString();

      // Save updated plan
      const yamlContent = yaml.dump(plan, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      });
      await fs.writeFile(resolvedPlanFile, yamlContent, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `✅ Updated ${updatedCount} checklist item(s) in stage '${stage}'
📁 Plan file: ${planFile}
🎯 Pattern: ${taskPattern}
✔️  Marked as: ${complete ? 'complete' : 'incomplete'}${newTask ? `\n📝 Updated task text: ${newTask}` : ''}
📅 Updated at: ${plan.updated}`
        }]
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidRequest, `Plan file not found: ${planFile}`);
      }
      throw new McpError(ErrorCode.InternalError, `Error updating checklist item: ${error.message}`);
    }
  }

  private async addChecklistItem(args: any) {
    const { planFile, stage, task, complete = false, insertAt } = args;

    try {
      // Resolve plan file relative to current working directory (project root)
      const resolvedPlanFile = path.isAbsolute(planFile) ? planFile : path.resolve(process.cwd(), planFile);
      const content = await fs.readFile(resolvedPlanFile, 'utf-8');
      const plan = yaml.load(content) as Plan;

      // Check if stage exists in plan
      if (!plan.progress[stage as StageType]) {
        return {
          content: [{
            type: 'text',
            text: `❌ Stage '${stage}' not found in plan progress`
          }]
        };
      }

      const stageProgress = (plan.progress as any)[stage];

      // Initialize checklist if it doesn't exist
      if (!stageProgress.checklist) {
        stageProgress.checklist = [];
      } else if (!Array.isArray(stageProgress.checklist)) {
        return {
          content: [{
            type: 'text',
            text: `❌ Checklist for stage '${stage}' is not an array`
          }]
        };
      }

      // Create new checklist item
      const newItem = { task, complete };

      // Add item at specified position or end
      if (insertAt !== undefined && insertAt >= 0) {
        stageProgress.checklist.splice(insertAt, 0, newItem);
      } else {
        stageProgress.checklist.push(newItem);
      }

      // Update plan timestamp
      plan.updated = new Date().toISOString();

      // Save updated plan
      const yamlContent = yaml.dump(plan, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      });
      await fs.writeFile(resolvedPlanFile, yamlContent, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `✅ Added new checklist item to stage '${stage}'
📁 Plan file: ${planFile}
📝 Task: ${task}
✔️  Status: ${complete ? 'complete' : 'incomplete'}${insertAt !== undefined ? `\n📍 Position: ${insertAt}` : '\n📍 Position: end'}
📅 Updated at: ${plan.updated}`
        }]
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidRequest, `Plan file not found: ${planFile}`);
      }
      throw new McpError(ErrorCode.InternalError, `Error adding checklist item: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Plan Server running on stdio');
  }
}

// Export the PlanServer class for testing
export { PlanServer };

// Only run the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PlanServer();
  server.run().catch(console.error);
}