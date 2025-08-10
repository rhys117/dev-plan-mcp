---
description: Create and orchestrate an MCP development plan
argument-hint: <task-description> [workflow-type]
---

Create a new MCP development plan and begin orchestration.

**Task:** $ARGUMENTS

First, create the plan using MCP tools:

1. Use `mcp__planner__create_plan` with:
   - `taskDescription`: "$ARGUMENTS" 
   - `workflow`: Extract workflow type from arguments or default to "medium"
   - `priority`: "medium"

2. Once the plan is created, use `mcp__planner__execute_next_phase` to start the first phase

3. Follow the orchestrator guidance prompts to manually execute each phase

**Available workflow types:** micro, small, medium, large, epic

The orchestration will proceed through phases:
- Scope Analysis → Context Gathering → Solution Design → Implementation → Validation → Documentation → Knowledge Capture

Each phase provides orchestrator guidance for manual execution using MCP tools to track progress.