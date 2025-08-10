#!/usr/bin/env node

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeSystem() {
  console.log('🚀 Initializing AI Agent Orchestrator System...\n');

  try {
    // Determine the current working directory (should be project root)
    const projectRoot = process.cwd();
    console.log(`📍 Project root: ${projectRoot}\n`);

    // 1. Create .llms directory structure
    console.log('📁 Creating .llms directory structure...');
    await fs.mkdir(path.join(projectRoot, '.llms'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.llms/prompts'), { recursive: true });
    console.log('✅ Created .llms/prompts/\n');

    // 2. Create .claude directory structure  
    console.log('📁 Creating .claude directory structure...');
    await fs.mkdir(path.join(projectRoot, '.claude'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude/agents'), { recursive: true });
    console.log('✅ Created .claude/agents/\n');

    // 3. Copy prompt templates to .llms/prompts/
    console.log('📝 Installing orchestrator prompts...');
    const promptTypes = ['scope-analyst', 'context-gatherer', 'solution-designer', 'implementer', 'validator', 'documenter', 'knowledge-capturer'];
    
    for (const promptType of promptTypes) {
      // Always look in src directory for templates, even when running from dist
      const srcDir = __dirname.includes('dist') ? path.join(__dirname, '..', 'src') : __dirname;
      const sourcePath = path.join(srcDir, 'prompts', `${promptType}.md`);
      const targetPath = path.join(projectRoot, '.llms', 'prompts', `${promptType}.md`);
      
      try {
        const content = await fs.readFile(sourcePath, 'utf-8');
        await fs.writeFile(targetPath, content);
        console.log(`  ✅ ${promptType}.md`);
      } catch (error) {
        console.log(`  ❌ Failed to copy ${promptType}.md: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log('');

    // 4. Copy sub-agent templates to .claude/agents/
    console.log('🤖 Installing Claude Code sub-agents...');
    
    try {
      const agentsSourceDir = path.join(__dirname, 'agents');
      const agentFiles = await fs.readdir(agentsSourceDir);
      
      for (const agentFile of agentFiles.filter(f => f.endsWith('.md'))) {
        const sourcePath = path.join(agentsSourceDir, agentFile);
        const targetPath = path.join(projectRoot, '.claude', 'agents', agentFile);
        
        try {
          const content = await fs.readFile(sourcePath, 'utf-8');
          await fs.writeFile(targetPath, content);
          console.log(`  ✅ ${agentFile}`);
        } catch (error) {
          console.log(`  ❌ Failed to copy ${agentFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Failed to read agents directory: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');

    // 5. Create workflows.yml if it doesn't exist
    console.log('⚙️  Setting up workflows configuration...');
    const workflowsPath = path.join(projectRoot, '.llms/workflows.yml');
    
    try {
      await fs.access(workflowsPath);
      console.log('  ℹ️  workflows.yml already exists, skipping');
    } catch {
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
      
      await fs.writeFile(workflowsPath, defaultWorkflows);
      console.log('  ✅ Created workflows.yml');
    }
    console.log('');

    // 6. Copy slash command templates to .claude/commands/
    console.log('⚡ Installing Claude Code slash commands...');
    await fs.mkdir(path.join(projectRoot, '.claude'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.claude/commands'), { recursive: true });
    
    const slashCommands = [
      { name: 'plan', description: 'Create and orchestrate development plans' },
      { name: 'execute-plan', description: 'Execute next phase of active plan' },
      { name: 'execute-full-plan', description: 'Execute all remaining phases sequentially' }
    ];
    
    for (const command of slashCommands) {
      // Always look in src directory for templates, even when running from dist
      const srcDir = __dirname.includes('dist') ? path.join(__dirname, '..', 'src') : __dirname;
      const sourcePath = path.join(srcDir, 'slash-commands', `${command.name}.md`);
      const targetPath = path.join(projectRoot, '.claude', 'commands', `${command.name}.md`);
      
      try {
        const content = await fs.readFile(sourcePath, 'utf-8');
        await fs.writeFile(targetPath, content);
        console.log(`  ✅ /${command.name} - ${command.description}`);
      } catch (error) {
        console.log(`  ❌ Failed to copy ${command.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log('');

    // 7. Success message
    console.log('🎉 AI Agent Orchestrator System initialized successfully!\n');
    
    console.log('📋 What was created:');
    console.log('  📁 .llms/prompts/             - Orchestrator guidance prompts');
    console.log('  📁 .claude/agents/            - Claude Code sub-agents');
    console.log('  📁 .claude/commands/          - Claude Code slash commands');
    console.log('  ⚙️  .llms/workflows.yml       - Workflow configuration\n');
    
    console.log('🚀 Next steps:');
    console.log('  1. Customize prompts in .llms/prompts/ for your project');
    console.log('  2. Modify workflows in .llms/workflows.yml if needed');
    console.log('  3. Start the MCP server: cd vendor/ai-orchestrator-ruby/mcp-plan-server && npm start');
    console.log('  4. Create your first plan with Claude Code + MCP integration\n');
    
    console.log('💡 Usage:');
    console.log('  - Create plans: /plan "task description" [workflow-type]');
    console.log('  - Execute next phase: /execute-plan [plan-file]');
    console.log('  - Execute full workflow: /execute-full-plan [plan-file]');
    console.log('  - Use orchestrator prompts: /prompt scope-analyst');
    console.log('  - Spawn sub-agents: Use Task tool with agent files');
    console.log('  - Manage plans: Use MCP tools (create_plan, update_plan, etc.)\n');

  } catch (error) {
    console.error('❌ Initialization failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Parse command line arguments
const command = process.argv[2];

if (command === 'init') {
  initializeSystem();
} else {
  console.log('AI Agent Orchestrator CLI\n');
  console.log('Usage:');
  console.log('  npm run init     Initialize the agent system');
  console.log('  mcp-plan-init    Initialize the agent system (if installed globally)');
}