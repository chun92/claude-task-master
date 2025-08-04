/**
 * tools/repair-notion.js
 * MCP tool for comprehensive Notion repair functionality
 */

import { z } from 'zod';
import { repairNotionDB } from '../../../scripts/modules/notion.js';
import { 
	createErrorResponse, 
	withNormalizedProjectRoot 
} from './utils.js';

/**
 * Register the repair-notion tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerRepairNotionTool(server) {
	server.addTool({
		name: 'repair_notion',
		description: `Intelligently repair Notion database by removing duplicates and synchronizing missing tasks.
        
This comprehensive repair tool:
- Analyzes current synchronization state
- Removes duplicate pages (keeps most recent)
- Adds missing tasks to Notion
- Cleans up local mapping
- Provides detailed repair report

Use dryRun to preview changes without making them.`,
		parameters: z.object({
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			dryRun: z
				.boolean()
				.optional()
				.describe('Show what would be changed without actually making changes')
		}),
		execute: withNormalizedProjectRoot(async (args, { log }) => {
			try {
				const { projectRoot, dryRun = false } = args;
				log.info(`Repairing Notion database for project: ${projectRoot}`);

				const result = await repairNotionDB(projectRoot, { dryRun });

				return {
					success: true,
					output: result || 'Repair completed successfully',
					summary: `Notion repair ${dryRun ? 'simulation' : 'operation'} completed successfully`
				};
			} catch (error) {
				return createErrorResponse(`Notion repair failed: ${error.message}`);
			}
		})
	});
}
