import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { generatePlan, generateSlug, createStageProgress } from '../dist/plan-template.js';
import { PlanUpdater } from '../dist/plan-updater.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';

describe('Core Functionality Tests', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('Basic plan creation with workflows', async () => {
    // Test plan creation for different workflows
    const microPlan = await generatePlan('Quick Fix', 'quick-fix', {
      workflow: 'micro',
      baseDir: helper.testDir
    });
    
    helper.assertEqual(microPlan.workflow, 'micro', 'Should set micro workflow');
    helper.assertEqual(microPlan.phase, 'implementation', 'Micro should start at implementation');
    helper.assertArrayEqual(Object.keys(microPlan.progress), ['implementation'], 'Micro should only have implementation stage');

    const mediumPlan = await generatePlan('Medium Task', 'medium-task', {
      workflow: 'medium',
      priority: 'high',
      baseDir: helper.testDir
    });
    
    helper.assertEqual(mediumPlan.workflow, 'medium', 'Should set medium workflow');
    helper.assertEqual(mediumPlan.priority, 'high', 'Should set priority');
    helper.assertEqual(mediumPlan.phase, 'scope_analysis', 'Medium should start at scope_analysis');
    
    const expectedMediumStages = ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation'];
    helper.assertArrayEqual(Object.keys(mediumPlan.progress), expectedMediumStages, 'Medium should have correct stages');
  });

  test('Plan updating and stage progression', async () => {
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Update Test', 'update-test', {
      workflow: 'small',
      baseDir: helper.testDir
    });
    
    const planFile = '.llms/update-test.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    
    // Test normal progression
    let result = await updater.updateStage('context_gathering', {
      sectionData: {
        findings: {
          requirement: 'Need better testing'
        }
      }
    });
    
    helper.assert(result.success, 'Should successfully update to context_gathering');
    helper.assertEqual(result.stage, 'context_gathering', 'Should return correct stage');

    // Verify plan was updated
    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.phase, 'context_gathering', 'Plan phase should be updated');
    helper.assert(updatedPlan.progress.scope_analysis.complete, 'Previous stage should be complete');
    helper.assertEqual(
      updatedPlan.progress.context_gathering.findings.requirement,
      'Need better testing',
      'Section data should be preserved'
    );

    // Test jumping stages (should fail)
    result = await updater.updateStage('validation', {});
    helper.assert(!result.success, 'Should fail when jumping stages');
    helper.assert(result.error.includes('Cannot jump'), 'Should explain validation error');

    // Test force update
    result = await updater.updateStage('validation', { force: true });
    helper.assert(result.success, 'Should succeed with force');
    helper.assert(result.warnings && result.warnings.some(w => w.includes('Forcing jump')), 'Should warn about forced jump');
  });

  test('Custom workflows', async () => {
    const customWorkflows = {
      workflows: {
        testing: {
          description: 'Testing workflow',
          steps: ['plan', 'test', 'verify']
        }
      },
      default: {
        description: 'Default',
        steps: ['implementation']
      }
    };
    
    await helper.createCustomWorkflows(customWorkflows);

    const plan = await generatePlan('Custom Test', 'custom-test', {
      workflow: 'testing',
      baseDir: helper.testDir
    });

    helper.assertEqual(plan.workflow, 'testing', 'Should use custom workflow');
    helper.assertEqual(plan.phase, 'plan', 'Should start at first custom step');
    helper.assertArrayEqual(Object.keys(plan.progress), ['plan', 'test', 'verify'], 'Should have custom stages');

    // Check custom stage structure
    helper.assertObjectHasKeys(plan.progress.plan, ['complete', 'data', 'notes'], 'Custom stage should have generic structure');
    helper.assertObjectHasKeys(plan.progress.test, ['complete', 'data', 'notes'], 'Custom stage should have generic structure');
  });

  test('Workflow manager functionality', async () => {
    // Ensure clean state for default workflows
    try {
      await fs.unlink(`${helper.testDir}/.llms/workflows.yml`);
    } catch {}
    
    const workflowManager = await helper.createWorkflowManager();
    
    // Test default workflows
    const mediumSteps = await workflowManager.getWorkflowSteps('medium');
    helper.assert(mediumSteps.length > 0, 'Should return steps for medium workflow');
    helper.assertContains(mediumSteps, 'implementation', 'Should contain implementation step');

    // Test next steps calculation
    const nextSteps = await workflowManager.getNextSteps('medium', 'scope_analysis', true);
    helper.assertEqual(nextSteps.currentStep, 'scope_analysis', 'Should show current step');
    helper.assertEqual(nextSteps.nextStep, 'context_gathering', 'Should show next step');
    helper.assert(!nextSteps.isComplete, 'Should not be complete yet');

    // Test validation
    const isValid = await workflowManager.validateWorkflowStep('medium', 'implementation');
    helper.assert(isValid, 'Should validate known step');
  });

  test('Slug generation edge cases', () => {
    helper.assertEqual(generateSlug(''), '', 'Should handle empty string');
    helper.assertEqual(generateSlug('   '), '', 'Should handle whitespace only');
    helper.assertEqual(generateSlug('!!!@#$%^&*()'), '', 'Should handle special chars only');
    helper.assertEqual(generateSlug('Add User Authentication'), 'add-user-authentication', 'Should create proper slug');
    helper.assertEqual(generateSlug('Multiple    Spaces'), 'multiple-spaces', 'Should handle multiple spaces');
    
    const longString = 'Very Long Task Description That Should Be Truncated Because It Exceeds Fifty Characters';
    const result = generateSlug(longString);
    helper.assert(result.length <= 50, 'Should truncate long strings');
    helper.assertEqual(result, 'very-long-task-description-that-should-be-truncate', 'Should truncate correctly');
  });

  test('Stage progress structures', () => {
    // Test known stages
    const scopeProgress = createStageProgress('scope_analysis');
    helper.assertObjectHasKeys(scopeProgress, ['complete', 'findings'], 'scope_analysis should have correct structure');

    const designProgress = createStageProgress('solution_design');
    helper.assertObjectHasKeys(designProgress, ['complete', 'artifacts', 'checklist'], 'solution_design should have correct structure');

    const implProgress = createStageProgress('implementation');
    helper.assertObjectHasKeys(implProgress, ['complete', 'changes'], 'implementation should have correct structure');

    // Test custom stage
    const customProgress = createStageProgress('custom_stage');
    helper.assertObjectHasKeys(customProgress, ['complete', 'data', 'notes'], 'custom stage should have generic structure');
  });

  test('Error handling', async () => {
    // Test with nonexistent plan file
    const updater = new PlanUpdater('nonexistent.yaml');
    const result = await updater.updateStage('implementation', {});
    
    helper.assert(!result.success, 'Should fail for nonexistent file');
    helper.assertContains(result.error, 'Plan file not found', 'Should have appropriate error message');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});