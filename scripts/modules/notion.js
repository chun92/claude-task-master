import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
	COMPLEXITY_REPORT_FILE,
	TASKMASTER_TASKS_FILE
} from '../../src/constants/paths.js';
import { currentTaskMaster } from '../../src/task-master.js';
import { getCurrentTag, log, readJSON } from './utils.js';

const LOG_TAG = '[NOTION]';
let logger = {
	// Wrapper for CLI
	info: (...args) => log('info', LOG_TAG, ...args),
	warn: (...args) => log('warn', LOG_TAG, ...args),
	error: (...args) => log('error', LOG_TAG, ...args),
	debug: (...args) => log('debug', LOG_TAG, ...args),
	success: (...args) => log('success', LOG_TAG, ...args)
};

// --- Notion config validation ---
let NOTION_TOKEN,
	NOTION_DATABASE_ID,
	notion,
	isNotionEnabled = false,
	notionConfigError = '';

async function validateNotionConfig(env) {
	if (!env.NOTION_TOKEN) {
		notionConfigError = `NOTION_TOKEN is missing.`;
		return false;
	}
	if (!env.NOTION_DATABASE_ID) {
		notionConfigError = `NOTION_DATABASE_ID is missing.`;
		return false;
	}
	try {
		const testNotion = new Client({ auth: env.NOTION_TOKEN });
		// Validate token/DB ID by making a real Notion API call
		await testNotion.databases.retrieve({
			database_id: env.NOTION_DATABASE_ID
		});
		return true;
	} catch (e) {
		notionConfigError = `Config validation failed: ${e.message}`;
		return false;
	}
}

let notionInitPromise = null;
function initNotion() {
	if (!notionInitPromise) {
		notionInitPromise = (async () => {
			const env = loadNotionEnv();
			NOTION_TOKEN = env.NOTION_TOKEN;
			NOTION_DATABASE_ID = env.NOTION_DATABASE_ID;
			isNotionEnabled = await validateNotionConfig(env);
			notion = isNotionEnabled ? new Client({ auth: NOTION_TOKEN }) : null;
			if (!isNotionEnabled) {
				logger.error(notionConfigError);
			} else {
				logger.info(`Notion initialized: ${isNotionEnabled}`);
			}
		})();
	}
	return notionInitPromise;
}

function setMcpLoggerForNotion(mcpLogger) {
	logger = {
		info: (...args) => mcpLogger.info('[NOTION]', ...args),
		warn: (...args) => mcpLogger.warn('[NOTION]', ...args),
		error: (...args) => mcpLogger.error('[NOTION]', ...args),
		debug: (...args) =>
			mcpLogger.debug ? mcpLogger.debug('[NOTION]', ...args) : null,
		success: (...args) =>
			mcpLogger.success
				? mcpLogger.success('[NOTION]', ...args)
				: mcpLogger.info('[NOTION]', ...args)
	};
}

const TASKMASTER_NOTION_SYNC_FILE = '.taskmaster/notion-sync.json';

/**
 * Loads .env file and returns Notion credentials (token, database id)
 * @param {string} [envPath] - Optional path to .env file (default: project root)
 * @returns {{ NOTION_TOKEN: string, NOTION_DATABASE_ID: string }}
 */
function formatAsUUID(id) {
	// If already UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), return as is
	if (
		/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
			id
		)
	) {
		return id;
	}
	// Remove all non-hex chars
	const hex = (id || '').replace(/[^0-9a-fA-F]/g, '');
	if (hex.length !== 32) return id; // Not a valid Notion DB id
	// Insert dashes
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function loadNotionEnv(envPath) {
	// Default: look for .env in project root
	let envFile = envPath;
	if (!envFile) {
		// Try cwd, then parent
		const cwdEnv = path.join(process.cwd(), '.env');
		if (fs.existsSync(cwdEnv)) {
			envFile = cwdEnv;
		} else {
			const parentEnv = path.join(path.dirname(process.cwd()), '.env');
			envFile = fs.existsSync(parentEnv) ? parentEnv : null;
		}
	}
	let envVars = {};
	if (envFile && fs.existsSync(envFile)) {
		envVars = dotenv.parse(fs.readFileSync(envFile));
	} else {
		// fallback to process.env
		envVars = process.env;
	}
	return {
		NOTION_TOKEN: envVars.NOTION_TOKEN || '',
		NOTION_DATABASE_ID: formatAsUUID(envVars.NOTION_DATABASE_ID || '')
	};
}

/**

/**
 * Reads the COMPLEXITY_REPORT_FILE and returns an array of { id, complexityScore, title } objects.
 * Only extracts id, complexityScore, and title from the complexityAnalysis array.
 * @param {string} [file] - Optional path to the complexity report file (default: COMPLEXITY_REPORT_FILE)
 * @returns {Array<{id: number|string, complexityScore: number, title: string}>}
 */
function getTaskComplexityInfo(projectRoot, tag) {
	try {
		const taskMaster = currentTaskMaster;
		let file;
		if (taskMaster) {
			file = taskMaster.getComplexityReportPath();
		} else {
			// If tag is provided and not 'master', use the new filename convention
			if (tag && tag !== 'master') {
				const extIdx = COMPLEXITY_REPORT_FILE.lastIndexOf('.json');
				if (extIdx !== -1) {
					file = path.resolve(
						projectRoot,
						COMPLEXITY_REPORT_FILE.slice(0, extIdx) + `_${tag}.json`
					);
				} else {
					// fallback if .json not found
					file = path.resolve(projectRoot, COMPLEXITY_REPORT_FILE + `_${tag}`);
				}
			} else {
				file = path.resolve(projectRoot, COMPLEXITY_REPORT_FILE);
			}
		}
		if (!fs.existsSync(file)) {
			logger.error(`Complexity report file not found: ${file}`);
			return [];
		}
		const data = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (!Array.isArray(data.complexityAnalysis)) {
			logger.error(`Invalid complexityAnalysis format in ${file}`);
			return [];
		}
		const result = [];
		for (const entry of data.complexityAnalysis) {
			if (
				entry &&
				typeof entry.taskId !== 'undefined' &&
				typeof entry.complexityScore !== 'undefined' &&
				typeof entry.taskTitle === 'string'
			) {
				result.push({
					id: entry.taskId,
					complexityScore: entry.complexityScore,
					title: entry.taskTitle
				});
			}
		}
		return result;
	} catch (e) {
		logger.error('Failed to read task complexity info:', e);
		return [];
	}
}

/**
 * Compares two objects (previous, current), normalizes them, and returns a list of changes (added, deleted, updated).
 * @param {Object} previous - Previous tasks object
 * @param {Object} current - Current tasks object
 * @returns {Array<{id: number, type: 'added'|'deleted'|'updated', prev?: Object, cur?: Object}>}
 */
function diffTasks(previous, current) {
	const debug = process.env.TASKMASTER_DEBUG || false;
	// Defensive: treat null/undefined as empty object
	const prevObj = previous && typeof previous === 'object' ? previous : {};
	const curObj = current && typeof current === 'object' ? current : {};

	// Get all tag names
	const prevTags = Object.keys(prevObj).filter(
		(tag) => prevObj[tag] && Array.isArray(prevObj[tag].tasks)
	);
	const curTags = Object.keys(curObj).filter(
		(tag) => curObj[tag] && Array.isArray(curObj[tag].tasks)
	);
	const allTags = Array.from(new Set([...prevTags, ...curTags]));

	const changes = [];

	for (const tag of allTags) {
		const prevTagTasks = prevObj[tag]?.tasks || [];
		const curTagTasks = curObj[tag]?.tasks || [];

		// If tag exists only in prev, all tasks/subtasks in prev are deleted
		if (prevTags.includes(tag) && !curTags.includes(tag)) {
			// flatten prevTagTasks
			for (const change of flattenTasksWithTag(prevTagTasks, tag)) {
				changes.push({
					id: change.id,
					type: 'deleted',
					prev: change.task,
					tag
				});
			}
			continue;
		}
		// If tag exists only in cur, all tasks/subtasks in cur are added
		if (!prevTags.includes(tag) && curTags.includes(tag)) {
			for (const change of flattenTasksWithTag(curTagTasks, tag)) {
				changes.push({ id: change.id, type: 'added', cur: change.task, tag });
			}
			continue;
		}
		// If tag exists in both, compare as before
		const prevMap = flattenTasksMap(prevTagTasks);
		const curMap = flattenTasksMap(curTagTasks);

		// deleted/updated
		for (const [id, prevTask] of prevMap.entries()) {
			if (!curMap.has(id)) {
				changes.push({ id, type: 'deleted', prev: prevTask, tag });
			} else {
				const curTask = curMap.get(id);
				if (!isTaskEqual(prevTask, curTask)) {
					changes.push({
						id,
						type: 'updated',
						prev: prevTask,
						cur: curTask,
						tag
					});
				}
			}
		}
		// added
		for (const [id, curTask] of curMap.entries()) {
			if (!prevMap.has(id)) {
				changes.push({ id, type: 'added', cur: curTask, tag });
			}
		}
	}

	// --- moved detection ---
	// 1. Extract only added and deleted
	const added = changes.filter((c) => c.type === 'added');
	const deleted = changes.filter((c) => c.type === 'deleted');
	const moved = [];

	// 2. Compare deleted and added to each other
	for (const del of deleted) {
		for (const add of added) {
			// moved criteria: if title, description, details, testStrategy, status are all equal, treat as moved
			const fields = [
				'title',
				'description',
				'details',
				'testStrategy',
				'status'
			];
			let same = true;
			for (const f of fields) {
				const prevVal = del.prev?.[f] || '';
				const curVal = add.cur?.[f] || '';
				if (prevVal !== curVal) {
					same = false;
					break;
				}
			}
			if (same) {
				moved.push({
					id: del.id, // prev id
					cur_id: add.id, // new id
					type: 'moved',
					prev: del.prev,
					cur: add.cur,
					prev_tag: del.tag,
					tag: add.tag
				});
				// Mark as matched so it won't be compared again
				del._matched = true;
				add._matched = true;
				break;
			}
		}
	}

	// 3. Remove items classified as moved from added/deleted
	const finalChanges = [
		...changes.filter((c) => c.type !== 'added' && c.type !== 'deleted'),
		...added.filter((a) => !a._matched),
		...deleted.filter((d) => !d._matched),
		...moved
	];

	// --- batch debug output ---
	if (debug) {
		for (const c of finalChanges) {
			if (c.type === 'added') {
				logger.debug(`[ADDED][${c.tag}] id=${c.id}`, c.cur);
			} else if (c.type === 'deleted') {
				logger.debug(`[DELETED][${c.tag}] id=${c.id}`, c.prev);
			} else if (c.type === 'updated') {
				logger.debug(`[UPDATED][${c.tag}] id=${c.id}`);
				printTaskDiff(c.prev, c.cur, c.tag, c.tag);
			} else if (c.type === 'moved') {
				const oldTag = c.prev_tag;
				const newTag = c.tag;
				logger.debug(`[MOVED] [${oldTag}] ${c.id} => [${newTag}] ${c.cur_id}`);
				printTaskDiff(c.prev, c.cur, oldTag, newTag);
			}
		}
	}

	return finalChanges;
}

// Helper: flatten tasks/subtasks for a tag, returns array of {id, task}
function flattenTasksWithTag(tasks, tag) {
	const arr = [];
	for (const t of tasks) {
		let flattenedSubtaskIds = [];
		if (Array.isArray(t.subtasks)) {
			// Filter out subtasks with undefined IDs and collect valid subtask ids
			const validSubtasks = t.subtasks.filter(
				(st) => st.id !== undefined && st.id !== null
			);
			const subtaskIds = validSubtasks.map((st) => st.id);
			flattenedSubtaskIds = validSubtasks.map((st) => `${t.id}.${st.id}`);

			for (const st of validSubtasks) {
				const subId = `${t.id}.${st.id}`;
				// Convert dependencies
				let newDeps = st.dependencies;
				if (Array.isArray(st.dependencies)) {
					newDeps = st.dependencies.map((dep) => {
						if (typeof dep === 'string' && dep.includes('.')) return dep;
						if (
							(typeof dep === 'number' ||
								(typeof dep === 'string' && /^\d+$/.test(dep))) &&
							subtaskIds.includes(Number(dep))
						) {
							return `${t.id}.${dep}`;
						}
						return dep;
					});
				}
				// Inherit priority from parent if not set
				const subtaskPriority =
					st.priority !== undefined ? st.priority : t.priority;
				arr.push({
					id: subId,
					task: {
						...st,
						id: subId,
						dependencies: newDeps,
						_parentId: t.id,
						_isSubtask: true,
						priority: subtaskPriority
					},
					tag
				});
			}
		}
		// Replace subtasks field with flattenedSubtaskIds
		arr.push({
			id: t.id,
			task: { ...t, _isSubtask: false, subtasks: flattenedSubtaskIds },
			tag
		});
	}
	return arr;
}

// Helper: flatten tasks/subtasks for a tag, returns Map(id, task)
function flattenTasksMap(tasks) {
	const map = new Map();
	for (const t of tasks) {
		let flattenedSubtaskIds = [];
		if (Array.isArray(t.subtasks)) {
			// Filter out subtasks with undefined IDs and collect valid subtask ids
			const validSubtasks = t.subtasks.filter(
				(st) => st.id !== undefined && st.id !== null
			);
			const subtaskIds = validSubtasks.map((st) => st.id);
			flattenedSubtaskIds = validSubtasks.map((st) => `${t.id}.${st.id}`);

			for (const st of validSubtasks) {
				const subId = `${t.id}.${st.id}`;
				let newDeps = st.dependencies;
				if (Array.isArray(st.dependencies)) {
					newDeps = st.dependencies.map((dep) => {
						if (typeof dep === 'string' && dep.includes('.')) return dep;
						if (
							(typeof dep === 'number' ||
								(typeof dep === 'string' && /^\d+$/.test(dep))) &&
							subtaskIds.includes(Number(dep))
						) {
							return `${t.id}.${dep}`;
						}
						return dep;
					});
				}
				// Inherit priority from parent if not set
				const subtaskPriority =
					st.priority !== undefined ? st.priority : t.priority;
				map.set(subId, {
					...st,
					id: subId,
					dependencies: newDeps,
					_parentId: t.id,
					_isSubtask: true,
					priority: subtaskPriority
				});
			}
		}
		// Replace subtasks field with flattenedSubtaskIds
		map.set(t.id, { ...t, _isSubtask: false, subtasks: flattenedSubtaskIds });
	}
	return map;
}

// Helper: compare two tasks or subtasks (compares dependencies and subtasks arrays)
function isTaskEqual(a, b) {
	if (!a || !b) return false;
	// Compare all primitive fields except dependencies and subtasks
	const keys = [
		'title',
		'description',
		'details',
		'testStrategy',
		'priority',
		'status'
	];
	for (const k of keys) {
		if (a[k] !== b[k]) return false;
	}
	// Compare dependencies array (order matters)
	const arrA = Array.isArray(a.dependencies) ? a.dependencies : [];
	const arrB = Array.isArray(b.dependencies) ? b.dependencies : [];
	if (arrA.length !== arrB.length) return false;
	for (let i = 0; i < arrA.length; i++) {
		if (arrA[i] !== arrB[i]) return false;
	}
	// Compare subtasks array (order matters)
	const subA = Array.isArray(a.subtasks) ? a.subtasks : [];
	const subB = Array.isArray(b.subtasks) ? b.subtasks : [];
	if (subA.length !== subB.length) return false;
	for (let i = 0; i < subA.length; i++) {
		if (subA[i] !== subB[i]) return false;
	}
	return true;
}

// Helper: pretty print diff between two tasks or subtasks (now includes dependencies and subtasks array)
function printTaskDiff(a, b, prev_tag, cur_tag) {
	const keys = [
		'id',
		'title',
		'description',
		'details',
		'testStrategy',
		'priority',
		'status',
		'tag'
	];
	for (const k of keys) {
		if (a[k] !== b[k]) {
			logger.debug(`  ${k}:`, a[k], '=>', b[k]);
		}
	}
	// Print dependencies diff
	const arrA = Array.isArray(a.dependencies) ? a.dependencies : [];
	const arrB = Array.isArray(b.dependencies) ? b.dependencies : [];
	if (arrA.length !== arrB.length || arrA.some((v, i) => v !== arrB[i])) {
		logger.debug('  dependencies:', arrA, '=>', arrB);
	}
	// Print subtasks diff
	const subA = Array.isArray(a.subtasks) ? a.subtasks : [];
	const subB = Array.isArray(b.subtasks) ? b.subtasks : [];
	if (subA.length !== subB.length || subA.some((v, i) => v !== subB[i])) {
		logger.debug('  subtasks:', subA, '=>', subB);
	}
	// Print tag diff
	if (prev_tag !== cur_tag) {
		logger.debug(
			`  tag: ${prev_tag || 'undefined'} => ${cur_tag || 'undefined'}`
		);
	}
}

// --- Notion sync mapping helpers (tag -> id -> notionPageId) ---

/**
 * Loads the Notion sync mapping file. Returns { mapping, meta } object.
 * If file does not exist, returns empty mapping/meta.
 */
function loadNotionSyncMapping(mappingFile) {
	try {
		if (fs.existsSync(mappingFile)) {
			const data = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
			return {
				mapping: data.mapping || {},
				meta: data.meta || {}
			};
		}
	} catch (e) {
		logger.error(`Failed to load Notion sync mapping:`, e);
	}
	return { mapping: {}, meta: {} };
}

/**
 * Saves the Notion sync mapping file. mapping: {tag: {id: notionId}}, meta: object
 */
function saveNotionSyncMapping(mapping, meta = {}, mappingFile) {
	try {
		const data = { mapping, meta };
		fs.writeFileSync(mappingFile, JSON.stringify(data, null, 2), 'utf8');
	} catch (e) {
		logger.error(`Failed to save Notion sync mapping:`, e);
	}
}

/**
 * Get Notion page id for a given tag and id. Returns undefined if not found.
 */
function getNotionPageId(mapping, tag, id) {
	return mapping?.[tag]?.[id];
}

/**
 * Set Notion page id for a given tag and id. Returns new mapping object.
 */
function setNotionPageId(mapping, tag, id, notionId) {
	const newMapping = { ...mapping };
	if (!newMapping[tag]) newMapping[tag] = {};
	newMapping[tag][id] = notionId;
	return newMapping;
}

/**
 * Remove Notion page id for a given tag and id. Returns new mapping object.
 */
function removeNotionPageId(mapping, tag, id) {
	const newMapping = { ...mapping };
	if (newMapping[tag]) {
		delete newMapping[tag][id];
		if (Object.keys(newMapping[tag]).length === 0) {
			delete newMapping[tag];
		}
	}
	return newMapping;
}

// Helper: Split long text into 2000-char chunks, word-wrap aware
function splitRichTextByWord(content, chunkSize = 2000) {
	if (!content) return [];
	const result = [];
	let start = 0;
	while (start < content.length) {
		let end = Math.min(start + chunkSize, content.length);
		if (end < content.length) {
			// Find last space within chunk
			const lastSpace = content.lastIndexOf(' ', end);
			if (lastSpace > start + chunkSize * 0.7) {
				end = lastSpace;
			}
		}
		result.push({ text: { content: content.slice(start, end) } });
		start = end;
		if (content[start] === ' ') start++;
	}
	return result;
}

// --- Notion-related API functions start here ---
// Notion property mapping function
function buildNotionProperties(task, tag, now = new Date()) {
	// Date property logic
	const dateProps = buildDateProperties(task, now);

	return {
		title: { title: splitRichTextByWord(task.title || '') },
		description: { rich_text: splitRichTextByWord(task.description || '') },
		details: { rich_text: splitRichTextByWord(task.details || '') },
		testStrategy: { rich_text: splitRichTextByWord(task.testStrategy || '') },
		taskid: { rich_text: splitRichTextByWord(String(task.id)) },
		tag: { rich_text: splitRichTextByWord(tag) },
		priority: task.priority ? { select: { name: task.priority } } : undefined,
		status: task.status ? { status: { name: task.status } } : undefined,
		complexity:
			task.complexity !== undefined ? { number: task.complexity } : undefined,
		...dateProps
	};
}

/**
 * Returns Notion relation properties (dependencies, subtasks) for a task.
 * @param {Object} task
 * @param {string} tag
 * @param {Object} mapping
 * @returns {Object} { dependencies, subtasks }
 */
function buildNotionRelationProperties(task, tag, mapping) {
	// Helper to get Notion page url for a given id (returns undefined if not found)
	function getPageUrl(id) {
		const pageId = getNotionPageId(mapping, tag, id);
		return pageId
			? `https://www.notion.so/${pageId.replace(/-/g, '')}`
			: undefined;
	}

	function buildRichTextLinks(ids, getPageUrl, separator = ', ') {
		const result = [];
		ids.forEach((id, idx) => {
			const url = getPageUrl(id);
			result.push(
				url
					? { type: 'text', text: { content: String(id), link: { url } } }
					: { type: 'text', text: { content: String(id) } }
			);
			// Add separator if not the last element
			if (separator && idx < ids.length - 1) {
				result.push({ type: 'text', text: { content: separator } });
			}
		});
		return result;
	}

	const props = {};
	if (Array.isArray(task.dependencies)) {
		props.dependencies = {
			rich_text: buildRichTextLinks(task.dependencies, getPageUrl)
		};
	}
	if (Array.isArray(task.subtasks)) {
		props.subtasks = {
			rich_text: buildRichTextLinks(task.subtasks, getPageUrl)
		};
	}
	return props;
}

/**
 * Returns startDate and endDate properties for Notion based on task status and current time.
 * - startDate: set/updated if status is in-progress
 * - endDate: set/updated if status is done or cancelled
 * @param {Object} task
 * @param {Date} now
 * @returns {Object} { startDate, endDate }
 */
function buildDateProperties(task, now = new Date()) {
	const isoNow = now.toISOString();
	const props = {};
	// startDate: only update if status is in-progress
	if (task.status === 'in-progress') {
		props.startDate = { date: { start: isoNow } };
	} else if (task.startDate) {
		// preserve existing if present
		props.startDate = { date: { start: task.startDate } };
	}
	// endDate: only update if status is done or cancelled
	if (task.status === 'done' || task.status === 'cancelled') {
		props.endDate = { date: { start: isoNow } };
	} else if (task.endDate) {
		// preserve existing if present
		props.endDate = { date: { start: task.endDate } };
	}
	return props;
}

// --- Exponential backoff retry helper ---
/**
 * Executes a Notion API call with exponential backoff retry on rate limit (HTTP 429) or network errors.
 * @param {Function} fn - Async function to execute
 * @param {Object} [options] - { retries, minDelay, maxDelay, factor }
 * @returns {Promise<*>}
 */
async function executeWithRetry(fn, options = {}) {
	const { retries = 5, minDelay = 500, maxDelay = 8000, factor = 2 } = options;
	let attempt = 0;
	let delay = minDelay;
	while (true) {
		try {
			return await fn();
		} catch (e) {
			const isRateLimit =
				e.status === 429 ||
				e.code === 'rate_limited' ||
				(e.body && e.body.code === 'rate_limited');
			const isConflict = e.status === 409;
			const isNetwork =
				e.code === 'ENOTFOUND' ||
				e.code === 'ECONNRESET' ||
				e.code === 'ETIMEDOUT';
			if ((isRateLimit || isConflict || isNetwork) && attempt < retries) {
				const wait = Math.min(delay, maxDelay);
				if (isRateLimit) {
					logger.warn(
						`Rate limit (429). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`
					);
				} else if (isConflict) {
					logger.warn(
						`Conflict (409). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`
					);
				} else {
					logger.warn(
						`Network error (${e.code}). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`
					);
				}
				await new Promise((res) => setTimeout(res, wait));
				delay *= factor;
				attempt++;
				continue;
			}
			throw e;
		}
	}
}

// Add a task to Notion (with retry)
async function addTaskToNotion(task, tag, mapping, meta, mappingFile) {
	const properties = buildNotionProperties(task, tag);
	const response = await executeWithRetry(() =>
		notion.pages.create({
			parent: { database_id: NOTION_DATABASE_ID },
			properties
		})
	);
	const notionId = response.id;
	const newMapping = setNotionPageId(mapping, tag, task.id, notionId);
	saveNotionSyncMapping(newMapping, meta, mappingFile);
	return notionId;
}

// Update a task in Notion (with retry)
async function updateTaskInNotion(task, tag, mapping, meta, mappingFile) {
	const notionId = getNotionPageId(mapping, tag, task.id);
	if (!notionId) throw new Error('Notion page id not found for update');
	const properties = buildNotionProperties(task, tag);
	await executeWithRetry(() =>
		notion.pages.update({
			page_id: notionId,
			properties
		})
	);
	saveNotionSyncMapping(mapping, meta, mappingFile);
}

/**
 * Updates Notion complexity property for tasks in the current tag that match id and title from COMPLEXITY_REPORT_FILE.
 * Only updates tasks where id and title both match.
 * @param {boolean} [debug=false] - If true, prints update log to console
 */
async function updateNotionComplexityForCurrentTag(projectRoot) {
	const taskMaster = currentTaskMaster;
	const debug = process.env.TASKMASTER_DEBUG || false;
	await initNotion();
	logger.info(`Starting complexity update for current tag in Notion...`);
	if (!isNotionEnabled || !notion) {
		logger.error(`Notion sync is disabled. Skipping syncTasksWithNotion.`);
		return;
	}
	const tag = taskMaster
		? taskMaster.getCurrentTag()
		: getCurrentTag(projectRoot);
	const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);
	const taskmasterTasksFile = taskMaster
		? taskMaster.getTasksPath()
		: path.join(projectRoot, TASKMASTER_TASKS_FILE);
	const data = readJSON(taskmasterTasksFile, projectRoot, tag);
	const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
	const complexityInfo = getTaskComplexityInfo(projectRoot, tag);
	// Load mapping
	let { mapping, meta } = loadNotionSyncMapping(mappingFile);

	// --- Ensure all tasks have Notion mapping ---
	const prevMapping = JSON.stringify(mapping);
	mapping = await ensureAllTasksHaveNotionMapping(
		data._rawTaggedData,
		mapping,
		meta,
		mappingFile,
		debug
	);
	// --- Only update relations if mapping changed (i.e., new pages were added) ---
	if (JSON.stringify(mapping) !== prevMapping) {
		await updateAllTaskRelationsInNotion(data._rawTaggedData, mapping, debug);
	}

	let updatedCount = 0;
	for (const task of tasks) {
		const match = complexityInfo.find(
			(info) => String(info.id) === String(task.id) && info.title === task.title
		);
		if (match) {
			// Only update if the complexity is different
			if (task.complexity !== match.complexityScore) {
				// Update Notion for parent
				try {
					await updateTaskInNotion(
						{ ...task, complexity: match.complexityScore },
						tag,
						mapping,
						meta,
						mappingFile
					);
					updatedCount++;
				} catch (e) {
					logger.error(
						`Failed to update Notion complexity for task id=${task.id}, title="${task.title}":`,
						e.message
					);
				}
				// Update Notion for subtasks (if any)
				if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
					for (const subId of task.subtasks) {
						// subtasks are flattened as "parentId.subId" by flattenTasksWithTag
						// Here, the subtasks array is a flattened id array
						// Check if the Notion page id exists in mapping, then update
						const subtaskNotionId = getNotionPageId(mapping, tag, subId);
						if (subtaskNotionId) {
							try {
								// The original subtask info is not in the tasks array, so only pass the id to update complexity
								await updateTaskInNotion(
									{ id: subId, complexity: match.complexityScore },
									tag,
									mapping,
									meta,
									mappingFile
								);
								updatedCount++;
							} catch (e) {
								logger.error(
									`Failed to update Notion complexity for subtask id=${subId} (parent id=${task.id}):`,
									e.message
								);
							}
						}
					}
				}
			}
		}
	}
	if (updatedCount === 0) {
		logger.info(`No complexity updated in Notion for tag "${tag}".`);
	} else {
		logger.success(
			`Updated complexity for ${updatedCount} tasks in tag "${tag}".`
		);
	}
}

// Delete a task from Notion (with retry)
async function deleteTaskFromNotion(task, tag, mapping, meta, mappingFile) {
	const notionId = getNotionPageId(mapping, tag, task.id);
	if (!notionId) return;

	try {
		await executeWithRetry(() =>
			notion.pages.update({ page_id: notionId, archived: true })
		);
	} catch (error) {
		// Ignore errors for already archived blocks - they're already "deleted"
		if (
			error.message &&
			error.message.includes("Can't edit block that is archived")
		) {
			logger.info(
				`Task [${tag}] ${task.id} was already archived, skipping deletion`
			);
		} else {
			throw error; // Re-throw other errors
		}
	}

	const newMapping = removeNotionPageId(mapping, tag, task.id);
	saveNotionSyncMapping(newMapping, meta, mappingFile);
}

/**
 * Ensures all tasks (tasksObj: tag -> {tasks: [...]}) have Notion mapping (Notion page exists for each task/subtask).
 * Returns updated mapping.
 * Can be used for any task object, such as prevTasks or curTasks.
 */
async function ensureAllTasksHaveNotionMapping(
	tasksObj,
	mapping,
	meta,
	mappingFile,
	debug = false
) {
	let changed = false;
	for (const tag of Object.keys(tasksObj || {})) {
		const tasksArr = Array.isArray(tasksObj[tag]?.tasks)
			? tasksObj[tag].tasks
			: [];
		for (const { id, task } of flattenTasksWithTag(tasksArr, tag)) {
			if (!getNotionPageId(mapping, tag, id)) {
				if (debug)
					logger.debug(`Creating missing Notion page for [${tag}] ${id}`);
				try {
					await addTaskToNotion(task, tag, mapping, meta, mappingFile);
					// Reload mapping after add
					({ mapping } = loadNotionSyncMapping(mappingFile));
					changed = true;
				} catch (e) {
					logger.error(
						`Failed to create Notion page for [${tag}] ${id}:`,
						e.message
					);
				}
			}
		}
	}
	if (changed) {
		logger.info(`Notion mapping updated with new pages.`);
	}
	return mapping;
}

/**
 * Updates dependencies/subtasks relation properties for all tasks in tasksObj (tag -> {tasks: [...]}) in Notion.
 * Only updates if dependencies or subtasks exist for the task.
 * @param {Object} tasksObj
 * @param {Object} mapping
 * @param {Object} meta
 * @param {string} mappingFile
 * @param {boolean} debug
 */
async function updateAllTaskRelationsInNotion(
	tasksObj,
	mapping,
	debug = false
) {
	let changed = false;
	for (const tag of Object.keys(tasksObj || {})) {
		const tasksArr = Array.isArray(tasksObj[tag]?.tasks)
			? tasksObj[tag].tasks
			: [];
		for (const { id, task } of flattenTasksWithTag(tasksArr, tag)) {
			// Only update if dependencies or subtasks exist and are non-empty
			const hasDeps =
				Array.isArray(task.dependencies) && task.dependencies.length > 0;
			const hasSubs = Array.isArray(task.subtasks) && task.subtasks.length > 0;
			if (!hasDeps && !hasSubs) continue;
			const notionId = getNotionPageId(mapping, tag, id);
			if (!notionId) continue;
			const relationProps = buildNotionRelationProperties(task, tag, mapping);
			if (Object.keys(relationProps).length === 0) continue;
			try {
				await executeWithRetry(() =>
					notion.pages.update({
						page_id: notionId,
						properties: relationProps
					})
				);
				if (debug) logger.debug(`Updated relations for [${tag}] ${id}`);
				changed = true;
			} catch (e) {
				logger.error(
					`Failed to update relations for [${tag}] ${id}:`,
					e.message
				);
			}
		}
	}
	if (changed) {
		logger.info(
			`Updated Notion relations for all tasks with dependencies/subtasks.`
		);
	}
}

/**
 * Updates dependencies/subtasks relation properties for only changed tasks (added, updated, moved) in Notion.
 * @param {Array} changes - Array of diffTasks change objects
 * @param {Object} mapping
 * @param {Object} meta
 * @param {string} mappingFile
 * @param {boolean} debug
 */
async function updateChangedTaskRelationsInNotion(
	changes,
	mapping,
	debug = false
) {
	for (const change of changes) {
		if (!['added', 'updated', 'moved'].includes(change.type)) continue;
		let tag, id, task;
		if (change.type === 'moved') {
			tag = change.tag;
			id = change.cur_id;
			task = change.cur;
		} else {
			tag = change.tag;
			id = change.id;
			task = change.cur;
		}
		if (!task) continue;
		const notionId = getNotionPageId(mapping, tag, id);
		if (!notionId) continue;
		const relationProps = buildNotionRelationProperties(task, tag, mapping);
		if (Object.keys(relationProps).length === 0) continue;
		try {
			await executeWithRetry(() =>
				notion.pages.update({
					page_id: notionId,
					properties: relationProps
				})
			);
			if (debug) logger.debug(`Updated relations for [${tag}] ${id}`);
		} catch (e) {
			logger.error(`Failed to update relations for [${tag}] ${id}:`, e.message);
		}
	}
}

/**
 * Syncs tasks with Notion using diffTasks. Applies add, update, delete, move operations and updates the mapping file.
 * @param {Object} prevTasks - Previous tasks object (tag -> {tasks: [...]})
 * @param {Object} curTasks - Current tasks object (tag -> {tasks: [...]})
 */
async function syncTasksWithNotion(prevTasks, curTasks, projectRoot) {
	const debug = process.env.TASKMASTER_DEBUG || false;
	await initNotion();
	if (!isNotionEnabled || !notion) {
		logger.error(`Notion sync is disabled. Skipping syncTasksWithNotion.`);
		return;
	}
	logger.info('Starting Notion sync');
	const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);
	// Load mapping
	let { mapping, meta: loadedMeta } = loadNotionSyncMapping(mappingFile);
	const meta = loadedMeta || {};

	// --- Ensure all prevTasks have Notion mapping ---
	const prevMapping = JSON.stringify(mapping);
	mapping = await ensureAllTasksHaveNotionMapping(
		prevTasks,
		mapping,
		meta,
		mappingFile,
		debug
	);
	// --- Only update relations if mapping changed (i.e., new pages were added) ---
	if (JSON.stringify(mapping) !== prevMapping) {
		await updateAllTaskRelationsInNotion(prevTasks, mapping, debug);
	}

	// Diff
	const changes = diffTasks(prevTasks, curTasks);
	try {
		for (const change of changes) {
			if (change.type === 'added') {
				logger.info(`Adding task: [${change.tag}] ${change.id}`);
				await addTaskToNotion(
					change.cur,
					change.tag,
					mapping,
					meta,
					mappingFile
				);
				({ mapping } = loadNotionSyncMapping(mappingFile));
			} else if (change.type === 'updated') {
				logger.info(`Updating task: [${change.tag}] ${change.id}`);
				await updateTaskInNotion(
					change.cur,
					change.tag,
					mapping,
					meta,
					mappingFile
				);
			} else if (change.type === 'deleted') {
				logger.info(`Deleting task: [${change.tag}] ${change.id}`);
				await deleteTaskFromNotion(
					change.prev,
					change.tag,
					mapping,
					meta,
					mappingFile
				);
				({ mapping } = loadNotionSyncMapping(mappingFile));
			} else if (change.type === 'moved') {
				logger.info(
					`Moving task: [${change.tag}] ${change.id} => ${change.cur_id}`
				);
				const oldTag = change.prev_tag;
				const oldId = change.id;
				const newTag = change.tag;
				const newId = change.cur_id;
				const notionId = getNotionPageId(mapping, oldTag, oldId);
				if (notionId) {
					mapping = removeNotionPageId(mapping, oldTag, oldId);
					mapping = setNotionPageId(mapping, newTag, newId, notionId);
					saveNotionSyncMapping(mapping, meta, mappingFile);
					await updateTaskInNotion(
						change.cur,
						newTag,
						mapping,
						meta,
						mappingFile
					);
				} else {
					await addTaskToNotion(change.cur, newTag, mapping, meta, mappingFile);
					({ mapping } = loadNotionSyncMapping(mappingFile));
				}
			}
		}
	} catch (e) {
		logger.error(`Error during Notion sync:`, e.message);
		throw e; // Re-throw to handle it in the caller
	}
	// Update relations for changed tasks
	await updateChangedTaskRelationsInNotion(changes, mapping, debug);

	logger.success('Notion sync complete');
}

/**
 * Repairs Notion DB by removing duplicate tasks based on taskid property.
 * Keeps the most recently created page for each unique taskid.
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Options { dryRun: boolean, forceSync: boolean }
 * @returns {Promise<Object>} Result with removed duplicates count and details
 */
async function repairNotionDuplicates(projectRoot, options = {}) {
	const { dryRun = false, forceSync = true } = options;
	const debug = process.env.TASKMASTER_DEBUG || false;

	await initNotion();
	if (!isNotionEnabled || !notion) {
		logger.error(`Notion sync is disabled. Cannot repair duplicates.`);
		return { success: false, error: 'Notion sync disabled' };
	}

	logger.info(
		`${dryRun ? '[DRY RUN] ' : ''}Starting Notion duplicate repair...`
	);

	try {
		// 1. Fetch all pages from Notion DB
		logger.info('Fetching all pages from Notion DB...');
		const allPages = await fetchAllNotionPages();
		logger.info(`Found ${allPages.length} total pages in Notion DB`);

		// 2. Group pages by taskid to identify duplicates
		const pagesByTaskId = new Map();
		const pagesWithoutTaskId = [];

		for (const page of allPages) {
			const taskIdProperty =
				page.properties?.taskid?.rich_text?.[0]?.text?.content;
			if (taskIdProperty) {
				const taskId = taskIdProperty.trim();
				if (!pagesByTaskId.has(taskId)) {
					pagesByTaskId.set(taskId, []);
				}
				pagesByTaskId.get(taskId).push(page);
			} else {
				pagesWithoutTaskId.push(page);
			}
		}

		// 3. Identify duplicates (taskids with more than one page)
		const duplicates = new Map();
		let totalDuplicatePages = 0;

		for (const [taskId, pages] of pagesByTaskId.entries()) {
			if (pages.length > 1) {
				duplicates.set(taskId, pages);
				totalDuplicatePages += pages.length - 1; // -1 because we keep one
			}
		}

		logger.info(
			`Found ${duplicates.size} taskids with duplicates (${totalDuplicatePages} pages to remove)`
		);
		if (pagesWithoutTaskId.length > 0) {
			logger.warn(
				`Found ${pagesWithoutTaskId.length} pages without taskid property`
			);
		}

		if (duplicates.size === 0) {
			logger.success('No duplicates found in Notion DB');
			return { success: true, duplicatesRemoved: 0, details: [] };
		}

		// 4. Remove duplicates (keep the most recently created page)
		const removalDetails = [];
		let removedCount = 0;

		for (const [taskId, pages] of duplicates.entries()) {
			// Sort by created_time (most recent first)
			const sortedPages = pages.sort(
				(a, b) => new Date(b.created_time) - new Date(a.created_time)
			);

			const pageToKeep = sortedPages[0];
			const pagesToRemove = sortedPages.slice(1);

			logger.info(
				`TaskID ${taskId}: keeping page ${pageToKeep.id} (${pageToKeep.created_time}), removing ${pagesToRemove.length} duplicates`
			);

			for (const pageToRemove of pagesToRemove) {
				const detail = {
					taskId,
					pageId: pageToRemove.id,
					title:
						pageToRemove.properties?.title?.title?.[0]?.text?.content ||
						'Untitled',
					createdTime: pageToRemove.created_time
				};

				if (!dryRun) {
					try {
						await executeWithRetry(() =>
							notion.pages.update({
								page_id: pageToRemove.id,
								archived: true
							})
						);

						logger.info(
							`✓ Archived duplicate page ${pageToRemove.id} for taskID ${taskId}`
						);
						removedCount++;
					} catch (e) {
						logger.error(
							`✗ Failed to archive page ${pageToRemove.id} for taskID ${taskId}:`,
							e.message
						);
						detail.error = e.message;
					}
				} else {
					logger.info(
						`[DRY RUN] Would archive page ${pageToRemove.id} for taskID ${taskId}`
					);
				}

				removalDetails.push(detail);
			}
		}

		// 5. Clean up local mapping file
		if (!dryRun && removedCount > 0) {
			logger.info('Cleaning up local mapping file...');
			await cleanupNotionMapping(projectRoot, duplicates);
		}

		// 6. Force full resync if requested
		if (!dryRun && forceSync && removedCount > 0) {
			logger.info('Forcing full resynchronization...');
			await forceFullNotionSync(projectRoot);
		}

		const resultMessage = dryRun
			? `[DRY RUN] Would remove ${totalDuplicatePages} duplicate pages`
			: `Successfully removed ${removedCount} duplicate pages`;

		logger.success(resultMessage);

		return {
			success: true,
			duplicatesRemoved: dryRun ? 0 : removedCount,
			totalDuplicatesFound: totalDuplicatePages,
			details: removalDetails,
			dryRun
		};
	} catch (e) {
		logger.error('Failed to repair Notion duplicates:', e.message);
		return { success: false, error: e.message };
	}
}

/**
 * Fetches all pages from the Notion DB with pagination support
 * @returns {Promise<Array>} Array of all pages
 */
async function fetchAllNotionPages() {
	const allPages = [];
	let cursor = undefined;

	do {
		const response = await executeWithRetry(() =>
			notion.databases.query({
				database_id: NOTION_DATABASE_ID,
				start_cursor: cursor,
				page_size: 100 // Maximum allowed by Notion API
			})
		);

		allPages.push(...response.results);
		cursor = response.next_cursor;

		if (cursor) {
			logger.debug(`Fetched ${allPages.length} pages so far, continuing...`);
		}
	} while (cursor);

	return allPages;
}

/**
 * Cleans up the local notion-sync.json mapping file by removing entries
 * for pages that were deleted during duplicate repair
 * @param {string} projectRoot
 * @param {Map} duplicates - Map of taskId -> pages array
 */
async function cleanupNotionMapping(projectRoot, duplicates) {
	const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);
	let { mapping, meta } = loadNotionSyncMapping(mappingFile);
	let cleaned = false;

	for (const [taskId, pages] of duplicates.entries()) {
		// Keep only the first page (most recent), remove mappings for others
		const sortedPages = pages.sort(
			(a, b) => new Date(b.created_time) - new Date(a.created_time)
		);
		const pageToKeep = sortedPages[0];
		const pagesToRemove = sortedPages.slice(1);

		// Remove mappings for duplicate pages
		for (const tag in mapping) {
			for (const id in mapping[tag]) {
				const notionId = mapping[tag][id];
				if (pagesToRemove.some((p) => p.id === notionId)) {
					delete mapping[tag][id];
					cleaned = true;
					logger.debug(`Removed mapping [${tag}] ${id} -> ${notionId}`);
				}
			}

			// Clean up empty tag mappings
			if (Object.keys(mapping[tag]).length === 0) {
				delete mapping[tag];
			}
		}
	}

	if (cleaned) {
		saveNotionSyncMapping(mapping, meta, mappingFile);
		logger.info('Local mapping file cleaned up');
	} else {
		logger.info('No mapping cleanup needed');
	}
}

/**
 * Forces a complete resynchronization with Notion by comparing current tasks with Notion state
 * @param {string} projectRoot
 */
async function forceFullNotionSync(projectRoot) {
	await initNotion();
	if (!isNotionEnabled || !notion) {
		throw new Error('Notion sync disabled');
	}

	try {
		logger.info('[NOTION] Starting intelligent force synchronization...');

		const taskMaster = currentTaskMaster;
		const taskmasterTasksFile = taskMaster
			? taskMaster.getTasksPath()
			: path.join(projectRoot, TASKMASTER_TASKS_FILE);
		const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);

		// 1. Read current TaskMaster tasks
		const currentData = readJSON(taskmasterTasksFile, projectRoot);
		if (!currentData || !currentData._rawTaggedData) {
			logger.warn('No task data found for full sync');
			return;
		}

		// 2. Fetch all existing Notion pages
		logger.info('[NOTION] Fetching existing Notion pages...');
		const notionPages = await fetchAllNotionPages();
		logger.info(
			`[NOTION] Found ${notionPages.length} existing pages in Notion`
		);

		// 3. Build a mapping of taskid -> notion page ID for existing pages
		const existingTaskIdToPageId = new Map();
		for (const page of notionPages) {
			const taskId =
				page.properties?.taskid?.rich_text?.[0]?.text?.content?.trim();
			if (taskId) {
				existingTaskIdToPageId.set(taskId, page.id);
			}
		}
		logger.info(
			`[NOTION] Found ${existingTaskIdToPageId.size} pages with valid taskids`
		);

		// 4. Build a new mapping based on existing pages
		const newMapping = {};
		const meta = {};
		const currentTag = taskMaster
			? taskMaster.getCurrentTag()
			: getCurrentTag(projectRoot);

		// Initialize mapping structure
		if (!newMapping[currentTag]) {
			newMapping[currentTag] = {};
		}

		// Map TaskMaster tasks to existing Notion pages where possible
		let mappedCount = 0;
		if (currentData._rawTaggedData && currentData._rawTaggedData[currentTag]) {
			for (const { id, task } of flattenTasksWithTag(
				currentData._rawTaggedData[currentTag].tasks || [],
				currentTag
			)) {
				const existingPageId = existingTaskIdToPageId.get(String(id));
				if (existingPageId) {
					newMapping[currentTag][id] = existingPageId;
					mappedCount++;
				}
			}
		}

		logger.info(
			`[NOTION] Mapped ${mappedCount} TaskMaster tasks to existing Notion pages`
		);

		// 5. Save the new mapping
		saveNotionSyncMapping(newMapping, meta, mappingFile);

		// 6. Build previous state from mapped tasks to prevent them being treated as "added"
		const intelligentPrevious = {};
		intelligentPrevious._rawTaggedData = {};
		intelligentPrevious._rawTaggedData[currentTag] = { tasks: [] };

		// Add tasks that have mappings to previous state so they're treated as "existing"
		if (currentData._rawTaggedData && currentData._rawTaggedData[currentTag]) {
			for (const { id, task } of flattenTasksWithTag(
				currentData._rawTaggedData[currentTag].tasks || [],
				currentTag
			)) {
				// If this task has a mapping, include it in previous state
				if (newMapping[currentTag] && newMapping[currentTag][id]) {
					intelligentPrevious._rawTaggedData[currentTag].tasks.push(task);
				}
			}
		}

		logger.info(
			`[NOTION] Built previous state with ${intelligentPrevious._rawTaggedData[currentTag].tasks.length} existing tasks`
		);
		logger.info(
			'[NOTION] Starting synchronization with intelligent mapping...'
		);
		await syncTasksWithNotion(
			intelligentPrevious._rawTaggedData,
			currentData._rawTaggedData,
			projectRoot
		);

		logger.info('[NOTION] Intelligent force synchronization completed');
	} catch (e) {
		logger.error('Failed to force full sync:', e.message);
		throw e;
	}
}

/**
 * Validates the integrity of Notion synchronization by comparing TaskMaster tasks with Notion pages
 * @param {string} projectRoot
 * @returns {Promise<Object>} Validation report
 */
async function validateNotionSync(projectRoot) {
	await initNotion();
	if (!isNotionEnabled || !notion) {
		return { success: false, error: 'Notion sync disabled' };
	}

	try {
		logger.info('Checking TaskMaster-Notion DB synchronization...');

		// 1. Load TaskMaster data
		const taskMaster = currentTaskMaster;
		const tag = taskMaster
			? taskMaster.getCurrentTag()
			: getCurrentTag(projectRoot);
		const taskmasterTasksFile = taskMaster
			? taskMaster.getTasksPath()
			: path.join(projectRoot, TASKMASTER_TASKS_FILE);
		const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);

		const localData = readJSON(taskmasterTasksFile, projectRoot, tag);
		const { mapping } = loadNotionSyncMapping(mappingFile);

		if (!localData || !Array.isArray(localData.tasks)) {
			return { success: false, error: 'No TaskMaster tasks found' };
		}

		// 2. Process TaskMaster tasks
		const localTasks = new Map();
		for (const { id, task } of flattenTasksWithTag(localData.tasks, tag)) {
			localTasks.set(String(id), task);
		}

		// 3. Fetch Notion DB tasks
		const notionPages = await fetchAllNotionPages();
		const notionTaskIds = new Set();
		const notionPagesByTaskId = new Map();
		const pagesWithoutTaskId = [];

		for (const page of notionPages) {
			const taskId =
				page.properties?.taskid?.rich_text?.[0]?.text?.content?.trim();
			if (taskId) {
				notionTaskIds.add(taskId);
				if (!notionPagesByTaskId.has(taskId)) {
					notionPagesByTaskId.set(taskId, []);
				}
				notionPagesByTaskId.get(taskId).push(page);
			} else {
				pagesWithoutTaskId.push(page);
			}
		}

		// 4. Find inconsistencies
		const report = {
			success: true,
			taskmasterTaskCount: localTasks.size,
			notionPageCount: notionPages.length,
			notionTaskIdCount: notionTaskIds.size,
			duplicatesInNotion: [],
			missingInNotion: [],
			extraInNotion: [],
			mappingIssues: []
		};

		// Find duplicates in Notion
		for (const [taskId, pages] of notionPagesByTaskId.entries()) {
			if (pages.length > 1) {
				report.duplicatesInNotion.push({
					taskId,
					pageCount: pages.length,
					pageIds: pages.map((p) => p.id)
				});
			}
		}

		// Find TaskMaster tasks not synced to Notion DB
		for (const [taskId] of localTasks) {
			if (!notionTaskIds.has(String(taskId))) {
				report.missingInNotion.push(taskId);
			}
		}

		// Find extra tasks in Notion DB (including pages without taskid)
		for (const taskId of notionTaskIds) {
			if (!localTasks.has(taskId)) {
				report.extraInNotion.push(taskId);
			}
		}

		// Add pages without taskid as extra entries (using page titles or IDs)
		for (const page of pagesWithoutTaskId) {
			const pageTitle =
				page.properties?.title?.title?.[0]?.text?.content ||
				`Page-${page.id.slice(-8)}`;
			report.extraInNotion.push(`[NO_ID]${pageTitle}`);
		}

		// Check mapping consistency
		for (const tagKey in mapping) {
			for (const idKey in mapping[tagKey]) {
				const notionId = mapping[tagKey][idKey];
				const notionPage = notionPages.find((p) => p.id === notionId);
				if (!notionPage) {
					report.mappingIssues.push({
						tag: tagKey,
						taskId: idKey,
						notionId,
						issue: 'Mapping points to non-existent Notion DB task'
					});
				} else if (notionPage.archived) {
					report.mappingIssues.push({
						tag: tagKey,
						taskId: idKey,
						notionId,
						issue: 'Mapping points to archived Notion DB task'
					});
				}
			}
		}

		// Summary
		const hasIssues =
			report.duplicatesInNotion.length > 0 ||
			report.missingInNotion.length > 0 ||
			report.extraInNotion.length > 0 ||
			report.mappingIssues.length > 0;

		if (hasIssues) {
			logger.warn('TaskMaster-Notion DB sync issues detected:');
			if (report.duplicatesInNotion.length > 0) {
				logger.warn(
					`- ${report.duplicatesInNotion.length} tasks have duplicate entries in Notion DB`
				);
			}
			if (report.missingInNotion.length > 0) {
				logger.warn(
					`- ${report.missingInNotion.length} TaskMaster tasks not yet synced to Notion DB`
				);
			}
			if (report.extraInNotion.length > 0) {
				logger.warn(
					`- ${report.extraInNotion.length} extra tasks found in Notion DB`
				);
			}
			if (report.mappingIssues.length > 0) {
				logger.warn(
					`- ${report.mappingIssues.length} sync mapping inconsistencies`
				);
			}
		} else {
			logger.success(
				'Perfect sync! TaskMaster and Notion DB are perfectly aligned'
			);
		}

		return report;
	} catch (e) {
		logger.error('Failed to validate TaskMaster-Notion DB sync:', e.message);
		return { success: false, error: e.message };
	}
}

/**
 * Archives multiple Notion pages in parallel batches for optimal performance
 * Uses intelligent batch sizing and rate limiting to respect Notion API constraints
 * @param {Array} pages - Array of Notion page objects to archive
 * @returns {Promise<{succeeded: number, failed: number, errors: Array}>}
 */
async function archivePagesInParallel(pages) {
	const BATCH_SIZE = 8; // Optimal batch size for Notion API (respects rate limits)
	const DELAY_BETWEEN_BATCHES = 200; // 200ms delay to prevent rate limiting

	let succeededCount = 0;
	let failedCount = 0;
	const errors = [];

	logger.info(
		`Starting parallel archival of ${pages.length} pages (batch size: ${BATCH_SIZE})`
	);

	// Process pages in batches
	for (let i = 0; i < pages.length; i += BATCH_SIZE) {
		const batchStart = i;
		const batchEnd = Math.min(i + BATCH_SIZE, pages.length);
		const batch = pages.slice(batchStart, batchEnd);
		const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(pages.length / BATCH_SIZE);

		logger.info(
			`Processing batch ${batchNumber}/${totalBatches} (pages ${batchStart + 1}-${batchEnd})`
		);

		try {
			// Execute all requests in the current batch in parallel
			const batchPromises = batch.map(async (page, index) => {
				try {
					await executeWithRetry(
						() =>
							notion.pages.update({
								page_id: page.id,
								archived: true
							}),
						3
					); // 3 retries per page

					logger.debug(
						`✓ Archived page ${page.id} (${batchStart + index + 1}/${pages.length})`
					);
					return { success: true, pageId: page.id };
				} catch (error) {
					logger.error(`✗ Failed to archive page ${page.id}:`, error.message);
					return { success: false, pageId: page.id, error: error.message };
				}
			});

			// Wait for all requests in the batch to complete
			const batchResults = await Promise.all(batchPromises);

			// Count successes and failures for this batch
			const batchSucceeded = batchResults.filter((r) => r.success).length;
			const batchFailed = batchResults.filter((r) => !r.success).length;

			succeededCount += batchSucceeded;
			failedCount += batchFailed;

			// Collect errors from this batch
			batchResults
				.filter((r) => !r.success)
				.forEach((r) => errors.push({ pageId: r.pageId, error: r.error }));

			logger.info(
				`Batch ${batchNumber} completed: ${batchSucceeded} succeeded, ${batchFailed} failed`
			);

			// Add delay between batches to respect rate limits (except for the last batch)
			if (batchEnd < pages.length) {
				await new Promise((resolve) =>
					setTimeout(resolve, DELAY_BETWEEN_BATCHES)
				);
			}
		} catch (batchError) {
			logger.error(
				`Batch ${batchNumber} failed completely:`,
				batchError.message
			);
			failedCount += batch.length;
			batch.forEach((page) => {
				errors.push({ pageId: page.id, error: batchError.message });
			});
		}
	}

	// Final summary
	const result = { succeeded: succeededCount, failed: failedCount, errors };

	if (failedCount === 0) {
		logger.success(`✅ Successfully archived all ${succeededCount} pages`);
	} else {
		logger.warn(`⚠️ Archived ${succeededCount} pages, ${failedCount} failed`);
		if (errors.length > 0) {
			logger.warn(`First few errors:`, errors.slice(0, 3));
		}
	}

	return result;
}

/**
 * Completely resets the Notion DB by archiving all existing pages and recreating from TaskMaster tasks
 * @param {string} projectRoot
 * @returns {Promise<Object>} Reset report
 */
async function resetNotionDB(projectRoot) {
	await initNotion();
	if (!isNotionEnabled || !notion) {
		return { success: false, error: 'Notion sync disabled' };
	}

	try {
		logger.info('[NOTION] Starting complete Notion DB reset...');

		// 1. Fetch all existing Notion DB tasks
		logger.info('[NOTION] Fetching all existing Notion DB tasks...');
		const existingPages = await fetchAllNotionPages();
		logger.info(
			`[NOTION] Found ${existingPages.length} existing Notion DB tasks to remove`
		);

		// 2. Remove all existing Notion DB tasks
		let archiveResults = { succeeded: 0, failed: 0, errors: [] };
		if (existingPages.length > 0) {
			archiveResults = await archivePagesInParallel(existingPages);
		}

		// 3. Clear sync mapping file
		const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);
		logger.info('[NOTION] Cleaning up sync mapping file...');
		saveNotionSyncMapping(mappingFile, {});
		logger.info('[NOTION] Sync mapping file cleared');

		// 4. Load TaskMaster tasks
		const taskMaster = currentTaskMaster;
		const taskmasterTasksFile = taskMaster
			? taskMaster.getTasksPath()
			: path.join(projectRoot, TASKMASTER_TASKS_FILE);
		const currentData = readJSON(taskmasterTasksFile, projectRoot);

		if (!currentData || !currentData._rawTaggedData) {
			logger.warn('No TaskMaster tasks found');
			return { success: false, error: 'No TaskMaster tasks found' };
		}

		// 5. Recreate all TaskMaster tasks in Notion DB
		logger.info('[NOTION] Recreating all TaskMaster tasks in Notion DB...');

		// Use empty previous state to create all tasks as new, but with clean Notion DB
		const emptyPrevious = {};
		await syncTasksWithNotion(
			emptyPrevious,
			currentData._rawTaggedData,
			projectRoot
		);

		logger.info('[NOTION] Notion DB reset completed successfully');

		return {
			success: true,
			archivedPages: archiveResults.succeeded,
			failedArchives: archiveResults.failed,
			archiveErrors: archiveResults.errors,
			message: `Successfully reset Notion DB - removed ${archiveResults.succeeded}/${existingPages.length} existing Notion DB tasks and recreated all TaskMaster tasks`
		};
	} catch (e) {
		logger.error('Failed to reset Notion DB:', e.message);
		return { success: false, error: e.message };
	}
}

/**
 * Comprehensive Notion repair function that intelligently fixes all synchronization issues.
 * Combines duplicate removal and missing task synchronization in one command.
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Options { dryRun: boolean }
 * @returns {Promise<Object>} Comprehensive repair report
 */
async function repairNotionDB(projectRoot, options = {}) {
	const { dryRun = false } = options;

	await initNotion();
	if (!isNotionEnabled || !notion) {
		return { success: false, error: 'Notion sync disabled' };
	}

	try {
		logger.info(
			`${dryRun ? '[DRY RUN] ' : ''}Starting comprehensive Notion DB repair...`
		);

		// Phase 1: Complete diagnostic (like validate-notion-sync)
		logger.info('Phase 1: Analyzing TaskMaster-Notion DB sync status...');

		const taskMaster = currentTaskMaster;
		const tag = taskMaster
			? taskMaster.getCurrentTag()
			: getCurrentTag(projectRoot);
		const taskmasterTasksFile = taskMaster
			? taskMaster.getTasksPath()
			: path.join(projectRoot, TASKMASTER_TASKS_FILE);
		const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);

		// Load TaskMaster data
		const localData = readJSON(taskmasterTasksFile, projectRoot, tag);
		const { mapping } = loadNotionSyncMapping(mappingFile);

		if (!localData || !Array.isArray(localData.tasks)) {
			return { success: false, error: 'No TaskMaster tasks found' };
		}

		// Process TaskMaster tasks
		const localTasks = new Map();
		for (const { id, task } of flattenTasksWithTag(localData.tasks, tag)) {
			localTasks.set(String(id), task);
		}

		// Fetch all Notion DB tasks
		const notionPages = await fetchAllNotionPages();
		logger.info(
			`Found ${localTasks.size} TaskMaster tasks and ${notionPages.length} Notion DB tasks`
		);

		// Group Notion pages by taskid
		const pagesByTaskId = new Map();
		const pagesWithoutTaskId = [];
		const notionTaskIds = new Set();

		for (const page of notionPages) {
			const taskIdProperty =
				page.properties?.taskid?.rich_text?.[0]?.text?.content;
			if (taskIdProperty) {
				const taskId = taskIdProperty.trim();
				notionTaskIds.add(taskId);
				if (!pagesByTaskId.has(taskId)) {
					pagesByTaskId.set(taskId, []);
				}
				pagesByTaskId.get(taskId).push(page);
			} else {
				pagesWithoutTaskId.push(page);
			}
		}

		// Phase 2: Remove duplicates from Notion DB
		logger.info('Phase 2: Removing duplicate entries from Notion DB...');

		const duplicates = new Map();
		let totalDuplicatePages = 0;

		for (const [taskId, pages] of pagesByTaskId.entries()) {
			if (pages.length > 1) {
				duplicates.set(taskId, pages);
				totalDuplicatePages += pages.length - 1;
			}
		}

		const duplicateDetails = [];
		let duplicatesRemoved = 0;

		if (duplicates.size > 0) {
			logger.info(
				`Found ${duplicates.size} tasks with duplicate entries (${totalDuplicatePages} duplicates to remove)`
			);

			for (const [taskId, pages] of duplicates.entries()) {
				// Sort by created_time (most recent first)
				const sortedPages = pages.sort(
					(a, b) => new Date(b.created_time) - new Date(a.created_time)
				);

				const pageToKeep = sortedPages[0];
				const pagesToRemove = sortedPages.slice(1);

				logger.info(
					`Task ${taskId}: keeping latest entry, removing ${pagesToRemove.length} duplicates`
				);

				for (const pageToRemove of pagesToRemove) {
					const detail = {
						taskId,
						pageId: pageToRemove.id,
						title:
							pageToRemove.properties?.title?.title?.[0]?.text?.content ||
							'Untitled',
						createdTime: pageToRemove.created_time
					};

					if (!dryRun) {
						try {
							await executeWithRetry(() =>
								notion.pages.update({
									page_id: pageToRemove.id,
									archived: true
								})
							);

							logger.info(`✓ Removed duplicate entry for task ${taskId}`);
							duplicatesRemoved++;
						} catch (e) {
							logger.error(
								`✗ Failed to archive page ${pageToRemove.id}:`,
								e.message
							);
							detail.error = e.message;
						}
					} else {
						logger.info(
							`[DRY RUN] Would remove duplicate entry for task ${taskId}`
						);
					}

					duplicateDetails.push(detail);
				}
			}
		} else {
			logger.info('No duplicates found');
		}

		// Update pagesByTaskId after duplicate removal
		if (!dryRun && duplicatesRemoved > 0) {
			for (const [taskId, pages] of duplicates.entries()) {
				const sortedPages = pages.sort(
					(a, b) => new Date(b.created_time) - new Date(a.created_time)
				);
				pagesByTaskId.set(taskId, [sortedPages[0]]); // Keep only the most recent
			}
		}

		// Phase 3: Sync missing TaskMaster tasks to Notion DB
		logger.info('Phase 3: Syncing missing TaskMaster tasks to Notion DB...');

		const missingTasks = [];
		for (const [taskId, task] of localTasks) {
			// A task is missing only if it's not in notionTaskIds at all
			// Tasks that had duplicates but were cleaned up are NOT missing since we kept one page
			if (!notionTaskIds.has(taskId)) {
				missingTasks.push({ id: taskId, task });
			}
		}

		let tasksAdded = 0;
		const additionDetails = [];

		if (missingTasks.length > 0) {
			logger.info(
				`Found ${missingTasks.length} TaskMaster tasks to sync to Notion DB`
			);

			if (!dryRun) {
				// Instead of using syncTasksWithNotion which compares states and recreates everything,
				// directly add only the missing tasks one by one
				const mappingFile = path.resolve(
					projectRoot,
					TASKMASTER_NOTION_SYNC_FILE
				);
				let { mapping, meta } = loadNotionSyncMapping(mappingFile);

				for (const { id, task } of missingTasks) {
					try {
						logger.info(`Syncing task ${id}: ${task.title}`);
						await addTaskToNotion(task, tag, mapping, meta, mappingFile);
						// Reload mapping after each add
						({ mapping, meta } = loadNotionSyncMapping(mappingFile));
						tasksAdded++;

						const detail = {
							id,
							title: task.title,
							status: 'added'
						};
						additionDetails.push(detail);

						logger.info(`✓ Successfully synced task ${id} to Notion DB`);
					} catch (e) {
						logger.error(
							`✗ Failed to sync task ${id} to Notion DB:`,
							e.message
						);
						const detail = {
							id,
							title: task.title,
							status: 'error',
							error: e.message
						};
						additionDetails.push(detail);
					}
				}
			} else {
				for (const { id, task } of missingTasks) {
					logger.info(`[DRY RUN] Would sync task: ${id} - ${task.title}`);
					additionDetails.push({ id, title: task.title });
				}
			}
		} else {
			logger.info('All TaskMaster tasks already synced to Notion DB');
		}

		// Phase 4: Remove extra tasks from Notion DB (TaskMaster is source of truth)
		logger.info('Phase 4: Cleaning up extra tasks from Notion DB...');

		const extraTasks = [];
		for (const taskId of notionTaskIds) {
			if (!localTasks.has(taskId)) {
				extraTasks.push(taskId);
			}
		}

		// Also consider pages without taskid as extra tasks to be cleaned up
		const extraTasksWithoutId = pagesWithoutTaskId.length;
		const totalExtraTasks = extraTasks.length + extraTasksWithoutId;

		let extraTasksRemoved = 0;
		const { preserveExtraTasks = false } = options;

		if (totalExtraTasks > 0) {
			if (preserveExtraTasks) {
				if (extraTasks.length > 0) {
					logger.warn(
						`Found ${extraTasks.length} extra tasks with taskid in Notion DB (preserved due to --preserve-extra-tasks option)`
					);
				}
				if (extraTasksWithoutId > 0) {
					logger.warn(
						`Found ${extraTasksWithoutId} tasks without taskid in Notion DB (preserved due to --preserve-extra-tasks option)`
					);
				}
			} else {
				logger.warn(
					`Found ${totalExtraTasks} extra tasks in Notion DB (TaskMaster is source of truth)`
				);
				if (extraTasks.length > 0) {
					logger.info(
						`  - ${extraTasks.length} tasks with taskid: ${extraTasks.slice(0, 5).join(', ')}${extraTasks.length > 5 ? '...' : ''}`
					);
				}
				if (extraTasksWithoutId > 0) {
					logger.info(
						`  - ${extraTasksWithoutId} tasks without taskid property`
					);
				}

				if (!dryRun) {
					// Find pages to remove (both extra tasks with taskid and pages without taskid)
					const pagesToRemove = [];

					// Add pages with extra taskids
					for (const taskId of extraTasks) {
						const pages = pagesByTaskId.get(taskId) || [];
						pagesToRemove.push(...pages);
					}

					// Add pages without taskid
					pagesToRemove.push(...pagesWithoutTaskId);

					if (pagesToRemove.length > 0) {
						logger.info(
							`Removing ${pagesToRemove.length} extra tasks from Notion DB...`
						);
						const archiveResult = await archivePagesInParallel(pagesToRemove);
						extraTasksRemoved = archiveResult.succeeded;

						if (archiveResult.failed > 0) {
							logger.warn(
								`Warning: ${archiveResult.failed} pages failed to archive`
							);
						}

						// Update our tracking
						for (const taskId of extraTasks) {
							notionTaskIds.delete(taskId);
							pagesByTaskId.delete(taskId);
						}
					}
				} else {
					logger.info(
						`[DRY RUN] Would remove ${totalExtraTasks} extra tasks from Notion DB:`
					);
					if (extraTasks.length > 0) {
						logger.info(
							`  - Tasks with taskid: ${extraTasks.slice(0, 10).join(', ')}${extraTasks.length > 10 ? '...' : ''}`
						);
					}
					if (extraTasksWithoutId > 0) {
						logger.info(
							`  - ${extraTasksWithoutId} tasks without taskid property`
						);
					}
				}
			}
		} else {
			logger.info('No extra tasks found in Notion DB');
		}

		// Phase 5: Clean up sync mappings (if not dry run)
		if (
			!dryRun &&
			(duplicatesRemoved > 0 || tasksAdded > 0 || extraTasksRemoved > 0)
		) {
			logger.info('Phase 5: Cleaning up sync mappings...');
			await cleanupNotionMapping(projectRoot, duplicates);
		}

		// Phase 6: Clean up invalid sync mappings
		logger.info('Phase 6: Cleaning up invalid sync mappings...');
		let invalidMappingsRemoved = 0;

		if (!dryRun) {
			const mappingFile = path.resolve(
				projectRoot,
				TASKMASTER_NOTION_SYNC_FILE
			);
			let { mapping, meta } = loadNotionSyncMapping(mappingFile);
			let mappingChanged = false;

			// Check each mapping entry
			for (const tagKey in mapping) {
				for (const idKey in mapping[tagKey]) {
					const notionId = mapping[tagKey][idKey];
					const notionPage = notionPages.find((p) => p.id === notionId);

					if (!notionPage || notionPage.archived) {
						logger.info(
							`Removing invalid mapping: [${tagKey}] ${idKey} -> ${notionId}`
						);
						delete mapping[tagKey][idKey];
						invalidMappingsRemoved++;
						mappingChanged = true;

						// Clean up empty tag objects
						if (Object.keys(mapping[tagKey]).length === 0) {
							delete mapping[tagKey];
						}
					}
				}
			}

			// Save cleaned mapping if changes were made
			if (mappingChanged) {
				saveNotionSyncMapping(mapping, meta, mappingFile);
				logger.info(
					`Cleaned up ${invalidMappingsRemoved} invalid sync mappings`
				);
			} else {
				logger.info('No invalid sync mappings found');
			}
		} else {
			// Dry run: count invalid mappings without removing them
			for (const tagKey in mapping) {
				for (const idKey in mapping[tagKey]) {
					const notionId = mapping[tagKey][idKey];
					const notionPage = notionPages.find((p) => p.id === notionId);

					if (!notionPage || notionPage.archived) {
						invalidMappingsRemoved++;
					}
				}
			}

			if (invalidMappingsRemoved > 0) {
				logger.info(
					`[DRY RUN] Would remove ${invalidMappingsRemoved} invalid sync mappings`
				);
			} else {
				logger.info('[DRY RUN] No invalid sync mappings found');
			}
		}

		// Recalculate final Notion page count after all operations
		const finalNotionPages = dryRun ? notionPages : await fetchAllNotionPages();

		// Final report
		const report = {
			success: true,
			dryRun,
			taskmasterTaskCount: localTasks.size,
			notionPageCount: finalNotionPages.length,
			duplicatesFound: duplicates.size,
			duplicatesRemoved: dryRun ? 0 : duplicatesRemoved,
			tasksAdded: dryRun ? 0 : tasksAdded,
			extraTasksFound: totalExtraTasks,
			extraTasksRemoved: dryRun ? 0 : extraTasksRemoved,
			invalidMappingsFound: invalidMappingsRemoved,
			invalidMappingsRemoved: dryRun ? 0 : invalidMappingsRemoved,
			pagesWithoutTaskId: pagesWithoutTaskId.length,
			duplicateDetails,
			additionDetails: dryRun ? additionDetails : [],
			preserveExtraTasks,
			summary: dryRun
				? `[DRY RUN] Would remove ${totalDuplicatePages} duplicates, sync ${missingTasks.length} TaskMaster tasks${totalExtraTasks > 0 && !preserveExtraTasks ? `, remove ${totalExtraTasks} extra tasks` : ''}${invalidMappingsRemoved > 0 ? `, and clean ${invalidMappingsRemoved} invalid sync mappings` : ''}`
				: `Removed ${duplicatesRemoved} duplicates, synced ${tasksAdded} TaskMaster tasks${extraTasksRemoved > 0 ? `, removed ${extraTasksRemoved} extra tasks` : ''}${invalidMappingsRemoved > 0 ? `, cleaned ${invalidMappingsRemoved} invalid sync mappings` : ''}`
		};

		logger.success(report.summary);

		return report;
	} catch (e) {
		logger.error('Failed to repair Notion DB:', e.message);
		return { success: false, error: e.message };
	}
}

export {
	setMcpLoggerForNotion,
	syncTasksWithNotion,
	updateNotionComplexityForCurrentTag,
	validateNotionSync,
	resetNotionDB,
	repairNotionDB
};
