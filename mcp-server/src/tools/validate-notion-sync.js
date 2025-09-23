/**
 * tools/validate-notion-sync.js
 * Tool to validate Notion synchronization integrity
 */

import { z } from 'zod';
import { validateNotionSync } from '../../../scripts/modules/notion.js';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';

/**
 * Register the validateNotionSync tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerValidateNotionSyncTool(server) {
	server.addTool({
		name: 'validate_notion_sync',
		description:
			'Validate the integrity of Notion synchronization by comparing local tasks with Notion pages. Reports duplicates, missing tasks, extra tasks, and mapping issues.',
		parameters: z.object({
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info(`Validating Notion sync for project: ${args.projectRoot}`);

				const report = await validateNotionSync(args.projectRoot);

				if (report.success) {
					const hasIssues =
						report.duplicatesInNotion.length > 0 ||
						report.missingInNotion.length > 0 ||
						report.extraInNotion.length > 0 ||
						report.mappingIssues.length > 0;

					const message = hasIssues
						? `Found ${report.duplicatesInNotion.length} duplicates, ${report.missingInNotion.length} missing, ${report.extraInNotion.length} extra tasks`
						: 'No sync issues found - Notion sync is healthy!';

					log.info(message);

					return {
						success: true,
						summary: {
							localTaskCount: report.localTaskCount,
							notionPageCount: report.notionPageCount,
							notionTaskIdCount: report.notionTaskIdCount,
							hasIssues: hasIssues
						},
						issues: {
							duplicatesInNotion: report.duplicatesInNotion,
							missingInNotion: report.missingInNotion,
							extraInNotion: report.extraInNotion,
							mappingIssues: report.mappingIssues
						},
						recommendations: hasIssues
							? [
									'Run repair_notion_duplicates tool to fix duplicate issues',
									'Run force_notion_sync tool to resynchronize missing or extra tasks'
								]
							: ['No issues found - Notion sync is healthy!'],
						message: message
					};
				} else {
					log.error(`Failed to validate Notion sync: ${report.error}`);
					return createErrorResponse(report.error);
				}
			} catch (error) {
				log.error(`Error validating Notion sync: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}
