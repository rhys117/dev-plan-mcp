import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { generatePlan } from '../dist/plan-template.js';
import { PlanUpdater } from '../dist/plan-updater.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';

describe('Integration Tests', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('End-to-end workflow: Create plan, update stages, complete workflow', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    // 1. Create a plan with medium workflow
    const plan = await generatePlan('Integration Test Feature', 'integration-test', {
      workflow: 'medium',
      priority: 'high',
      baseDir: helper.testDir
    });

    const planFile = '.llms/integration-test.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    // Verify plan was created correctly
    helper.assertEqual(plan.workflow, 'medium', 'Plan should have medium workflow');
    helper.assertEqual(plan.phase, 'scope_analysis', 'Should start at scope_analysis');
    
    // Check that only medium workflow stages are present
    const expectedStages = ['scope_analysis', 'context_gathering', 'solution_design', 'implementation', 'validation', 'documentation'];
    const actualStages = Object.keys(plan.progress);
    helper.assertArrayEqual(actualStages, expectedStages, 'Should have only medium workflow stages');

    // 2. Progress through the workflow stages
    const updater = new PlanUpdater(planFile);

    // Update to context_gathering
    let result = await updater.updateStage('context_gathering', {
      sectionData: {
        findings: {
          user_needs: 'Users need better integration testing'
        }
      }
    });
    helper.assert(result.success, 'Should update to context_gathering');

    // Update to solution_design
    result = await updater.updateStage('solution_design', {
      sectionData: {
        artifacts: {
          test_plan: 'Comprehensive integration test plan'
        },
        checklist: [
          { task: 'Design test scenarios', complete: true },
          { task: 'Create test data', complete: false }
        ]
      }
    });
    helper.assert(result.success, 'Should update to solution_design');

    // Update to implementation
    result = await updater.updateStage('implementation', {
      sectionData: {
        changes: [
          'Added integration test suite',
          'Implemented test helpers',
          'Created mock data'
        ]
      }
    });
    helper.assert(result.success, 'Should update to implementation');

    // 3. Verify final plan state
    const finalPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(finalPlan.phase, 'implementation', 'Should be at implementation phase');
    helper.assert(finalPlan.progress.scope_analysis.complete, 'scope_analysis should be complete');
    helper.assert(finalPlan.progress.context_gathering.complete, 'context_gathering should be complete');
    helper.assert(finalPlan.progress.solution_design.complete, 'solution_design should be complete');
    helper.assert(finalPlan.progress.implementation.complete, 'implementation should be complete');

    // Verify section data was preserved
    helper.assertEqual(
      finalPlan.progress.context_gathering.findings.user_needs,
      'Users need better integration testing',
      'Context gathering data should be preserved'
    );
    helper.assertEqual(
      finalPlan.progress.solution_design.artifacts.test_plan,
      'Comprehensive integration test plan',
      'Solution design artifacts should be preserved'
    );
    helper.assertEqual(
      finalPlan.progress.implementation.changes.length,
      3,
      'Implementation changes should be preserved'
    );
  });

  test('Custom workflow integration test', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    // 1. Create custom workflow
    const customWorkflows = {
      workflows: {
        testing_flow: {
          description: 'Testing-focused workflow',
          steps: ['planning', 'test_design', 'implementation', 'validation', 'reporting']
        }
      },
      default: {
        description: 'Default',
        steps: ['implementation']
      }
    };
    await helper.createCustomWorkflows(customWorkflows);

    // 2. Create plan with custom workflow
    const plan = await generatePlan('Custom Workflow Test', 'custom-workflow', {
      workflow: 'testing_flow',
      baseDir: helper.testDir
    });

    const planFile = '.llms/custom-workflow.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    // Verify custom workflow structure
    const expectedStages = ['planning', 'test_design', 'implementation', 'validation', 'reporting'];
    const actualStages = Object.keys(plan.progress);
    helper.assertArrayEqual(actualStages, expectedStages, 'Should have custom workflow stages');
    helper.assertEqual(plan.phase, 'planning', 'Should start at first custom stage');

    // 3. Test workflow manager with custom workflow
    const workflowManager = await helper.createWorkflowManager();
    const nextSteps = await workflowManager.getNextSteps('testing_flow', 'test_design', true);
    
    helper.assertEqual(nextSteps.currentStep, 'test_design', 'Should show current step');
    helper.assertEqual(nextSteps.nextStep, 'implementation', 'Should show next step');
    helper.assertArrayEqual(nextSteps.remainingSteps, ['validation', 'reporting'], 'Should show remaining steps');

    // 4. Update custom stage
    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('test_design', {
      sectionData: {
        data: {
          test_scenarios: ['Unit tests', 'Integration tests', 'E2E tests']
        },
        notes: ['Focus on edge cases', 'Include performance tests']
      }
    });

    helper.assert(result.success, 'Should update custom stage');
    helper.assert(result.warnings.some(w => w.includes('Custom stage detected')), 'Should warn about custom stage');

    // Verify custom stage data
    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertArrayEqual(
      updatedPlan.progress.test_design.data.test_scenarios,
      ['Unit tests', 'Integration tests', 'E2E tests'],
      'Custom stage data should be preserved'
    );
  });


  test('cleanup', async () => {
    await helper.cleanup();
  });
});