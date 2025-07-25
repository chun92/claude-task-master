#!/usr/bin/env node

/**
 * Test script for MCP clear-subtasks direct function
 */

import { clearSubtasksDirect } from './mcp-server/src/core/direct-functions/clear-subtasks.js';
import path from 'path';

async function testMcpClearSubtasks() {
	console.log('🧪 Testing MCP clear-subtasks direct function...\n');

	const projectRoot = process.cwd();
	const tasksJsonPath = path.join(projectRoot, '.taskmaster', 'tasks.json');

	console.log(`📂 Project root: ${projectRoot}`);
	console.log(`📄 Tasks file: ${tasksJsonPath}`);

	// Mock logger
	const mockLogger = {
		info: (...args) => console.log('[INFO]', ...args),
		warn: (...args) => console.log('[WARN]', ...args),
		error: (...args) => console.log('[ERROR]', ...args),
		debug: (...args) => console.log('[DEBUG]', ...args)
	};

	// Test arguments
	const testArgs = {
		tasksJsonPath,
		id: '2', // Test with task 2 which has 1 subtask
		projectRoot,
		tag: 'master'
	};

	console.log('🚀 Testing MCP clearSubtasksDirect with args:', testArgs);

	try {
		const result = await clearSubtasksDirect(testArgs, mockLogger);

		console.log('\n✅ MCP function result:');
		console.log(JSON.stringify(result, null, 2));

		if (result.success) {
			console.log('\n🎉 MCP clear-subtasks completed successfully!');
			console.log('- Function executed without errors');
			console.log(
				'- Notion sync was attempted (may have failed due to no config)'
			);
			console.log('- Result contains proper success response');
		} else {
			console.log('\n❌ MCP clear-subtasks failed:');
			console.log(`Error: ${result.error?.message || 'Unknown error'}`);
		}
	} catch (error) {
		console.error('❌ Error during MCP test:', error.message);
	}
}

// Run the test
testMcpClearSubtasks().catch(console.error);
