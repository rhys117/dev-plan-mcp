import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class TestHelper {
  constructor() {
    // Create unique test directory for each test
    this.testDir = `.test-llms-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.originalDir = process.cwd();
  }

  async setup() {
    // Clean up any existing test directory
    await this.cleanup();
    // Create test directory structure
    await fs.mkdir(this.testDir, { recursive: true });
    // Change to test directory for isolated testing
    process.chdir(this.testDir);
    // Ensure .llms exists in test directory with proper permissions
    try {
      await fs.mkdir('.llms', { recursive: true });
    } catch (error) {
      // If mkdir fails, try to ensure the directory exists
      try {
        await fs.access('.llms');
      } catch {
        // Directory doesn't exist, try creating parent first
        await fs.mkdir('.', { recursive: true });
        await fs.mkdir('.llms', { recursive: true });
      }
    }
  }

  async cleanup() {
    // Change back to original directory first
    try {
      process.chdir(this.originalDir);
    } catch (error) {
      // If we can't change directories, we're already in the right place
    }
    
    // Remove test directory with retry
    for (let i = 0; i < 3; i++) {
      try {
        await fs.rm(this.testDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (i === 2) {
          // Last attempt failed, but don't throw - just warn
          console.warn(`Warning: Could not clean up test directory ${this.testDir}`);
        } else {
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }

  async createWorkflowManager() {
    const { WorkflowManager } = await import('../dist/workflows.js');
    return new WorkflowManager(this.testDir);
  }

  async createCustomWorkflows(workflows) {
    // Ensure directory exists with multiple attempts
    for (let i = 0; i < 3; i++) {
      try {
        await fs.mkdir(`${this.testDir}/.llms`, { recursive: true });
        break;
      } catch (error) {
        if (i === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Write workflows file in the test directory
    await fs.writeFile(`${this.testDir}/.llms/workflows.yml`, yaml.dump(workflows));
  }

  async readPlanFile(planPath) {
    const content = await fs.readFile(planPath, 'utf-8');
    return yaml.load(content);
  }

  async planExists(planPath) {
    try {
      await fs.access(planPath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(dir = '.llms') {
    try {
      return await fs.readdir(dir, { recursive: true });
    } catch {
      return [];
    }
  }

  // Mock MCP request/response
  mockMcpCall(toolName, args) {
    return {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };
  }

  // Assert helpers
  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  assertArrayEqual(actual, expected, message) {
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) {
      throw new Error(`${message}: expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
    }
  }

  assertContains(array, item, message) {
    if (!array.includes(item)) {
      throw new Error(`${message}: expected array to contain ${item}`);
    }
  }

  assertObjectHasKeys(obj, keys, message) {
    const actualKeys = Object.keys(obj);
    for (const key of keys) {
      if (!actualKeys.includes(key)) {
        throw new Error(`${message}: expected object to have key '${key}'`);
      }
    }
  }
}