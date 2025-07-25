/**
 * tools/repair-notion-db.js
 * MCP tool for comprehensive Notion repair functionality
 */

import { runTaskMasterCommand } from '../utils/taskmaster.js';

export function registerRepairNotionTool() {
	return {
		name: 'repair-notion-db',
		description: `Intelligently repair Notion database by removing duplicates and synchronizing missing tasks.
        
This comprehensive repair tool:
- Analyzes current synchronization state
- Removes duplicate pages (keeps most recent)
- Adds missing tasks to Notion
- Cleans up local mapping
- Provides detailed repair report

Use --dry-run to preview changes without making them.`,
		inputSchema: {
			type: 'object',
			properties: {
				dryRun: {
					type: 'boolean',
					description:
						'Show what would be changed without actually making changes',
					default: false
				}
			},
			additionalProperties: false
		},
		handler: async ({ dryRun = false }) => {
			try {
				const args = ['repair-notion-db'];

				if (dryRun) {
					args.push('--dry-run');
				}

				const result = await runTaskMasterCommand(args);

				return {
					success: true,
					output: result.output,
					summary: `Notion repair ${dryRun ? 'simulation' : 'operation'} completed successfully`
				};
			} catch (error) {
				return {
					success: false,
					error: error.message,
					output: error.output || ''
				};
			}
		}
	};
}
