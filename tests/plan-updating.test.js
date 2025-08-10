import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { PlanUpdater } from '../dist/plan-updater.js';
import { generatePlan } from '../dist/plan-template.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';

describe('Plan Updating', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('PlanUpdater updates stage successfully', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    // Create a test plan
    const plan = await generatePlan('Test Update', 'test-update', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-plan.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('context_gathering', {
      markComplete: true,
      sectionData: {
        findings: {
          key_insight: 'Important discovery'
        }
      }
    });

    helper.assert(result.success, 'Update should succeed');
    helper.assertEqual(result.stage, 'context_gathering', 'Should return updated stage');
    helper.assert(result.updatedAt, 'Should have updated timestamp');

    // Verify the plan was updated
    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.phase, 'context_gathering', 'Phase should be updated');
    helper.assert(updatedPlan.progress.scope_analysis.complete, 'Previous stage should be marked complete');
    helper.assert(updatedPlan.progress.context_gathering.complete, 'Current stage should be marked complete');
    helper.assertEqual(
      updatedPlan.progress.context_gathering.findings.key_insight,
      'Important discovery',
      'Section data should be merged'
    );
  });

  test('PlanUpdater validates stage order', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Order', 'test-order', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-order.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    
    // Try to jump to validation without completing intermediate stages
    const result = await updater.updateStage('validation', {
      markComplete: true
    });

    helper.assert(!result.success, 'Should fail when jumping stages');
    helper.assertContains(result.error, 'Cannot jump to validation', 'Should explain the error');
  });

  test('PlanUpdater allows force update', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Force', 'test-force', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-force.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    
    // Force jump to validation
    const result = await updater.updateStage('validation', {
      force: true,
      markComplete: true
    });

    helper.assert(result.success, 'Force update should succeed');
    helper.assert(result.warnings.some(w => w.includes('Forcing jump')), 'Should have force warning');

    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.phase, 'validation', 'Should update to forced stage');
  });

  test('PlanUpdater handles incomplete flag', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Incomplete', 'test-incomplete', {
      workflow: 'small',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-incomplete.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('context_gathering', {
      markComplete: false,
      sectionData: {
        findings: {
          partial: 'Work in progress'
        }
      }
    });

    helper.assert(result.success, 'Update should succeed');

    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.phase, 'context_gathering', 'Phase should be updated');
    helper.assert(!updatedPlan.progress.context_gathering.complete, 'Stage should not be marked complete');
    helper.assertEqual(
      updatedPlan.progress.context_gathering.findings.partial,
      'Work in progress',
      'Section data should still be updated'
    );
  });

  test('PlanUpdater marks plan as completed when all stages done', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Complete', 'test-complete', {
      workflow: 'micro',  // Only has implementation stage
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-complete.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('implementation', {
      markComplete: true
    });

    helper.assert(result.success, 'Update should succeed');
    helper.assert(result.warnings.some(w => w.includes('All stages complete')), 'Should have completion warning');

    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.status, 'completed', 'Plan should be marked as completed');
  });

  test('PlanUpdater handles custom stages', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const customWorkflows = {
      workflows: {
        custom: {
          description: 'Custom workflow',
          steps: ['research', 'prototype', 'deploy']
        }
      },
      default: { description: 'Default', steps: ['implementation'] }
    };
    await helper.createCustomWorkflows(customWorkflows);

    const plan = await generatePlan('Custom Test', 'custom-test', {
      workflow: 'custom',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-custom.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('prototype', {
      markComplete: true,
      sectionData: {
        data: {
          version: 'v1.0'
        },
        notes: ['Built initial prototype']
      }
    });

    helper.assert(result.success, 'Update should succeed for custom stage');
    helper.assert(result.warnings.some(w => w.includes('Custom stage detected')), 'Should warn about custom stage');

    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedPlan.phase, 'prototype', 'Should update to custom stage');
    helper.assert(updatedPlan.progress.prototype.complete, 'Custom stage should be marked complete');
    helper.assertEqual(updatedPlan.progress.prototype.data.version, 'v1.0', 'Custom stage data should be updated');
    helper.assertArrayEqual(updatedPlan.progress.prototype.notes, ['Built initial prototype'], 'Custom stage notes should be updated');
  });

  test('PlanUpdater initializes missing stage', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Init', 'test-init', {
      workflow: 'small',
      baseDir: helper.testDir
    });
    
    // Manually remove a stage from progress to test initialization
    delete plan.progress.validation;
    
    const planFile = '.llms/test-init.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    const result = await updater.updateStage('validation', {
      markComplete: true,
      sectionData: {
        results: {
          status: 'passed'
        }
      }
    });

    helper.assert(result.success, 'Should succeed even with missing stage');

    const updatedPlan = await helper.readPlanFile(planFile);
    helper.assert(updatedPlan.progress.validation, 'Missing stage should be initialized');
    helper.assertObjectHasKeys(updatedPlan.progress.validation, ['complete', 'results'], 'Stage should have correct structure');
    helper.assertEqual(updatedPlan.progress.validation.results.status, 'passed', 'Section data should be applied');
  });

  test('PlanUpdater merges section data correctly', async () => {
    // Ensure directory exists
    await fs.mkdir('.llms', { recursive: true });
    
    const plan = await generatePlan('Test Merge', 'test-merge', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/test-merge.yaml';
    await fs.writeFile(planFile, yaml.dump(plan));

    const updater = new PlanUpdater(planFile);
    
    // First update
    await updater.updateStage('solution_design', {
      markComplete: false,
      sectionData: {
        artifacts: {
          design_doc: 'Created'
        },
        checklist: [
          { task: 'Create wireframes', complete: true }
        ]
      }
    });

    // Second update - should merge, not replace
    const result = await updater.updateStage('solution_design', {
      markComplete: true,
      sectionData: {
        artifacts: {
          api_spec: 'Documented'
        },
        checklist: [
          { task: 'Review with team', complete: false }
        ]
      }
    });

    helper.assert(result.success, 'Second update should succeed');

    const updatedPlan = await helper.readPlanFile(planFile);
    const designProgress = updatedPlan.progress.solution_design;
    
    // Artifacts should be merged
    helper.assertEqual(designProgress.artifacts.design_doc, 'Created', 'Original artifact should remain');
    helper.assertEqual(designProgress.artifacts.api_spec, 'Documented', 'New artifact should be added');
    
    // Checklist should be replaced (array)
    helper.assertEqual(designProgress.checklist.length, 1, 'Checklist should be replaced, not merged');
    helper.assertEqual(designProgress.checklist[0].task, 'Review with team', 'New checklist should be used');
  });

  test('PlanUpdater handles plan file errors', async () => {
    const updater = new PlanUpdater('nonexistent.yaml');
    const result = await updater.updateStage('implementation', {});

    helper.assert(!result.success, 'Should fail for nonexistent file');
    helper.assertContains(result.error, 'Plan file not found', 'Should have appropriate error message');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});