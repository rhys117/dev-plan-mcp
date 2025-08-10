---
description: Execute the next phase of an active MCP development plan
argument-hint: [plan-file]
---

Execute the next phase of the current development plan.

**Plan file:** ${ARGUMENTS:-.llms/.dev-plan-main.yaml}
Use `mcp__planner__execute_next_phase` with:
- `planFile`: "${ARGUMENTS:-.llms/.dev-plan-main.yaml}"

This will:
1. Read the current plan state
2. Determine the next phase to execute based on the workflow
3. Provide orchestrator guidance prompts for the phase
4. Guide you through manual execution of the phase tasks

You will manually execute the phase following the orchestrator guidance and update the plan progress using MCP tools.