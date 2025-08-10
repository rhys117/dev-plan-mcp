# MCP Plan Server

An MCP (Model Context Protocol) server for managing development plans with AI agent orchestration. This server provides structured workflow management for development tasks with built-in AI agent integration.

## Quick Start

### 1. Build the Server

```bash
cd mcp-plan-server
npm install
npm run build
```

### 2. Initialize Your Project

Run the initialization in your project directory:

```bash
# From your project root
npm run init
# Or if using the built CLI:
node /path/to/mcp-plan-server/dist/cli.js init
```

This creates:
- `.llms/prompts/` - Customizable orchestrator prompts
- `.claude/agents/` - Autonomous sub-agent definitions
- `.claude/commands/` - Claude Code slash commands
- `.llms/workflows.yml` - Workflow configuration

### 3. Start the MCP Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### 4. Configure Claude Code MCP

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "plan-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-plan-server/dist/index.js"]
    }
  }
}
```

## Usage

### Slash Commands (Recommended)

```bash
# Create and execute plans
/plan "Implement user authentication" medium
/execute-plan
/execute-full-plan

# Use orchestrator prompts
/prompt scope-analyst
/prompt implementer --planFile=".llms/.dev-plan-main.yaml"
```

### MCP Tools

```javascript
// Create main plan
create_plan({
  taskDescription: "Implement user authentication",
  workflow: "medium",
  priority: "high"
})

// Update plan progress
update_plan({
  planFile: ".llms/.dev-plan-main.yaml",
  stage: "implementation",
  sectionData: { changes: ["Added auth middleware"] }
})

// Create subtask
create_subtask_plan({
  subtaskDescription: "Add JWT token validation",
  workflow: "small",
  priority: "high"
})

// List all plans
list_plans({ includeSubtasks: true })

// Get next steps
get_workflow_next_steps({ planFile: ".llms/.dev-plan-main.yaml" })
```

### Sub-Agents

```javascript
// Spawn autonomous execution
Task({
  subagent_type: "general-purpose",
  description: "Execute implementation phase",
  prompt: "Load plan-mcp-implementation agent and execute it for .llms/.dev-plan-main.yaml"
})
```

## Architecture

The MCP Plan Server operates on a dual-layer approach:

**Orchestrator Layer** (`.llms/prompts/`):
- Manual guidance prompts for Claude Code
- Interactive workflow management
- Customizable phase-specific instructions

**Agent Layer** (`.claude/agents/`):
- Autonomous execution agents
- Complete workflow implementations
- Spawn via Task tool for hands-off operation

### Workflow Stages

| Stage | Purpose | Output |
|-------|---------|--------|
| **scope_analysis** | Classify complexity, decompose tasks | findings{} |
| **context_gathering** | Explore codebase, find patterns | findings{} |
| **solution_design** | Create technical architecture | artifacts{}, checklist[] |
| **implementation** | Write actual code | changes[] |
| **validation** | Test and verify requirements | results{} |
| **documentation** | Create user documentation | files[] |
| **knowledge_capture** | Extract learnings and insights | learnings{} |

### Customization

- **Prompts**: Edit `.llms/prompts/*.md` for personalized guidance
- **Workflows**: Modify `.llms/workflows.yml` for custom stages  
- **Sub-Agents**: Customize `.claude/agents/*.md` for autonomous behavior

## Workflow Types

- **micro**: Single file, trivial changes (scope_analysis → implementation → validation)
- **small**: 2-3 files, straightforward (+ context_gathering)  
- **medium**: Multiple files, moderate complexity (+ solution_design + documentation)
- **large**: Many files, significant changes (+ knowledge_capture)
- **epic**: Major feature requiring decomposition (all stages)

## File Structure

```
Your Project/
├── .llms/
│   ├── .dev-plan-main.yaml          # Main plan
│   ├── workflows.yml                # Workflow configuration
│   ├── prompts/                     # Orchestrator prompts
│   └── .dev-plan-main/
│       └── subtasks/
│           ├── .dev-plan-auth.yaml  # Subtask plans
│           └── .dev-plan-api.yaml
└── .claude/
    ├── agents/                      # AI agents
    │   ├── plan-mcp-scope-analysis.md
    │   ├── plan-mcp-implementation.md
    │   └── ...
    └── commands/                    # Slash commands
        ├── plan.md
        ├── execute-plan.md
        └── ...
```

## Available Tools

### Core Tools

- `create_plan` - Create a new main development plan
- `create_subtask_plan` - Create an independent subtask plan
- `update_plan` - Update a development plan stage
- `read_plan` - Read a development plan file
- `list_plans` - List all development plans
- `promote_subtask` - Promote a subtask to independent plan
- `get_workflow_next_steps` - Get next steps for a plan
- `create_workflows_file` - Create or update workflows.yml
- `list_workflows` - List all available workflows

### Custom Workflows

Customize workflows in `.llms/workflows.yml`:

```yaml
workflows:
  # Built-in workflows
  micro:
    description: "Single file, trivial changes"
    steps: [scope_analysis, implementation, validation]
  
  # Custom workflows
  api_development:
    description: "API-focused development"
    steps: [api_design, schema_validation, implementation, testing, documentation]

default:
  description: "Minimal workflow for quick tasks"
  steps: [scope_analysis, implementation]
```

## Features

- **🎯 Workflow-driven**: Plans automatically configure stages based on task complexity
- **🔧 Customizable**: Define custom workflows and stages for your specific needs
- **📝 Comprehensive tracking**: Each stage has specialized data structures for relevant information
- **🔗 Hierarchical**: Main plans can have independent subtask plans with their own workflows
- **✅ Validation**: Built-in validation ensures proper stage progression and data integrity
- **🛠️ MCP Integration**: Full Model Context Protocol support for AI agent integration
- **📊 Progress tracking**: Visual progress through workflow stages with completion status
- **🚀 Extensible**: TypeScript-based with comprehensive type definitions and error handling