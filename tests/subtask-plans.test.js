import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { generatePlan, generateSlug } from '../dist/plan-template.js';
import { PlanUpdater } from '../dist/plan-updater.js';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';

describe('Subtask Plan Architecture', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('Subtask plan has correct parent references', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Main Feature', 'main-feature', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create subtask plan
    const subtaskSlug = generateSlug('Add authentication');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Add authentication', subtaskSlug, {
      workflow: 'medium',
      type: 'subtask',
      baseDir: helper.testDir
    });

    // Add parent references
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Verify subtask has correct parent references
    const loadedSubtask = await helper.readPlanFile(subtaskPlanFile);
    helper.assertEqual(loadedSubtask.type, 'subtask', 'Subtask should have subtask type');
    helper.assertEqual(loadedSubtask.parent_task, 'Main Feature', 'Subtask should reference parent task');
    helper.assertObjectHasKeys(loadedSubtask.parent_plan, ['file', 'task', 'slug'], 'Subtask should have parent_plan object');
    helper.assertEqual(loadedSubtask.parent_plan.file, mainPlanFile, 'Parent file should be correct');
    helper.assertEqual(loadedSubtask.parent_plan.task, mainPlan.task, 'Parent task should match');
    helper.assertEqual(loadedSubtask.parent_plan.slug, mainPlan.slug, 'Parent slug should match');
  });

  test('Subtask can be updated independently of parent', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Parent Task', 'parent-task', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create subtask
    const subtaskSlug = generateSlug('Child Task');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Child Task', subtaskSlug, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Update subtask
    const subtaskUpdater = new PlanUpdater(subtaskPlanFile);
    const result = await subtaskUpdater.updateStage('context_gathering', {
      sectionData: {
        findings: {
          subtask_finding: 'Independent subtask work'
        }
      }
    });

    helper.assert(result.success, 'Subtask should update successfully');

    // Verify parent plan is unchanged
    const unchangedParent = await helper.readPlanFile(mainPlanFile);
    helper.assertEqual(unchangedParent.phase, 'scope_analysis', 'Parent phase should remain unchanged');
    helper.assert(!unchangedParent.progress.context_gathering.complete, 'Parent context_gathering should not be complete');

    // Verify subtask was updated
    const updatedSubtask = await helper.readPlanFile(subtaskPlanFile);
    helper.assertEqual(updatedSubtask.phase, 'context_gathering', 'Subtask phase should be updated');
    helper.assertEqual(
      updatedSubtask.progress.context_gathering.findings.subtask_finding,
      'Independent subtask work',
      'Subtask findings should be preserved'
    );
  });

  test('Multiple subtasks can exist independently', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Multi-Subtask Feature', 'multi-subtask', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';

    // Add subtasks array to main plan
    mainPlan.sub_tasks = [];
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    // Create multiple subtasks
    const subtaskDescriptions = [
      'Frontend implementation',
      'Backend API',
      'Database schema',
      'Integration tests'
    ];

    const subtaskFiles = [];
    for (const desc of subtaskDescriptions) {
      const slug = generateSlug(desc);
      const subtaskPlan = await generatePlan(desc, slug, {
        workflow: 'medium',
        type: 'subtask',
        baseDir: helper.testDir
      });

      subtaskPlan.parent_plan = {
        file: mainPlanFile,
        task: mainPlan.task,
        slug: mainPlan.slug
      };
      subtaskPlan.type = 'subtask';
      subtaskPlan.parent_task = mainPlan.task;

      const subtaskFile = `${subtasksDir}/.dev-plan-${slug}.yaml`;
      await fs.writeFile(subtaskFile, yaml.dump(subtaskPlan));
      subtaskFiles.push(subtaskFile);

      // Update main plan with subtask reference
      mainPlan.sub_tasks.push({
        description: desc,
        slug: slug,
        priority: 'medium',
        status: 'independent',
        type: 'independent_plan',
        plan_file: subtaskFile,
        created: new Date().toISOString()
      });
    }

    // Save main plan with subtask references
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Verify all subtasks exist
    for (const subtaskFile of subtaskFiles) {
      const exists = await helper.planExists(subtaskFile);
      helper.assert(exists, `Subtask ${subtaskFile} should exist`);
    }

    // Verify main plan has all subtask references
    const loadedMainPlan = await helper.readPlanFile(mainPlanFile);
    helper.assertEqual(loadedMainPlan.sub_tasks.length, 4, 'Main plan should have 4 subtasks');

    for (let i = 0; i < subtaskDescriptions.length; i++) {
      helper.assertEqual(
        loadedMainPlan.sub_tasks[i].description,
        subtaskDescriptions[i],
        `Subtask ${i} should have correct description`
      );
      helper.assertEqual(
        loadedMainPlan.sub_tasks[i].type,
        'independent_plan',
        `Subtask ${i} should have independent_plan type`
      );
    }
  });

  test('Subtask workflow is independent from parent workflow', async () => {
    // Create main plan with large workflow
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Large Parent Task', 'large-parent', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create subtask with micro workflow
    const subtaskSlug = generateSlug('Quick Fix');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Quick Fix', subtaskSlug, {
      workflow: 'micro',
      type: 'subtask',
      baseDir: helper.testDir
    });
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Verify workflows are different
    const loadedMainPlan = await helper.readPlanFile(mainPlanFile);
    const loadedSubtask = await helper.readPlanFile(subtaskPlanFile);

    helper.assertEqual(loadedMainPlan.workflow, 'large', 'Main plan should have large workflow');
    helper.assertEqual(loadedSubtask.workflow, 'micro', 'Subtask should have micro workflow');

    // Verify different stages
    const mainStages = Object.keys(loadedMainPlan.progress);
    const subtaskStages = Object.keys(loadedSubtask.progress);

    helper.assert(mainStages.length > subtaskStages.length, 'Main plan should have more stages than micro subtask');
    helper.assertArrayEqual(subtaskStages, ['implementation'], 'Micro subtask should only have implementation stage');
  });

  test('Subtask directory structure is correct', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Project Root', 'project-root', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create subtask in correct directory structure
    const subtaskSlug = generateSlug('Subtask One');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Subtask One', subtaskSlug, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Verify directory structure
    const llmsExists = await helper.planExists('.llms');
    helper.assert(llmsExists, '.llms directory should exist');

    const mainDirExists = await helper.planExists('.llms/.dev-plan-main');
    helper.assert(mainDirExists, '.llms/.dev-plan-main directory should exist');

    const subtasksDirExists = await helper.planExists(subtasksDir);
    helper.assert(subtasksDirExists, 'subtasks directory should exist');

    const subtaskExists = await helper.planExists(subtaskPlanFile);
    helper.assert(subtaskExists, 'Subtask plan file should exist in correct location');

    // Verify filename follows convention
    helper.assert(
      subtaskPlanFile.includes('.dev-plan-'),
      'Subtask filename should follow .dev-plan- convention'
    );
  });

  test('Subtask status and type fields are correct', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Status Test Parent', 'status-parent', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    mainPlan.sub_tasks = [];
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create subtask with explicit status
    const subtaskSlug = generateSlug('Status Test Child');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Status Test Child', subtaskSlug, {
      workflow: 'small',
      type: 'subtask',
      status: 'active',
      baseDir: helper.testDir
    });
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Add reference in main plan
    mainPlan.sub_tasks.push({
      description: 'Status Test Child',
      slug: subtaskSlug,
      priority: 'medium',
      status: 'independent',
      type: 'independent_plan',
      plan_file: subtaskPlanFile,
      created: new Date().toISOString()
    });
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Verify status and type
    const loadedSubtask = await helper.readPlanFile(subtaskPlanFile);
    helper.assertEqual(loadedSubtask.type, 'subtask', 'Subtask plan should have type=subtask');
    helper.assertEqual(loadedSubtask.status, 'active', 'Subtask can have active status');

    const loadedMainPlan = await helper.readPlanFile(mainPlanFile);
    helper.assertEqual(
      loadedMainPlan.sub_tasks[0].type,
      'independent_plan',
      'Subtask reference should have type=independent_plan'
    );
    helper.assertEqual(
      loadedMainPlan.sub_tasks[0].status,
      'independent',
      'Subtask reference should have status=independent'
    );
  });

  test('Subtask with missing parent reference is handled', async () => {
    // Create orphaned subtask (no parent_plan reference)
    await fs.mkdir('.llms', { recursive: true });
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const orphanSlug = generateSlug('Orphan Task');
    const orphanPlan = await generatePlan('Orphan Task', orphanSlug, {
      workflow: 'small',
      type: 'subtask',
      baseDir: helper.testDir
    });
    // Intentionally don't set parent_plan, parent_task, or type

    const orphanFile = `${subtasksDir}/.dev-plan-${orphanSlug}.yaml`;
    await fs.writeFile(orphanFile, yaml.dump(orphanPlan));

    // Verify orphan can still be loaded and updated
    const loadedOrphan = await helper.readPlanFile(orphanFile);
    helper.assertEqual(loadedOrphan.task, 'Orphan Task', 'Orphan should load successfully');
    helper.assert(!loadedOrphan.parent_plan, 'Orphan should not have parent_plan');

    // Try to update orphan
    const updater = new PlanUpdater(orphanFile);
    const result = await updater.updateStage('context_gathering', {
      sectionData: { findings: { note: 'Orphaned subtask' } }
    });

    helper.assert(result.success, 'Orphan subtask should be updatable');
  });

  test('Subtask can complete independently while parent is incomplete', async () => {
    // Create main plan
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Slow Parent', 'slow-parent', {
      workflow: 'large',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Create fast subtask with micro workflow
    const subtaskSlug = generateSlug('Fast Task');
    const subtasksDir = '.llms/.dev-plan-main/subtasks';
    await fs.mkdir(subtasksDir, { recursive: true });

    const subtaskPlan = await generatePlan('Fast Task', subtaskSlug, {
      workflow: 'micro',
      type: 'subtask',
      baseDir: helper.testDir
    });
    subtaskPlan.parent_plan = {
      file: mainPlanFile,
      task: mainPlan.task,
      slug: mainPlan.slug
    };
    subtaskPlan.type = 'subtask';
    subtaskPlan.parent_task = mainPlan.task;

    const subtaskPlanFile = `${subtasksDir}/.dev-plan-${subtaskSlug}.yaml`;
    await fs.writeFile(subtaskPlanFile, yaml.dump(subtaskPlan));

    // Complete the subtask
    const subtaskUpdater = new PlanUpdater(subtaskPlanFile);
    const result = await subtaskUpdater.updateStage('implementation', {
      markComplete: true,
      sectionData: { changes: ['Completed quickly'] }
    });

    helper.assert(result.success, 'Subtask should complete');

    // Verify subtask is complete
    const completedSubtask = await helper.readPlanFile(subtaskPlanFile);
    helper.assertEqual(completedSubtask.status, 'completed', 'Subtask should be marked completed');
    helper.assert(completedSubtask.progress.implementation.complete, 'Implementation should be complete');

    // Verify parent is still incomplete
    const unchangedParent = await helper.readPlanFile(mainPlanFile);
    helper.assertEqual(unchangedParent.status, 'active', 'Parent should still be active');
    helper.assertEqual(unchangedParent.phase, 'scope_analysis', 'Parent should be at initial phase');
  });

  test('Subtask references are preserved across parent updates', async () => {
    // Create main plan with subtasks
    await fs.mkdir('.llms', { recursive: true });
    const mainPlan = await generatePlan('Reference Test', 'reference-test', {
      workflow: 'medium',
      baseDir: helper.testDir
    });
    const mainPlanFile = '.llms/.dev-plan-main.yaml';

    // Add subtask references
    mainPlan.sub_tasks = [
      {
        description: 'First subtask',
        slug: 'first-subtask',
        priority: 'high',
        status: 'independent',
        type: 'independent_plan',
        plan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-first-subtask.yaml',
        created: new Date().toISOString()
      },
      {
        description: 'Second subtask',
        slug: 'second-subtask',
        priority: 'medium',
        status: 'independent',
        type: 'independent_plan',
        plan_file: '.llms/.dev-plan-main/subtasks/.dev-plan-second-subtask.yaml',
        created: new Date().toISOString()
      }
    ];
    await fs.writeFile(mainPlanFile, yaml.dump(mainPlan));

    // Update main plan through several stages
    const updater = new PlanUpdater(mainPlanFile);
    await updater.updateStage('context_gathering', {
      sectionData: { findings: { test: 'data' } }
    });
    await updater.updateStage('solution_design', {
      sectionData: { artifacts: { design: 'doc' } }
    });

    // Verify subtask references are preserved
    const updatedPlan = await helper.readPlanFile(mainPlanFile);
    helper.assertEqual(updatedPlan.sub_tasks.length, 2, 'Should still have 2 subtask references');
    helper.assertEqual(updatedPlan.sub_tasks[0].description, 'First subtask', 'First subtask reference preserved');
    helper.assertEqual(updatedPlan.sub_tasks[1].description, 'Second subtask', 'Second subtask reference preserved');
    helper.assertEqual(updatedPlan.sub_tasks[0].type, 'independent_plan', 'First subtask type preserved');
    helper.assertEqual(updatedPlan.sub_tasks[1].type, 'independent_plan', 'Second subtask type preserved');
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});
