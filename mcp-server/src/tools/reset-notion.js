/**
 * MCP tool for completely resetting the Notion database
 */

import { z } from 'zod';
import { withNormalizedProjectRoot } from './utils.js';
import { resetNotionDB } from '../../../scripts/modules/notion.js';

/**
 * Registers the reset-notion-db MCP tool
 * @param {FastMCP} server - The MCP server instance
 */
export function registerResetNotionTool(server) {
	server.addTool({
		name: 'reset_notion_db',
		description: 'Completely reset the Notion database by archiving all existing pages and recreating them from local tasks. This ensures a clean, ordered synchronization.',
		parameters: z.object({
			projectRoot: z.string().describe('Project root directory path (required)')
		}),
		execute: withNormalizedProjectRoot(async ({ projectRoot }, { log }) => {
			try {
				log.info(`Resetting Notion database for project: ${projectRoot}`);
				const result = await resetNotionDB(projectRoot);

				if (result.success) {
					return {
						success: true,
						message: result.message,
						archivedPages: result.archivedPages,
						summary: `Successfully reset Notion database - archived ${result.archivedPages} existing pages and recreated all tasks in proper order`
					};
				} else {
					return {
						success: false,
						error: result.error
					};
				}
			} catch (error) {
				return {
					success: false,
					error: `Failed to reset Notion database: ${error.message}`
				};
			}
		})
	});
}
