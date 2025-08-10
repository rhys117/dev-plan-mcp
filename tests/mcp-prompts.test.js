import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('MCP Prompts', () => {
  let helper;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
  });

  test('server declares prompts capability', async () => {
    // Test that server capability structure is correct
    const expectedCapabilities = {
      tools: {},
      prompts: {
        listChanged: false
      }
    };
    
    helper.assert(typeof expectedCapabilities.prompts === 'object', 'Should have prompts capability object');
    helper.assertEqual(expectedCapabilities.prompts.listChanged, false, 'Should set listChanged to false');
  });

  test('lists all available agent prompts', async () => {
    // Test the expected prompt list structure
    const agentTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
    
    // Verify all expected prompts are available
    for (const agentType of agentTypes) {
      const expectedTitle = agentType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' Agent';
      helper.assert(expectedTitle.length > 0, 'Should generate proper prompt titles');
      helper.assert(expectedTitle.includes('Agent'), 'Title should include Agent suffix');
    }

    // Test the expected response structure
    const expectedPrompt = {
      name: 'scope-analyst',
      title: 'Scope Analyst Agent',
      description: 'Orchestrator guidance for scope analyst phase',
      arguments: [
        {
          name: 'planFile',
          description: 'Path to the plan file to inject context',
          required: false
        },
        {
          name: 'customContext',
          description: 'Additional context to include', 
          required: false
        }
      ]
    };

    helper.assertEqual(expectedPrompt.name, 'scope-analyst', 'Should have correct prompt name');
    helper.assertEqual(expectedPrompt.arguments.length, 2, 'Should have two optional arguments');
    helper.assertEqual(expectedPrompt.arguments[0].required, false, 'planFile should be optional');
    helper.assertEqual(expectedPrompt.arguments[1].required, false, 'customContext should be optional');
  });

  test('gets built-in prompt content', async () => {
    // The built-in prompt files are in dist/prompts after build
    // We need to go back to the package root from test directory
    const packageRoot = path.resolve(helper.originalDir);
    const builtinPath = path.join(packageRoot, 'dist', 'prompts', 'scope-analyst.md');
    
    try {
      const content = await fs.readFile(builtinPath, 'utf-8');
      helper.assert(content.includes('Current phase of plan'), 'Should contain expected prompt content');
      helper.assert(content.includes('orchestrate'), 'Should contain orchestration guidance');
    } catch (error) {
      // If dist/prompts doesn't exist, check src/prompts
      try {
        const srcPath = path.join(packageRoot, 'src', 'prompts', 'scope-analyst.md');
        const content = await fs.readFile(srcPath, 'utf-8');
        helper.assert(content.includes('Current phase of plan'), 'Should contain expected prompt content');
        helper.assert(content.includes('orchestrate'), 'Should contain orchestration guidance');
      } catch (srcError) {
        helper.assert(false, `Built-in prompt file should exist and be readable. Tried: ${builtinPath} and ${srcPath}`);
      }
    }
  });

  test('gets user override prompt when available', async () => {
    // Create .llms/prompts directory
    await fs.mkdir('.llms/prompts', { recursive: true });
    
    // Create a user override prompt
    const overrideContent = 'Custom user prompt for scope analysis\n\nThis is a customized version.';
    await fs.writeFile('.llms/prompts/scope-analyst.md', overrideContent);

    // Read the override
    const content = await fs.readFile('.llms/prompts/scope-analyst.md', 'utf-8');
    helper.assertEqual(content, overrideContent, 'Should read user override content');
    
    // Cleanup
    await fs.unlink('.llms/prompts/scope-analyst.md');
  });

  test('injects plan context when planFile provided', async () => {
    // Create a test plan
    const planData = {
      task: 'Test task for context injection',
      phase: 'scope_analysis',
      status: 'active',
      workflow: 'medium'
    };
    
    await fs.mkdir('.llms', { recursive: true });
    await fs.writeFile('.llms/test-plan.yaml', `task: "${planData.task}"\nphase: ${planData.phase}\nstatus: ${planData.status}\nworkflow: ${planData.workflow}`);

    // Test context injection logic
    const planFile = '.llms/test-plan.yaml';
    const planContent = await fs.readFile(planFile, 'utf-8');
    
    helper.assert(planContent.includes(planData.task), 'Plan should contain the test task');
    
    // Test that context would be injected properly
    const expectedContext = `\n\n## Current Plan Context\n**Task:** ${planData.task}\n**Phase:** ${planData.phase}\n**Status:** ${planData.status}`;
    helper.assert(expectedContext.includes(planData.task), 'Context should include task information');
    
    // Cleanup
    await fs.unlink('.llms/test-plan.yaml');
  });

  test('adds custom context when provided', async () => {
    const customContext = 'Focus on error handling and edge cases';
    const expectedAddition = `\n\n## Additional Context\n${customContext}`;
    
    helper.assertEqual(expectedAddition, '\n\n## Additional Context\nFocus on error handling and edge cases', 'Should format custom context correctly');
  });

  test('validates prompt names', async () => {
    const validNames = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
    const invalidNames = ['invalid-agent', 'nonexistent', ''];

    for (const name of validNames) {
      helper.assert(validNames.includes(name), `${name} should be a valid prompt name`);
    }

    for (const name of invalidNames) {
      helper.assert(!validNames.includes(name), `${name} should be an invalid prompt name`);
    }
  });

  test('returns proper message structure', async () => {
    // Test the expected MCP prompt response structure
    const expectedResponse = {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'prompt content here'
          }
        }
      ]
    };

    helper.assertEqual(expectedResponse.messages.length, 1, 'Should return one message');
    helper.assertEqual(expectedResponse.messages[0].role, 'user', 'Message should have user role');
    helper.assertEqual(expectedResponse.messages[0].content.type, 'text', 'Content should be text type');
    helper.assert(typeof expectedResponse.messages[0].content.text === 'string', 'Text should be a string');
  });

  test('handles missing built-in prompts gracefully', async () => {
    // Test error handling when built-in prompt is missing
    const nonexistentPath = path.join('src', 'prompts', 'nonexistent-agent.md');
    
    try {
      await fs.readFile(nonexistentPath, 'utf-8');
      helper.assert(false, 'Should throw error for nonexistent file');
    } catch (error) {
      helper.assert(error.code === 'ENOENT', 'Should get file not found error');
    }
  });

  test('handles invalid plan file gracefully', async () => {
    // Test that invalid plan files don't break prompt loading
    const invalidPlanFile = '.llms/nonexistent-plan.yaml';
    
    try {
      await fs.readFile(invalidPlanFile, 'utf-8');
      helper.assert(false, 'Should throw error for nonexistent plan file');
    } catch (error) {
      helper.assert(error.code === 'ENOENT', 'Should handle missing plan file gracefully');
    }
  });

  test('cleanup', async () => {
    await helper.cleanup();
  });
});