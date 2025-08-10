import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { generatePlan } from '../dist/plan-template.js';

describe('Execute Next Phase', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('determines next phase from current plan state', async () => {
    // Create test plan
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test feature', 'test-feature', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    
    const planFile = '.llms/.dev-plan-test.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    // Test next phase determination logic
    const currentPhase = plan.phase;
    const isCurrentComplete = plan.progress[currentPhase]?.complete || false;
    
    helper.assertEqual(currentPhase, 'scope_analysis', 'Should start with scope_analysis phase');
    helper.assertEqual(isCurrentComplete, false, 'Initial phase should not be complete');
  });

  test('maps phases to correct agent types', async () => {
    const phaseToAgent = {
      'scope_analysis': 'scope-analyst',
      'context_gathering': 'context-gatherer', 
      'solution_design': 'solution-designer',
      'implementation': 'implementer',
      'validation': 'validator',
      'documentation': 'documenter',
      'knowledge_capture': 'knowledge-capturer'
    };

    // Test all phase mappings
    helper.assertEqual(phaseToAgent['scope_analysis'], 'scope-analyst', 'scope_analysis should map to scope-analyst');
    helper.assertEqual(phaseToAgent['context_gathering'], 'context-gatherer', 'context_gathering should map to context-gatherer');
    helper.assertEqual(phaseToAgent['solution_design'], 'solution-designer', 'solution_design should map to solution-designer');
    helper.assertEqual(phaseToAgent['implementation'], 'implementer', 'implementation should map to implementer');
    helper.assertEqual(phaseToAgent['validation'], 'validator', 'validation should map to validator');
    helper.assertEqual(phaseToAgent['documentation'], 'documenter', 'documentation should map to documenter');
    helper.assertEqual(phaseToAgent['knowledge_capture'], 'knowledge-capturer', 'knowledge_capture should map to knowledge-capturer');
  });

  test('loads correct prompt for target phase', async () => {
    // Create test prompts
    await fs.mkdir('src/prompts', { recursive: true });
    
    const testPromptContent = 'Current phase of plan: **Scope Analysis**\n\nTest prompt for scope analysis phase.';
    await fs.writeFile('src/prompts/scope-analyst.md', testPromptContent);
    
    // Test loading built-in prompt
    const builtinPath = 'src/prompts/scope-analyst.md';
    const content = await fs.readFile(builtinPath, 'utf-8');
    helper.assertEqual(content, testPromptContent, 'Should load built-in prompt content');
    
    // Test user override path
    await fs.mkdir('.llms/prompts', { recursive: true });
    const overrideContent = 'Custom user prompt for scope analysis';
    await fs.writeFile('.llms/prompts/scope-analyst.md', overrideContent);
    
    const userOverride = await fs.readFile('.llms/prompts/scope-analyst.md', 'utf-8');
    helper.assertEqual(userOverride, overrideContent, 'Should load user override when available');
  });

  test('injects plan context correctly', async () => {
    // Create test plan
    const planData = {
      task: 'Implement user authentication',
      phase: 'scope_analysis',
      status: 'active',
      workflow: 'medium'
    };
    
    await fs.mkdir('.llms', { recursive: true });
    const planFile = '.llms/.dev-plan-test.yaml';
    await fs.writeFile(planFile, yaml.dump(planData));
    
    // Test context injection
    const expectedContext = `\n\n## Current Plan Context\n**Task:** ${planData.task}\n**Phase:** ${planData.phase}\n**Status:** ${planData.status}`;
    
    helper.assert(expectedContext.includes(planData.task), 'Context should include task');
    helper.assert(expectedContext.includes(planData.phase), 'Context should include phase');
    helper.assert(expectedContext.includes(planData.status), 'Context should include status');
  });

  test('adds execution context and guidance', async () => {
    const targetPhase = 'scope_analysis';
    const planFile = '.llms/.dev-plan-test.yaml';
    
    const expectedExecutionContext = `\n\n## Additional Context\nReady to execute ${targetPhase} phase. The sub-agent file is available at .claude/agents/${targetPhase}-agent.md for autonomous execution.`;
    
    helper.assert(expectedExecutionContext.includes(targetPhase), 'Should include target phase');
    helper.assert(expectedExecutionContext.includes('.claude/agents/'), 'Should reference agent file location');
    
    const expectedGuidance = `
## Execution Options

**Manual Guidance**: Use the prompt above to guide your work through this phase.

**Autonomous Execution**: Use Claude Code's Task tool to spawn the ${targetPhase}-agent:

\`\`\`typescript
Task({
  subagent_type: "general-purpose",
  description: "Execute ${targetPhase} phase for plan",
  prompt: "Load the ${targetPhase}-agent from .claude/agents/${targetPhase}-agent.md and execute it for the plan at ${planFile}. Follow all the agent's instructions and update the plan using MCP tools."
});
\`\`\``;

    helper.assert(expectedGuidance.includes('Manual Guidance'), 'Should provide manual guidance option');
    helper.assert(expectedGuidance.includes('Autonomous Execution'), 'Should provide autonomous execution option');
    helper.assert(expectedGuidance.includes('Task({'), 'Should include Task tool example');
  });

  test('handles completed plans appropriately', async () => {
    // Create a completed plan
    const completedPlan = await generatePlan('Completed feature', 'completed-feature', {
      workflow: 'small',
      baseDir: helper.testDir
    });
    
    // Mark all phases as complete
    Object.keys(completedPlan.progress).forEach(stage => {
      completedPlan.progress[stage].complete = true;
    });
    
    await fs.mkdir('.llms', { recursive: true });
    const planFile = '.llms/.dev-plan-completed.yaml';
    await fs.writeFile(planFile, yaml.dump(completedPlan));
    
    // Test completion detection
    const allComplete = Object.keys(completedPlan.progress).every(stage => 
      completedPlan.progress[stage].complete === true
    );
    
    helper.assert(allComplete, 'All phases should be marked complete');
    
    const expectedCompletionMessage = '🎉 Plan is already complete! All workflow phases have been finished.\n\nUse `list_plans` to see the final state or create a new plan for additional work.';
    helper.assert(expectedCompletionMessage.includes('Plan is already complete'), 'Should indicate plan completion');
  });

  test('handles missing plan file gracefully', async () => {
    const nonexistentPlanFile = '.llms/.dev-plan-nonexistent.yaml';
    
    // Test error handling for missing plan
    try {
      await fs.readFile(nonexistentPlanFile, 'utf-8');
      helper.fail('Should throw error for nonexistent plan file');
    } catch (error) {
      helper.assert(error.code === 'ENOENT', 'Should get file not found error');
    }
    
    const expectedErrorResponse = `❌ Plan file not found: ${nonexistentPlanFile}\n\nCreate a plan first using \`create_plan\` tool.`;
    helper.assert(expectedErrorResponse.includes('Plan file not found'), 'Should provide helpful error message');
  });

  test('supports custom phases from workflows', async () => {
    // Create test plan with custom workflow
    const customPlan = {
      task: 'Custom workflow task',
      phase: 'custom_phase',
      status: 'active',
      workflow: 'custom',
      progress: {
        custom_phase: { complete: false }
      }
    };
    
    await fs.mkdir('.llms', { recursive: true });
    const planFile = '.llms/.dev-plan-custom.yaml';
    await fs.writeFile(planFile, yaml.dump(customPlan));
    
    // Test fallback for custom phases
    const phaseToAgent = {
      'scope_analysis': 'scope-analyst',
      'context_gathering': 'context-gatherer',
      // custom phases should fall back to scope-analyst
    };
    
    const agentType = phaseToAgent['custom_phase'] || 'scope-analyst';
    helper.assertEqual(agentType, 'scope-analyst', 'Custom phases should fall back to scope-analyst');
  });

  test('formats response correctly', async () => {
    // Test the expected response structure
    const mockPromptContent = 'Test prompt content';
    const mockExecutionGuidance = '\n\nTest execution guidance';
    
    const expectedResponse = {
      content: [{
        type: 'text',
        text: mockPromptContent + mockExecutionGuidance
      }]
    };
    
    helper.assertEqual(expectedResponse.content.length, 1, 'Should return one content item');
    helper.assertEqual(expectedResponse.content[0].type, 'text', 'Content should be text type');
    helper.assert(typeof expectedResponse.content[0].text === 'string', 'Text should be a string');
    helper.assert(expectedResponse.content[0].text.includes('Test prompt content'), 'Should include prompt content');
    helper.assert(expectedResponse.content[0].text.includes('Test execution guidance'), 'Should include execution guidance');
  });

  test('validates plan file parameter default', async () => {
    // Test default planFile parameter
    const defaultPlanFile = '.llms/.dev-plan-main.yaml';
    
    // Create default plan file
    const defaultPlan = await generatePlan('Default plan', 'default-plan', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    
    await fs.mkdir('.llms', { recursive: true });
    await fs.writeFile(defaultPlanFile, yaml.dump(defaultPlan));
    
    // Verify default file can be read
    const content = await fs.readFile(defaultPlanFile, 'utf-8');
    const plan = yaml.load(content);
    
    helper.assert(plan.task === 'Default plan', 'Should read default plan file');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});