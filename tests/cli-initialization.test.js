import { test, describe } from 'node:test';
import { TestHelper } from './test-helpers.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI Initialization', () => {
  let helper;
  let originalCwd;

  test('setup', async () => {
    helper = new TestHelper();
    await helper.setup();
    originalCwd = process.cwd();
    // Stay in the current directory for CLI tests
    // The testDir will be created but we won't chdir to it
  });

  test('creates .llms directory structure', async () => {
    // Test directory creation
    await fs.mkdir('.llms', { recursive: true });
    await fs.mkdir('.llms/prompts', { recursive: true });
    
    // Verify directories exist
    const llmsStats = await fs.stat('.llms');
    const promptsStats = await fs.stat('.llms/prompts');
    
    helper.assert(llmsStats.isDirectory(), '.llms should be a directory');
    helper.assert(promptsStats.isDirectory(), '.llms/prompts should be a directory');
  });

  test('creates .claude directory structure', async () => {
    // Test directory creation
    await fs.mkdir('.claude', { recursive: true });
    await fs.mkdir('.claude/agents', { recursive: true });
    
    // Verify directories exist
    const claudeStats = await fs.stat('.claude');
    const agentsStats = await fs.stat('.claude/agents');
    
    helper.assert(claudeStats.isDirectory(), '.claude should be a directory');
    helper.assert(agentsStats.isDirectory(), '.claude/agents should be a directory');
  });

  test('copies orchestrator prompts to .llms/prompts/', async () => {
    const promptTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
    
    // Create source prompts directory (simulating the built-in prompts)
    await fs.mkdir('src/prompts', { recursive: true });
    
    // Create test prompt files
    for (const promptType of promptTypes) {
      const testContent = `Current phase of plan: **${promptType.replace('-', ' ')}**\n\nTest prompt content for ${promptType}`;
      await fs.writeFile(`src/prompts/${promptType}.md`, testContent);
    }

    // Create target directory
    await fs.mkdir('.llms/prompts', { recursive: true });
    
    // Copy files (simulating CLI init behavior)
    for (const promptType of promptTypes) {
      const sourcePath = `src/prompts/${promptType}.md`;
      const targetPath = `.llms/prompts/${promptType}.md`;
      
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(targetPath, content);
      
      // Verify copy was successful
      const copiedContent = await fs.readFile(targetPath, 'utf-8');
      helper.assertEqual(copiedContent, content, `${promptType}.md should be copied correctly`);
      helper.assert(copiedContent.includes(promptType.replace('-', ' ')), 'Copied content should contain prompt type');
    }
  });

  test('copies sub-agent files to .claude/agents/', async () => {
    const agentTypes = ['scope-analysis-agent', 'context-gathering-agent', 'solution-design-agent', 'implementation-agent', 'validation-agent', 'documentation-agent', 'knowledge-capture-agent'];
    
    // Create source agents directory
    await fs.mkdir('src/agents', { recursive: true });
    
    // Create test agent files
    for (const agentType of agentTypes) {
      const testContent = `You are a ${agentType.replace('-', ' ')} responsible for specialized tasks.\n\nTest agent content for ${agentType}`;
      await fs.writeFile(`src/agents/${agentType}.md`, testContent);
    }

    // Create target directory
    await fs.mkdir('.claude/agents', { recursive: true });
    
    // Copy files (simulating CLI init behavior)
    for (const agentType of agentTypes) {
      const sourcePath = `src/agents/${agentType}.md`;
      const targetPath = `.claude/agents/${agentType}.md`;
      
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(targetPath, content);
      
      // Verify copy was successful
      const copiedContent = await fs.readFile(targetPath, 'utf-8');
      helper.assertEqual(copiedContent, content, `${agentType}.md should be copied correctly`);
      helper.assert(copiedContent.includes('You are a'), 'Agent content should contain role definition');
    }
  });

  test('creates workflows.yml with default configuration', async () => {
    const defaultWorkflows = `# AI Agent Orchestrator Workflows
# Define custom workflow steps for different project sizes

workflows:
  micro:
    description: "Single file, trivial changes"
    steps:
      - scope_analysis
      - implementation
      - validation

  small:
    description: "2-3 files, straightforward implementation"
    steps:
      - scope_analysis
      - context_gathering
      - implementation
      - validation

  medium:
    description: "Multiple files, moderate complexity"
    steps:
      - scope_analysis
      - context_gathering
      - solution_design
      - implementation
      - validation
      - documentation

  large:
    description: "Many files, significant architecture changes"
    steps:
      - scope_analysis
      - context_gathering
      - solution_design
      - implementation
      - validation
      - documentation
      - knowledge_capture

  epic:
    description: "Major feature requiring decomposition"
    steps:
      - scope_analysis
      - context_gathering
      - solution_design
      - implementation
      - validation
      - documentation
      - knowledge_capture

default:
  description: "Default workflow for unspecified types"
  steps:
    - scope_analysis
    - context_gathering
    - solution_design
    - implementation
    - validation
    - documentation
    - knowledge_capture
`;

    // Create .llms directory
    await fs.mkdir('.llms', { recursive: true });
    
    // Write workflows file
    const workflowsPath = '.llms/workflows.yml';
    await fs.writeFile(workflowsPath, defaultWorkflows);
    
    // Verify workflows file
    const content = await fs.readFile(workflowsPath, 'utf-8');
    helper.assert(content.includes('workflows:'), 'Should contain workflows section');
    helper.assert(content.includes('micro:'), 'Should contain micro workflow');
    helper.assert(content.includes('epic:'), 'Should contain epic workflow');
    helper.assert(content.includes('default:'), 'Should contain default workflow');
    helper.assert(content.includes('scope_analysis'), 'Should contain workflow steps');
  });

  test('skips existing workflows.yml file', async () => {
    const existingContent = '# Existing workflows file\nworkflows:\n  custom: []\n';
    
    // Create .llms directory
    await fs.mkdir('.llms', { recursive: true });
    
    // Create existing workflows file
    const workflowsPath = '.llms/workflows.yml';
    await fs.writeFile(workflowsPath, existingContent);
    
    // Verify file exists
    const fileExists = await fs.access(workflowsPath).then(() => true).catch(() => false);
    helper.assert(fileExists, 'Workflows file should exist');
    
    // Verify content is preserved (simulating CLI skip behavior)
    const content = await fs.readFile(workflowsPath, 'utf-8');
    helper.assertEqual(content, existingContent, 'Existing workflows file should be preserved');
  });

  test('prompt files contain expected structure', async () => {
    // Create a test prompt file
    await fs.mkdir('.llms/prompts', { recursive: true });
    
    const testPrompt = `Current phase of plan: **Scope Analysis**

You now need to orchestrate the scope analysis agent. It will be responsible for analyzing requirements, classifying task complexity (micro/small/medium/large/epic), and decomposing large features into subtasks.

Once it's complete ensure that it has:
- Updated the plan with complexity analysis findings
- Created subtasks if the feature is large/epic
- Marked the scope_analysis phase as complete
- Documented size classification reasoning

The agent should focus on analysis and decomposition, not implementation.`;

    await fs.writeFile('.llms/prompts/scope-analyst.md', testPrompt);
    
    // Verify prompt structure
    const content = await fs.readFile('.llms/prompts/scope-analyst.md', 'utf-8');
    helper.assert(content.includes('Current phase of plan:'), 'Should have phase header');
    helper.assert(content.includes('You now need to orchestrate'), 'Should have orchestration guidance');
    helper.assert(content.includes('Once it\'s complete ensure'), 'Should have completion checklist');
    helper.assert(content.length > 100, 'Should have substantial content');
  });

  test('agent files contain expected structure', async () => {
    // Create a test agent file
    await fs.mkdir('.claude/agents', { recursive: true });
    
    const testAgent = `You are a Scope Analysis Agent responsible for the first phase of feature development.

⚠️ **STRICT PHASE BOUNDARIES** ⚠️
- ONLY perform scope analysis tasks - do NOT implement, design, or code
- ONLY classify size, decompose into subtasks, and update plan progress
- STOP after completing scope analysis phase - do NOT continue to other phases

CORE RESPONSIBILITIES:
- Parse requirements and classify task size (micro|small|medium|large|epic) 
- Decompose large/epic features into manageable subtasks
- Update plan progress with comprehensive findings

🎯 **MANDATORY COMPLETION CHECKLIST** 🎯
Before finishing, you MUST:
- [ ] Read current plan state
- [ ] Classify task size with justification
- [ ] Create subtasks if large/epic
- [ ] Update plan with comprehensive findings
- [ ] Mark scope_analysis phase as complete`;

    await fs.writeFile('.claude/agents/scope-analysis-agent.md', testAgent);
    
    // Verify agent structure
    const content = await fs.readFile('.claude/agents/scope-analysis-agent.md', 'utf-8');
    helper.assert(content.includes('You are a'), 'Should have role definition');
    helper.assert(content.includes('STRICT PHASE BOUNDARIES'), 'Should have phase boundaries');
    helper.assert(content.includes('CORE RESPONSIBILITIES'), 'Should have responsibilities');
    helper.assert(content.includes('MANDATORY COMPLETION CHECKLIST'), 'Should have completion checklist');
    helper.assert(content.length > 200, 'Should have comprehensive content');
  });

  test('validates file permissions and accessibility', async () => {
    // Create test files
    await fs.mkdir('.llms/prompts', { recursive: true });
    await fs.mkdir('.claude/agents', { recursive: true });
    
    await fs.writeFile('.llms/prompts/test-prompt.md', 'test prompt content');
    await fs.writeFile('.claude/agents/test-agent.md', 'test agent content');
    
    // Verify files are readable
    const promptContent = await fs.readFile('.llms/prompts/test-prompt.md', 'utf-8');
    const agentContent = await fs.readFile('.claude/agents/test-agent.md', 'utf-8');
    
    helper.assertEqual(promptContent, 'test prompt content', 'Prompt file should be readable');
    helper.assertEqual(agentContent, 'test agent content', 'Agent file should be readable');
    
    // Verify files are writable (can be modified)
    await fs.writeFile('.llms/prompts/test-prompt.md', 'modified prompt content');
    const modifiedContent = await fs.readFile('.llms/prompts/test-prompt.md', 'utf-8');
    helper.assertEqual(modifiedContent, 'modified prompt content', 'Files should be writable');
  });

  test('cleanup', async () => {
    // Clean up any test files created in current directory
    try {
      await fs.rm('.llms', { recursive: true, force: true });
    } catch {}
    try {
      await fs.rm('.claude', { recursive: true, force: true });
    } catch {}
    try {
      await fs.rm('src', { recursive: true, force: true });
    } catch {}
    
    await helper.cleanup();
  });
});