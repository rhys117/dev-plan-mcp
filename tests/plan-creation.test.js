import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { generatePlan, generateSlug, createStageProgress } from '../dist/plan-template.js';

describe('Plan Creation', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('generateSlug creates proper slugs', () => {
    helper.assertEqual(
      generateSlug('Add User Authentication'),
      'add-user-authentication',
      'Should create kebab-case slug'
    );

    helper.assertEqual(
      generateSlug('Fix Bug #123 in Payment System!!!'),
      'fix-bug-123-in-payment-system',
      'Should remove special characters'
    );

    helper.assertEqual(
      generateSlug('Very Long Task Description That Should Be Truncated Because It Exceeds Fifty Characters'),
      'very-long-task-description-that-should-be-truncate',
      'Should truncate to 50 characters'
    );
  });

  test('createStageProgress creates correct structures', () => {
    // Test standard stages
    const scopeProgress = createStageProgress('scope_analysis');
    helper.assertObjectHasKeys(scopeProgress, ['complete', 'findings'], 'scope_analysis should have correct keys');

    const designProgress = createStageProgress('solution_design');
    helper.assertObjectHasKeys(designProgress, ['complete', 'artifacts', 'checklist'], 'solution_design should have correct keys');

    const implProgress = createStageProgress('implementation');
    helper.assertObjectHasKeys(implProgress, ['complete', 'changes'], 'implementation should have correct keys');

    // Test custom stage
    const customProgress = createStageProgress('custom_stage');
    helper.assertObjectHasKeys(customProgress, ['complete', 'data', 'notes'], 'custom stage should have generic structure');
  });

  test('generatePlan creates basic plan correctly', async () => {
    const plan = await generatePlan('Test Task', 'test-task', {
      workflow: 'medium',
      priority: 'high',
      status: 'active'
    });

    helper.assertEqual(plan.task, 'Test Task', 'Task should be set correctly');
    helper.assertEqual(plan.slug, 'test-task', 'Slug should be set correctly');
    helper.assertEqual(plan.workflow, 'medium', 'Workflow should be set correctly');
    helper.assertEqual(plan.priority, 'high', 'Priority should be set correctly');
    helper.assertEqual(plan.status, 'active', 'Status should be set correctly');
    helper.assertEqual(plan.phase, 'scope_analysis', 'Initial phase should be first workflow step');
    
    helper.assert(plan.created, 'Should have created timestamp');
    helper.assert(plan.updated, 'Should have updated timestamp');
    helper.assert(Array.isArray(plan.sub_tasks), 'Should have sub_tasks array');
    helper.assert(plan.progress, 'Should have progress object');
  });

  test('generatePlan respects workflow steps', async () => {
    // Test micro workflow (only implementation)
    const microPlan = await generatePlan('Quick Fix', 'quick-fix', {
      workflow: 'micro'
    });

    const microSteps = Object.keys(microPlan.progress);
    helper.assertArrayEqual(microSteps, ['implementation'], 'Micro workflow should only have implementation');
    helper.assertEqual(microPlan.phase, 'implementation', 'Micro workflow should start at implementation');

    // Test epic workflow (all stages)
    const epicPlan = await generatePlan('Major Feature', 'major-feature', {
      workflow: 'epic'
    });

    const epicSteps = Object.keys(epicPlan.progress);
    const expectedSteps = ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation', 'knowledge_capture'];
    helper.assertArrayEqual(epicSteps, expectedSteps, 'Epic workflow should have all stages');
    helper.assertEqual(epicPlan.phase, 'scope_analysis', 'Epic workflow should start at scope_analysis');
  });

  test('generatePlan handles subtask type', async () => {
    const subtaskPlan = await generatePlan('Subtask', 'subtask', {
      workflow: 'small',
      type: 'subtask'
    });

    helper.assertEqual(subtaskPlan.status, 'pending', 'Subtask should default to pending status');
  });

  test('generatePlan uses custom initial phase', async () => {
    const plan = await generatePlan('Test Task', 'test-task', {
      workflow: 'large',
      initialPhase: 'implementation'
    });

    helper.assertEqual(plan.phase, 'implementation', 'Should use custom initial phase');
  });

  test('WorkflowManager loads default workflows', async () => {
    const workflowManager = await helper.createWorkflowManager();
    const workflows = await workflowManager.loadWorkflows();

    helper.assertObjectHasKeys(workflows, ['workflows', 'default'], 'Should have workflows and default');
    helper.assertObjectHasKeys(workflows.workflows, ['micro', 'small', 'medium', 'large', 'epic'], 'Should have all default workflow types');

    const microSteps = await workflowManager.getWorkflowSteps('micro');
    helper.assertArrayEqual(microSteps, ['implementation'], 'Micro workflow should have correct steps');

    const largeSteps = await workflowManager.getWorkflowSteps('large');
    const expectedLargeSteps = ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation', 'knowledge_capture'];
    helper.assertArrayEqual(largeSteps, expectedLargeSteps, 'Large workflow should have correct steps');
  });

  test('WorkflowManager handles custom workflows', async () => {
    const customWorkflows = {
      workflows: {
        custom: {
          description: 'Custom workflow',
          steps: ['research', 'design', 'build', 'test']
        }
      },
      default: {
        description: 'Default',
        steps: ['scope_analysis', 'implementation']
      }
    };

    await helper.createCustomWorkflows(customWorkflows);

    const workflowManager = await helper.createWorkflowManager();
    const steps = await workflowManager.getWorkflowSteps('custom');
    helper.assertArrayEqual(steps, ['research', 'design', 'build', 'test'], 'Should load custom workflow steps');

    const unknownSteps = await workflowManager.getWorkflowSteps('unknown');
    helper.assertArrayEqual(unknownSteps, ['scope_analysis', 'implementation'], 'Should fall back to default for unknown workflow');
  });


  test('cleanup', async () => {
    await helper.cleanup();
  });
});