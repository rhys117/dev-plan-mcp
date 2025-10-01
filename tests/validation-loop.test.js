import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { generatePlan, generateSlug } from '../dist/plan-template.js';
import { PlanUpdater } from '../dist/plan-updater.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';

describe('Validation Loop with Fix Subplans', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('Validation stage has correct initial structure', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Test Feature', 'test-feature', {
      workflow: 'medium',
      baseDir: helper.testDir
    });

    // Check validation progress structure
    helper.assertObjectHasKeys(
      plan.progress.validation,
      ['complete', 'results', 'validation_status', 'issues_found', 'fix_cycles'],
      'Validation should have all required fields'
    );
    helper.assertEqual(plan.progress.validation.validation_status, 'in_progress', 'Initial status should be in_progress');
    helper.assertArrayEqual(plan.progress.validation.issues_found, [], 'Should start with empty issues');
    helper.assertArrayEqual(plan.progress.validation.fix_cycles, [], 'Should start with empty fix_cycles');
  });

  test('Can create validation fix subplan when issues found', async () => {
    await fs.mkdir('.llms', { recursive: true });

    // Create and save main plan at validation stage
    const plan = await generatePlan('Feature with Bugs', 'feature-bugs', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';

    // Progress to validation stage
    plan.phase = 'validation';
    plan.progress.scope_analysis.complete = true;
    plan.progress.context_gathering.complete = true;
    plan.progress.solution_design.complete = true;
    plan.progress.implementation.complete = true;

    await fs.writeFile(planFile, yaml.dump(plan));

    // Simulate validation finding issues - manually call the logic
    const issues = [
      'Unit test failing: auth.test.js - login flow',
      'Integration test timeout: API response >30s',
      'Missing error handling for null user'
    ];

    // Load plan
    const parentPlan = await helper.readPlanFile(planFile);

    // Initialize fix_cycles
    parentPlan.progress.validation.fix_cycles = parentPlan.progress.validation.fix_cycles || [];
    const cycleNumber = parentPlan.progress.validation.fix_cycles.length + 1;

    // Create fix subplan
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const fixSlug = generateSlug(`fix-validation-cycle-${cycleNumber}`);
    const fixPlanFile = `${subtasksDir}/.dev-plan-${fixSlug}.yaml`;

    const fixPlan = await generatePlan(`Fix validation issues - Cycle ${cycleNumber}`, fixSlug, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });

    fixPlan.parent_plan = {
      file: planFile,
      task: parentPlan.task,
      slug: parentPlan.slug
    };
    fixPlan.type = 'subtask';
    fixPlan.parent_task = parentPlan.task;

    await fs.writeFile(fixPlanFile, yaml.dump(fixPlan));

    // Update parent plan
    parentPlan.progress.validation.fix_cycles.push({
      cycle: cycleNumber,
      subplan_file: fixPlanFile,
      issues: issues,
      created: new Date().toISOString(),
      status: 'active',
      resolved: false
    });
    parentPlan.progress.validation.validation_status = 'awaiting_fixes';
    parentPlan.progress.validation.issues_found = issues;

    await fs.writeFile(planFile, yaml.dump(parentPlan));

    // Verify fix subplan was created
    const fixExists = await helper.planExists(fixPlanFile);
    helper.assert(fixExists, 'Fix subplan should be created');

    // Verify fix subplan structure
    const loadedFixPlan = await helper.readPlanFile(fixPlanFile);
    helper.assertEqual(loadedFixPlan.type, 'subtask', 'Fix plan should be a subtask');
    helper.assertEqual(loadedFixPlan.workflow, 'small', 'Fix plan should have small workflow');
    helper.assertObjectHasKeys(loadedFixPlan.parent_plan, ['file', 'task', 'slug'], 'Fix plan should reference parent');

    // Verify parent plan was updated
    const updatedParent = await helper.readPlanFile(planFile);
    helper.assertEqual(updatedParent.progress.validation.validation_status, 'awaiting_fixes', 'Status should be awaiting_fixes');
    helper.assertEqual(updatedParent.progress.validation.fix_cycles.length, 1, 'Should have 1 fix cycle');
    helper.assertEqual(updatedParent.progress.validation.fix_cycles[0].cycle, 1, 'First cycle should be numbered 1');
    helper.assertArrayEqual(updatedParent.progress.validation.fix_cycles[0].issues, issues, 'Issues should be stored in fix cycle');
    helper.assertEqual(updatedParent.progress.validation.fix_cycles[0].status, 'active', 'Fix cycle should be active');
    helper.assertEqual(updatedParent.progress.validation.fix_cycles[0].resolved, false, 'Fix cycle should not be resolved');
  });

  test('Multiple fix cycles can be created', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Buggy Feature', 'buggy-feature', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    plan.phase = 'validation';
    await fs.writeFile(planFile, yaml.dump(plan));

    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    // Create first fix cycle
    const issues1 = ['Bug 1', 'Bug 2'];
    const fixSlug1 = generateSlug('fix-validation-cycle-1');
    const fixPlan1 = await generatePlan('Fix validation issues - Cycle 1', fixSlug1, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });
    const fixPlanFile1 = `${subtasksDir}/.dev-plan-${fixSlug1}.yaml`;
    await fs.writeFile(fixPlanFile1, yaml.dump(fixPlan1));

    let parentPlan = await helper.readPlanFile(planFile);
    parentPlan.progress.validation.fix_cycles = [{
      cycle: 1,
      subplan_file: fixPlanFile1,
      issues: issues1,
      created: new Date().toISOString(),
      status: 'completed',
      resolved: true
    }];
    await fs.writeFile(planFile, yaml.dump(parentPlan));

    // Create second fix cycle (new issues found after first fix)
    const issues2 = ['Bug 3 - regression', 'Bug 4'];
    const fixSlug2 = generateSlug('fix-validation-cycle-2');
    const fixPlan2 = await generatePlan('Fix validation issues - Cycle 2', fixSlug2, {
      workflow: 'micro',
      type: 'subtask',
      baseDir: helper.testDir
    });
    const fixPlanFile2 = `${subtasksDir}/.dev-plan-${fixSlug2}.yaml`;
    await fs.writeFile(fixPlanFile2, yaml.dump(fixPlan2));

    parentPlan = await helper.readPlanFile(planFile);
    parentPlan.progress.validation.fix_cycles.push({
      cycle: 2,
      subplan_file: fixPlanFile2,
      issues: issues2,
      created: new Date().toISOString(),
      status: 'active',
      resolved: false
    });
    await fs.writeFile(planFile, yaml.dump(parentPlan));

    // Verify both fix cycles exist
    const finalPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(finalPlan.progress.validation.fix_cycles.length, 2, 'Should have 2 fix cycles');
    helper.assertEqual(finalPlan.progress.validation.fix_cycles[0].cycle, 1, 'First cycle');
    helper.assertEqual(finalPlan.progress.validation.fix_cycles[0].status, 'completed', 'First cycle completed');
    helper.assertEqual(finalPlan.progress.validation.fix_cycles[1].cycle, 2, 'Second cycle');
    helper.assertEqual(finalPlan.progress.validation.fix_cycles[1].status, 'active', 'Second cycle active');

    // Verify both subplans exist
    const fix1Exists = await helper.planExists(fixPlanFile1);
    const fix2Exists = await helper.planExists(fixPlanFile2);
    helper.assert(fix1Exists, 'First fix subplan should exist');
    helper.assert(fix2Exists, 'Second fix subplan should exist');
  });

  test('Validation status transitions correctly', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Status Test', 'status-test', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    plan.phase = 'validation';
    await fs.writeFile(planFile, yaml.dump(plan));

    // Initial status
    let loadedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(loadedPlan.progress.validation.validation_status, 'in_progress', 'Initial status');

    // Simulate validation failure
    loadedPlan.progress.validation.validation_status = 'awaiting_fixes';
    loadedPlan.progress.validation.issues_found = ['Issue 1'];
    await fs.writeFile(planFile, yaml.dump(loadedPlan));

    loadedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(loadedPlan.progress.validation.validation_status, 'awaiting_fixes', 'Should be awaiting fixes');

    // Simulate validation pass after fixes
    loadedPlan.progress.validation.validation_status = 'passed';
    loadedPlan.progress.validation.issues_found = [];
    loadedPlan.progress.validation.complete = true;
    await fs.writeFile(planFile, yaml.dump(loadedPlan));

    loadedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(loadedPlan.progress.validation.validation_status, 'passed', 'Should be passed');
    helper.assert(loadedPlan.progress.validation.complete, 'Should be marked complete');
  });

  test('Fix subplan completes independently', async () => {
    await fs.mkdir('.llms', { recursive: true });

    // Create parent plan
    const parentPlan = await generatePlan('Parent Task', 'parent-task', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    parentPlan.phase = 'validation';
    await fs.writeFile(planFile, yaml.dump(parentPlan));

    // Create fix subplan
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const fixSlug = generateSlug('fix-validation-cycle-1');
    const fixPlan = await generatePlan('Fix validation issues - Cycle 1', fixSlug, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });
    const fixPlanFile = `${subtasksDir}/.dev-plan-${fixSlug}.yaml`;
    fixPlan.parent_plan = {
      file: planFile,
      task: parentPlan.task,
      slug: parentPlan.slug
    };
    await fs.writeFile(fixPlanFile, yaml.dump(fixPlan));

    // Complete fix subplan through its workflow
    const fixUpdater = new PlanUpdater(fixPlanFile);
    await fixUpdater.updateStage('context_gathering', { sectionData: { findings: { bug: 'found' } } });
    await fixUpdater.updateStage('implementation', { sectionData: { changes: ['Fixed bug'] } });
    const validationResult = await fixUpdater.updateStage('validation', {
      sectionData: {
        validation_status: 'passed',
        results: { tests: 'all pass' }
      }
    });

    helper.assert(validationResult.success, 'Fix subplan should complete successfully');

    // Verify fix subplan is complete
    const completedFix = await helper.readPlanFile(fixPlanFile);
    helper.assertEqual(completedFix.status, 'completed', 'Fix subplan should be completed');
    helper.assert(completedFix.progress.validation.complete, 'Validation in fix should be complete');

    // Verify parent plan is still at validation (awaiting review)
    const unchangedParent = await helper.readPlanFile(planFile);
    helper.assertEqual(unchangedParent.phase, 'validation', 'Parent should still be at validation');
    helper.assert(!unchangedParent.progress.validation.complete, 'Parent validation should not be auto-completed');
  });

  test('Fix cycle tracks resolution status', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Resolution Test', 'resolution-test', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    plan.phase = 'validation';
    plan.progress.validation.fix_cycles = [
      {
        cycle: 1,
        subplan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-fix-1.yaml',
        issues: ['Bug 1', 'Bug 2'],
        created: new Date().toISOString(),
        status: 'active',
        resolved: false
      }
    ];
    await fs.writeFile(planFile, yaml.dump(plan));

    // Mark fix cycle as resolved
    const loadedPlan = await helper.readPlanFile(planFile);
    loadedPlan.progress.validation.fix_cycles[0].status = 'completed';
    loadedPlan.progress.validation.fix_cycles[0].resolved = true;
    await fs.writeFile(planFile, yaml.dump(loadedPlan));

    // Verify resolution
    const resolvedPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(resolvedPlan.progress.validation.fix_cycles[0].status, 'completed', 'Cycle should be completed');
    helper.assertEqual(resolvedPlan.progress.validation.fix_cycles[0].resolved, true, 'Cycle should be marked resolved');
  });

  test('Fix cycles preserve full audit trail', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Audit Test', 'audit-test', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    plan.phase = 'validation';

    // Create multiple fix cycles with different statuses
    plan.progress.validation.fix_cycles = [
      {
        cycle: 1,
        subplan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-fix-1.yaml',
        issues: ['Initial bug', 'Another bug'],
        created: '2025-01-01T10:00:00Z',
        status: 'completed',
        resolved: true
      },
      {
        cycle: 2,
        subplan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-fix-2.yaml',
        issues: ['Regression from fix 1'],
        created: '2025-01-01T14:00:00Z',
        status: 'completed',
        resolved: true
      },
      {
        cycle: 3,
        subplan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-fix-3.yaml',
        issues: ['Edge case not handled'],
        created: '2025-01-01T16:00:00Z',
        status: 'failed',
        resolved: false
      }
    ];
    await fs.writeFile(planFile, yaml.dump(plan));

    // Verify audit trail is preserved
    const auditPlan = await helper.readPlanFile(planFile);
    helper.assertEqual(auditPlan.progress.validation.fix_cycles.length, 3, 'Should have 3 cycles in audit trail');

    // Verify each cycle maintains its data
    helper.assertEqual(auditPlan.progress.validation.fix_cycles[0].cycle, 1, 'Cycle 1 preserved');
    helper.assertEqual(auditPlan.progress.validation.fix_cycles[0].issues.length, 2, 'Cycle 1 issues preserved');
    helper.assertEqual(auditPlan.progress.validation.fix_cycles[1].cycle, 2, 'Cycle 2 preserved');
    helper.assertEqual(auditPlan.progress.validation.fix_cycles[2].cycle, 3, 'Cycle 3 preserved');
    helper.assertEqual(auditPlan.progress.validation.fix_cycles[2].status, 'failed', 'Failed status preserved');
  });

  test('Different workflow types for fix subplans', async () => {
    await fs.mkdir('.llms', { recursive: true });

    const plan = await generatePlan('Workflow Test', 'workflow-test', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const planFile = '.llms/.dev-plan-main.yaml';
    plan.phase = 'validation';
    await fs.writeFile(planFile, yaml.dump(plan));

    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    // Create micro workflow fix
    const microFix = await generatePlan('Quick fix', 'quick-fix', {
      workflow: 'micro',
      type: 'subtask',
      baseDir: helper.testDir
    });
    const microFile = `${subtasksDir}/.dev-plan-quick-fix.yaml`;
    await fs.writeFile(microFile, yaml.dump(microFix));

    // Create small workflow fix
    const smallFix = await generatePlan('Normal fix', 'normal-fix', {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });
    const smallFile = `${subtasksDir}/.dev-plan-normal-fix.yaml`;
    await fs.writeFile(smallFile, yaml.dump(smallFix));

    // Verify different workflows
    const loadedMicro = await helper.readPlanFile(microFile);
    const loadedSmall = await helper.readPlanFile(smallFile);

    helper.assertEqual(loadedMicro.workflow, 'micro', 'Should be micro workflow');
    helper.assertEqual(loadedSmall.workflow, 'small', 'Should be small workflow');

    const microSteps = Object.keys(loadedMicro.progress);
    const smallSteps = Object.keys(loadedSmall.progress);

    helper.assertArrayEqual(microSteps, ['implementation'], 'Micro should only have implementation');
    helper.assert(smallSteps.length > microSteps.length, 'Small workflow should have more steps');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});
