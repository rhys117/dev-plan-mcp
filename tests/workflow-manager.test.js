import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { promises as fs } from 'fs';

describe('Workflow Manager', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('WorkflowManager creates default workflows file', async () => {
    // Ensure directory exists first
    await fs.mkdir('.llms', { recursive: true });
    
    const workflowManager = await helper.createWorkflowManager();
    await workflowManager.createWorkflowsFile();

    const exists = await helper.planExists(`${helper.testDir}/.llms/workflows.yml`);
    helper.assert(exists, 'workflows.yml should be created');

    const workflows = await workflowManager.loadWorkflows();
    helper.assertObjectHasKeys(workflows, ['workflows', 'default'], 'Should have required top-level keys');
    helper.assertObjectHasKeys(workflows.workflows, ['micro', 'small', 'medium', 'large', 'epic'], 'Should have all default workflows');
  });

  test('WorkflowManager refuses to overwrite without force', async () => {
    const workflowManager = await helper.createWorkflowManager();
    
    try {
      await workflowManager.createWorkflowsFile(false);
      helper.assert(false, 'Should throw error when file exists');
    } catch (error) {
      helper.assertContains(error.message, 'already exists', 'Should mention file exists');
    }
  });

  test('WorkflowManager overwrites with force', async () => {
    const workflowManager = await helper.createWorkflowManager();
    
    // Should not throw
    await workflowManager.createWorkflowsFile(true);
    
    const exists = await helper.planExists(`${helper.testDir}/.llms/workflows.yml`);
    helper.assert(exists, 'workflows.yml should still exist after force overwrite');
  });

  test('WorkflowManager loads custom workflows', async () => {
    const customWorkflows = {
      workflows: {
        research: {
          description: 'Research-focused workflow',
          steps: ['literature_review', 'hypothesis', 'experiment', 'analysis', 'publication']
        },
        rapid: {
          description: 'Rapid prototyping',
          steps: ['ideation', 'prototype', 'test', 'iterate']
        }
      },
      default: {
        description: 'Default workflow',
        steps: ['scope_analysis', 'implementation', 'validation']
      }
    };

    await helper.createCustomWorkflows(customWorkflows);

    const workflowManager = await helper.createWorkflowManager();
    const workflows = await workflowManager.loadWorkflows();

    helper.assertObjectHasKeys(workflows.workflows, ['research', 'rapid'], 'Should load custom workflows');
    
    const researchSteps = await workflowManager.getWorkflowSteps('research');
    helper.assertArrayEqual(
      researchSteps,
      ['literature_review', 'hypothesis', 'experiment', 'analysis', 'publication'],
      'Should return correct custom workflow steps'
    );

    const rapidSteps = await workflowManager.getWorkflowSteps('rapid');
    helper.assertArrayEqual(
      rapidSteps,
      ['ideation', 'prototype', 'test', 'iterate'],
      'Should return correct custom workflow steps'
    );
  });

  test('WorkflowManager falls back to default for unknown workflow', async () => {
    const customWorkflows = {
      workflows: {
        known: {
          description: 'Known workflow',
          steps: ['step1', 'step2']
        }
      },
      default: {
        description: 'Default workflow',
        steps: ['default_step1', 'default_step2', 'default_step3']
      }
    };

    await helper.createCustomWorkflows(customWorkflows);

    const workflowManager = await helper.createWorkflowManager();
    const unknownSteps = await workflowManager.getWorkflowSteps('unknown_workflow');
    
    helper.assertArrayEqual(
      unknownSteps,
      ['default_step1', 'default_step2', 'default_step3'],
      'Should return default workflow steps for unknown workflow'
    );
  });

  test('WorkflowManager getNextSteps works correctly', async () => {
    const customWorkflows = {
      workflows: {
        test_flow: {
          description: 'Test workflow',
          steps: ['start', 'middle', 'end']
        }
      },
      default: { description: 'Default', steps: ['implementation'] }
    };

    await helper.createCustomWorkflows(customWorkflows);

    const workflowManager = await helper.createWorkflowManager();

    // Test at beginning
    const step1 = await workflowManager.getNextSteps('test_flow', 'start', false);
    helper.assertEqual(step1.currentStep, 'start', 'Should show current step');
    helper.assertEqual(step1.nextStep, 'middle', 'Should show next step when not completed');
    helper.assertArrayEqual(step1.remainingSteps, ['middle', 'end'], 'Should show remaining steps');
    helper.assert(!step1.isComplete, 'Should not be complete');

    // Test moving to next step
    const step2 = await workflowManager.getNextSteps('test_flow', 'start', true);
    helper.assertEqual(step2.currentStep, 'start', 'Should show current step');
    helper.assertEqual(step2.nextStep, 'middle', 'Should advance to next step when completed');
    helper.assertArrayEqual(step2.remainingSteps, ['end'], 'Should show remaining steps');
    helper.assert(!step2.isComplete, 'Should not be complete yet');

    // Test at end
    const step3 = await workflowManager.getNextSteps('test_flow', 'end', true);
    helper.assertEqual(step3.currentStep, 'end', 'Should show current step');
    helper.assertEqual(step3.nextStep, null, 'Should have no next step at end');
    helper.assertArrayEqual(step3.remainingSteps, [], 'Should have no remaining steps');
    helper.assert(step3.isComplete, 'Should be complete');
  });

  test('WorkflowManager getNextSteps handles unknown current phase', async () => {
    // Ensure no workflows file exists so we get true defaults
    try {
      await fs.unlink(`${helper.testDir}/.llms/workflows.yml`);
    } catch {}
    
    const workflowManager = await helper.createWorkflowManager();
    
    // Use default workflows - get the actual first step
    const steps = await workflowManager.getWorkflowSteps('medium');
    const firstStep = steps[0];  
    const secondStep = steps[1]; 
    
    const nextSteps = await workflowManager.getNextSteps('medium', 'unknown_phase', false);
    
    // Should start from beginning when current phase is unknown
    helper.assertEqual(nextSteps.currentStep, firstStep, 'Should start from first step');
    // Handle case where there's only one step (secondStep would be undefined)
    if (secondStep) {
      helper.assertEqual(nextSteps.nextStep, secondStep, 'Should have correct next step');
    } else {
      helper.assertEqual(nextSteps.nextStep, null, 'Should have no next step if only one step');
    }
    helper.assert(!nextSteps.isComplete, 'Should not be complete');
  });

  test('WorkflowManager validateWorkflowStep works', async () => {
    const customWorkflows = {
      workflows: {
        validation_test: {
          description: 'Validation test',
          steps: ['valid_step1', 'valid_step2']
        }
      },
      default: { description: 'Default', steps: ['implementation'] }
    };

    await helper.createCustomWorkflows(customWorkflows);

    const workflowManager = await helper.createWorkflowManager();

    const isValid1 = await workflowManager.validateWorkflowStep('validation_test', 'valid_step1');
    helper.assert(isValid1, 'Should validate existing step');

    const isValid2 = await workflowManager.validateWorkflowStep('validation_test', 'invalid_step');
    helper.assert(!isValid2, 'Should not validate non-existing step');

    const isValid3 = await workflowManager.validateWorkflowStep('unknown_workflow', 'implementation');
    helper.assert(isValid3, 'Should validate step in default workflow for unknown workflow type');
  });

  test('WorkflowManager handles missing workflows file gracefully', async () => {
    // Ensure no workflows file exists  
    try {
      await fs.unlink(`${helper.testDir}/.llms/workflows.yml`);
    } catch {}
    
    // Create a new workflow manager with no workflows file
    const workflowManager = await helper.createWorkflowManager();
    
    // Should fall back to default workflows
    const workflows = await workflowManager.loadWorkflows();
    helper.assertObjectHasKeys(workflows.workflows, ['micro', 'small', 'medium', 'large', 'epic'], 'Should have default workflows');
    
    const steps = await workflowManager.getWorkflowSteps('medium');
    // Just check that we get some steps for medium workflow - the exact steps may vary
    helper.assert(steps.length > 0, 'Should return some workflow steps');
    helper.assertContains(steps, 'implementation', 'Should contain implementation step');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});