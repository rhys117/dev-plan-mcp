---
description: Execute all remaining phases of an MCP development plan sequentially
argument-hint: [plan-file]
---

Execute all remaining phases of the development plan from start to finish.

**Plan file:** ${ARGUMENTS:-.llms/.dev-plan-main.yaml}

This will orchestrate the complete development workflow by:

1. **Reading the current plan** using `mcp__planner__read_plan`
2. **Determining remaining phases** based on the workflow and current progress
3. **Executing each phase sequentially** by using orchestrator prompts and MCP tools
4. **Continuing until the MCP tool reports the workflow is complete**

## Execution Strategy

For each incomplete phase in the workflow:
1. Use `mcp__planner__execute_next_phase` to get orchestrator guidance
2. Follow the orchestrator prompts to manually complete the phase work
3. Use MCP tools to update the plan with your progress
4. Move to the next phase
