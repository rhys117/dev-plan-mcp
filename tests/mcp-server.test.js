import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

describe('MCP Server Integration', () => {
  let helper;
  let server;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  async function callMcpTool(toolName, args) {
    return new Promise((resolve, reject) => {
      // Start server
      server = spawn('node', ['../dist/index.js'], {
        stdio: ['pipe', 'pipe', 'inherit'],
        cwd: process.cwd()
      });

      let responseData = '';
      let requestId = 1;

      server.stdout.on('data', (data) => {
        responseData += data.toString();
        const lines = responseData.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === requestId) {
              server.kill();
              resolve(response);
              return;
            }
          } catch (e) {
            // Continue parsing
          }
        }
      });

      server.on('error', reject);

      // Send initialization
      const initRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 0
      };

      server.stdin.write(JSON.stringify(initRequest) + '\n');

      // Send tool call
      setTimeout(() => {
        const toolRequest = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args
          },
          id: requestId
        };

        server.stdin.write(JSON.stringify(toolRequest) + '\n');
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        server.kill();
        reject(new Error('Test timeout'));
      }, 5000);
    });
  }

  test('list_workflows returns default workflows', async () => {
    const response = await callMcpTool('list_workflows', {});
    
    helper.assert(response.result, 'Should have result');
    helper.assert(response.result.content, 'Should have content');
    helper.assert(response.result.content[0].text, 'Should have text content');
    
    const content = response.result.content[0].text;
    helper.assertContains(content, 'micro', 'Should list micro workflow');
    helper.assertContains(content, 'epic', 'Should list epic workflow');
    helper.assertContains(content, 'Default Workflow', 'Should list default workflow');
  });

  test('create_workflows_file creates workflows.yml', async () => {
    const response = await callMcpTool('create_workflows_file', { force: true });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Created workflows configuration', 'Should confirm creation');
    
    // Verify file exists
    const exists = await helper.planExists('.llms/workflows.yml');
    helper.assert(exists, 'workflows.yml should be created');
  });

  test('create_plan creates main plan', async () => {
    const response = await callMcpTool('create_plan', {
      taskDescription: 'Test MCP Plan Creation',
      workflow: 'medium',
      priority: 'high'
    });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Main development plan created successfully', 'Should confirm creation');
    helper.assertContains(content, 'test-mcp-plan-creation', 'Should show generated slug');
    
    // Verify file exists
    const exists = await helper.planExists('.llms/.dev-plan-main.yaml');
    helper.assert(exists, 'Main plan should be created');
    
    // Verify plan content
    const plan = await helper.readPlanFile('.llms/.dev-plan-main.yaml');
    helper.assertEqual(plan.task, 'Test MCP Plan Creation', 'Plan should have correct task');
    helper.assertEqual(plan.workflow, 'medium', 'Plan should have correct workflow');
    helper.assertEqual(plan.priority, 'high', 'Plan should have correct priority');
  });

  test('create_plan fails when main plan exists', async () => {
    // Try to create another main plan
    const response = await callMcpTool('create_plan', {
      taskDescription: 'Another Task',
      workflow: 'small'
    });
    
    helper.assert(response.result, 'Should return result');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Main plan file already exists', 'Should reject duplicate creation');
  });

  test('read_plan returns plan content', async () => {
    const response = await callMcpTool('read_plan', {
      planFile: '.llms/.dev-plan-main.yaml'
    });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Test MCP Plan Creation', 'Should return plan content');
    helper.assertContains(content, 'workflow: medium', 'Should show workflow');
  });

  test('list_plans shows created plans', async () => {
    const response = await callMcpTool('list_plans', {});
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Found 1 plan(s)', 'Should count plans correctly');
    helper.assertContains(content, 'Test MCP Plan Creation', 'Should list the plan');
  });

  test('create_subtask_plan creates independent subtask', async () => {
    const response = await callMcpTool('create_subtask_plan', {
      subtaskDescription: 'Add validation logic',
      workflow: 'small',
      priority: 'medium'
    });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Independent subtask plan created', 'Should confirm creation');
    
    // Verify subtask file exists
    const exists = await helper.planExists('.llms/.dev-plan-main/subtasks/.dev-plan-add-validation-logic.yaml');
    helper.assert(exists, 'Subtask plan should be created');
    
    // Verify main plan was updated with subtask reference
    const mainPlan = await helper.readPlanFile('.llms/.dev-plan-main.yaml');
    helper.assertEqual(mainPlan.sub_tasks.length, 1, 'Main plan should have subtask reference');
    helper.assertEqual(mainPlan.sub_tasks[0].description, 'Add validation logic', 'Subtask should be referenced correctly');
  });

  test('update_plan updates stage', async () => {
    const response = await callMcpTool('update_plan', {
      planFile: '.llms/.dev-plan-main.yaml',
      stage: 'context_gathering',
      sectionData: {
        findings: {
          mcp_integration: 'Works well with MCP protocol'
        }
      }
    });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Plan updated successfully', 'Should confirm update');
    helper.assertContains(content, 'context_gathering', 'Should show updated stage');
    
    // Verify plan was updated
    const plan = await helper.readPlanFile('.llms/.dev-plan-main.yaml');
    helper.assertEqual(plan.phase, 'context_gathering', 'Phase should be updated');
    helper.assert(plan.progress.scope_analysis.complete, 'Previous stage should be complete');
    helper.assertEqual(
      plan.progress.context_gathering.findings.mcp_integration,
      'Works well with MCP protocol',
      'Section data should be updated'
    );
  });

  test('get_workflow_next_steps shows progress', async () => {
    const response = await callMcpTool('get_workflow_next_steps', {
      planFile: '.llms/.dev-plan-main.yaml'
    });
    
    helper.assert(response.result, 'Should succeed');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Test MCP Plan Creation', 'Should show plan name');
    helper.assertContains(content, 'context_gathering', 'Should show current phase');
    helper.assertContains(content, 'solution_design', 'Should show next step');
    helper.assertContains(content, 'Full Workflow (medium)', 'Should show workflow progress');
  });


  test('error handling for invalid requests', async () => {
    // Test invalid stage
    const response = await callMcpTool('update_plan', {
      planFile: '.llms/.dev-plan-main.yaml',
      stage: 'invalid_stage'
    });
    
    helper.assert(response.result, 'Should return result');
    const content = response.result.content[0].text;
    helper.assertContains(content, 'Custom stage detected', 'Should handle invalid stage gracefully');
  });

  test('cleanup', async () => {
    if (server && !server.killed) {
      server.kill();
    }
    await helper.cleanup();
  });
});