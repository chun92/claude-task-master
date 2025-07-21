import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { COMPLEXITY_REPORT_FILE, TASKMASTER_TASKS_FILE } from '../../src/constants/paths.js';
import { getCurrentTag, readJSON } from './utils.js';


const LOG_TAG = '[Notion]';


// --- Notion config validation ---
let NOTION_TOKEN, NOTION_DATABASE_ID, notion, isNotionEnabled = false, notionConfigError = '';

async function validateNotionConfig(env) {
    if (!env.NOTION_TOKEN) {
        notionConfigError = `${LOG_TAG} NOTION_TOKEN is missing.`;
        return false;
    }
    if (!env.NOTION_DATABASE_ID) {
        notionConfigError = `${LOG_TAG} NOTION_DATABASE_ID is missing.`;
        return false;
    }
    try {
        const testNotion = new Client({ auth: env.NOTION_TOKEN });
        // Validate token/DB ID by making a real Notion API call
        await testNotion.databases.retrieve({ database_id: env.NOTION_DATABASE_ID });
        return true;
    } catch (e) {
        notionConfigError = `${LOG_TAG} Config validation failed: ${e.message}`;
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
      if (!isNotionEnabled) console.error(notionConfigError);
    })();
  }
  return notionInitPromise;
}

const TASKMASTER_NOTION_SYNC_FILE = '.taskmaster/notion-sync.json';

/**
 * Loads .env file and returns Notion credentials (token, database id)
 * @param {string} [envPath] - Optional path to .env file (default: project root)
 * @returns {{ NOTION_TOKEN: string, NOTION_DATABASE_ID: string }}
 */
function formatAsUUID(id) {
    // If already UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), return as is
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
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
function getTaskComplexityInfo(projectRoot) {
    try {
        const file = path.resolve(projectRoot, COMPLEXITY_REPORT_FILE); 
        if (!fs.existsSync(file)) {
            console.error(`${LOG_TAG} Complexity report file not found: ${file}`);
            return [];
        }
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(data.complexityAnalysis)) {
            console.error(`${LOG_TAG} Invalid complexityAnalysis format in ${file}`);
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
                result.push({ id: entry.taskId, complexityScore: entry.complexityScore, title: entry.taskTitle });
            }
        }
        return result;
    } catch (e) {
        console.error('Failed to read task complexity info:', e);
        return [];
    }
}

/**
 * Compares two objects (previous, current), normalizes them, and returns a list of changes (added, deleted, updated).
 * @param {Object} previous - Previous tasks object
 * @param {Object} current - Current tasks object
 * @param {Object} [options] - Options object
 * @param {boolean} [options.debug=false] - If true, prints diff details to console
 * @returns {Array<{id: number, type: 'added'|'deleted'|'updated', prev?: Object, cur?: Object}>}
 */
function diffTasks(previous, current, options = {}) {
    const { debug = false } = options;
    // Defensive: treat null/undefined as empty object
    const prevObj = previous && typeof previous === 'object' ? previous : {};
    const curObj = current && typeof current === 'object' ? current : {};

    // Get all tag names
    const prevTags = Object.keys(prevObj).filter(tag => prevObj[tag] && Array.isArray(prevObj[tag].tasks));
    const curTags = Object.keys(curObj).filter(tag => curObj[tag] && Array.isArray(curObj[tag].tasks));
    const allTags = Array.from(new Set([...prevTags, ...curTags]));

    const changes = [];

    for (const tag of allTags) {
        const prevTagTasks = prevObj[tag]?.tasks || [];
        const curTagTasks = curObj[tag]?.tasks || [];

        // If tag exists only in prev, all tasks/subtasks in prev are deleted
        if (prevTags.includes(tag) && !curTags.includes(tag)) {
            // flatten prevTagTasks
            for (const change of flattenTasksWithTag(prevTagTasks, tag)) {
                changes.push({ id: change.id, type: 'deleted', prev: change.task, tag });
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
                    changes.push({ id, type: 'updated', prev: prevTask, cur: curTask, tag });
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
    const added = changes.filter(c => c.type === 'added');
    const deleted = changes.filter(c => c.type === 'deleted');
    const moved = [];

    // 2. Compare deleted and added to each other
    for (const del of deleted) {
        for (const add of added) {
            // moved criteria: if title, description, details, testStrategy, status are all equal, treat as moved
            const fields = ['title', 'description', 'details', 'testStrategy', 'status'];
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
        ...changes.filter(c => c.type !== 'added' && c.type !== 'deleted'),
        ...added.filter(a => !a._matched),
        ...deleted.filter(d => !d._matched),
        ...moved
    ];

    // --- batch debug output ---
    if (debug) {
        for (const c of finalChanges) {
            if (c.type === 'added') {
                console.log(`${LOG_TAG} [ADDED][${c.tag}] id=${c.id}`, c.cur);
            } else if (c.type === 'deleted') {
                console.log(`${LOG_TAG} [DELETED][${c.tag}] id=${c.id}`, c.prev);
            } else if (c.type === 'updated') {
                console.log(`${LOG_TAG} [UPDATED][${c.tag}] id=${c.id}`);
                printTaskDiff(c.prev, c.cur, c.tag, c.tag);
            } else if (c.type === 'moved') {
                const oldTag = c.prev_tag
                const newTag = c.tag;
                console.log(`${LOG_TAG} [MOVED] [${oldTag}] ${c.id} => [${newTag}] ${c.cur_id}`);
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
            // Collect all subtask ids for this parent
            const subtaskIds = t.subtasks.map(st => st.id);
            flattenedSubtaskIds = t.subtasks.map(st => `${t.id}.${st.id}`);
            for (const st of t.subtasks) {
                const subId = `${t.id}.${st.id}`;
                // Convert dependencies
                let newDeps = st.dependencies;
                if (Array.isArray(st.dependencies)) {
                    newDeps = st.dependencies.map(dep => {
                        if (typeof dep === 'string' && dep.includes('.')) return dep;
                        if (
                            (typeof dep === 'number' || (typeof dep === 'string' && /^\d+$/.test(dep))) &&
                            subtaskIds.includes(Number(dep))
                        ) {
                            return `${t.id}.${dep}`;
                        }
                        return dep;
                    });
                }
                // Inherit priority from parent if not set
                const subtaskPriority = st.priority !== undefined ? st.priority : t.priority;
                arr.push({ id: subId, task: { ...st, id: subId, dependencies: newDeps, _parentId: t.id, _isSubtask: true, priority: subtaskPriority }, tag });
            }
        }
        // Replace subtasks field with flattenedSubtaskIds
        arr.push({ id: t.id, task: { ...t, _isSubtask: false, subtasks: flattenedSubtaskIds }, tag });
    }
    return arr;
}

// Helper: flatten tasks/subtasks for a tag, returns Map(id, task)
function flattenTasksMap(tasks) {
    const map = new Map();
    for (const t of tasks) {
        let flattenedSubtaskIds = [];
        if (Array.isArray(t.subtasks)) {
            const subtaskIds = t.subtasks.map(st => st.id);
            flattenedSubtaskIds = t.subtasks.map(st => `${t.id}.${st.id}`);
            for (const st of t.subtasks) {
                const subId = `${t.id}.${st.id}`;
                let newDeps = st.dependencies;
                if (Array.isArray(st.dependencies)) {
                    newDeps = st.dependencies.map(dep => {
                        if (typeof dep === 'string' && dep.includes('.')) return dep;
                        if (
                            (typeof dep === 'number' || (typeof dep === 'string' && /^\d+$/.test(dep))) &&
                            subtaskIds.includes(Number(dep))
                        ) {
                            return `${t.id}.${dep}`;
                        }
                        return dep;
                    });
                }
                // Inherit priority from parent if not set
                const subtaskPriority = st.priority !== undefined ? st.priority : t.priority;
                map.set(subId, { ...st, id: subId, dependencies: newDeps, _parentId: t.id, _isSubtask: true, priority: subtaskPriority });
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
        'title', 'description', 'details', 'testStrategy', 'priority', 'status'
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
        'id', 'title', 'description', 'details', 'testStrategy', 'priority', 'status', 'tag'
    ];
    for (const k of keys) {
        if (a[k] !== b[k]) {
            console.log(`  ${k}:`, a[k], '=>', b[k]);
        }
    }
    // Print dependencies diff
    const arrA = Array.isArray(a.dependencies) ? a.dependencies : [];
    const arrB = Array.isArray(b.dependencies) ? b.dependencies : [];
    if (arrA.length !== arrB.length || arrA.some((v, i) => v !== arrB[i])) {
        console.log('  dependencies:', arrA, '=>', arrB);
    }
    // Print subtasks diff
    const subA = Array.isArray(a.subtasks) ? a.subtasks : [];
    const subB = Array.isArray(b.subtasks) ? b.subtasks : [];
    if (subA.length !== subB.length || subA.some((v, i) => v !== subB[i])) {
        console.log('  subtasks:', subA, '=>', subB);
    }
    // Print tag diff
    if (prev_tag !== cur_tag) {
        console.log(`  tag: ${prev_tag || 'undefined'} => ${cur_tag || 'undefined'}`);
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
        console.error(`${LOG_TAG} Failed to load Notion sync mapping:`, e);
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
        console.error(`${LOG_TAG} Failed to save Notion sync mapping:`, e);
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
        complexity: task.complexity !== undefined ? { number: task.complexity } : undefined,
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
        return pageId ? `https://www.notion.so/${pageId.replace(/-/g, '')}` : undefined;
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
        props.dependencies = { rich_text: buildRichTextLinks(task.dependencies, getPageUrl) };
    }
    if (Array.isArray(task.subtasks)) {
        props.subtasks = { rich_text: buildRichTextLinks(task.subtasks, getPageUrl) };
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
    const {
        retries = 5,
        minDelay = 500,
        maxDelay = 8000,
        factor = 2
    } = options;
    let attempt = 0;
    let delay = minDelay;
    while (true) {
        try {
            return await fn();
        } catch (e) {
            const isRateLimit = e.status === 429 || (e.code === 'rate_limited') || (e.body && e.body.code === 'rate_limited');
            const isConflict = e.status === 409;
            const isNetwork = e.code === 'ENOTFOUND' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT';
            if ((isRateLimit || isConflict || isNetwork) && attempt < retries) {
                const wait = Math.min(delay, maxDelay);
                if (isRateLimit) {
                    console.warn(`${LOG_TAG} Rate limit (429). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`);
                } else if (isConflict) {
                    console.warn(`${LOG_TAG} Conflict (409). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`);
                } else {
                    console.warn(`${LOG_TAG} Network error (${e.code}). Retrying in ${wait}ms (attempt ${attempt + 1}/${retries})...`);
                }
                await new Promise(res => setTimeout(res, wait));
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
    const response = await executeWithRetry(() => notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties
    }));
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
    await executeWithRetry(() => notion.pages.update({
        page_id: notionId,
        properties
    }));
    saveNotionSyncMapping(mapping, meta, mappingFile);
}

/**
 * Updates Notion complexity property for tasks in the current tag that match id and title from COMPLEXITY_REPORT_FILE.
 * Only updates tasks where id and title both match.
 * @param {boolean} [debug=false] - If true, prints update log to console
 */
async function updateNotionComplexityForCurrentTag(projectRoot, debug = false) {
    await initNotion();
    if (!isNotionEnabled || !notion) {
        console.error(`${LOG_TAG} Notion sync is disabled. Skipping syncTasksWithNotion.`);
        return;
    }
    const tag = getCurrentTag(projectRoot);
    const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE);
    const taskmasterTasksFile = path.join(projectRoot, TASKMASTER_TASKS_FILE);
    const data = readJSON(taskmasterTasksFile, projectRoot, tag);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const complexityInfo = getTaskComplexityInfo(projectRoot);
    // Load mapping
    let { mapping, meta } = loadNotionSyncMapping(mappingFile);

    // --- Ensure all tasks have Notion mapping ---
    const prevMapping = JSON.stringify(mapping);
    mapping = await ensureAllTasksHaveNotionMapping(data._rawTaggedData, mapping, meta, mappingFile, debug);
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
                    await updateTaskInNotion({ ...task, complexity: match.complexityScore }, tag, mapping, meta, mappingFile);
                    updatedCount++;
                } catch (e) {
                    console.error(`${LOG_TAG} Failed to update Notion complexity for task id=${task.id}, title="${task.title}":`, e.message);
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
                                await updateTaskInNotion({ id: subId, complexity: match.complexityScore }, tag, mapping, meta, mappingFile);
                                updatedCount++;
                            } catch (e) {
                                console.error(`${LOG_TAG} Failed to update Notion complexity for subtask id=${subId} (parent id=${task.id}):`, e.message);
                            }
                        }
                    }
                }
            }
        }
    }
    if (debug) {
        console.log(`${LOG_TAG} Updated complexity for ${updatedCount} tasks in tag "${tag}".`);
    }
}

// Delete a task from Notion (with retry)
async function deleteTaskFromNotion(task, tag, mapping, meta, mappingFile) {
    const notionId = getNotionPageId(mapping, tag, task.id);
    if (!notionId) return;
    await executeWithRetry(() => notion.pages.update({ page_id: notionId, archived: true }));
    const newMapping = removeNotionPageId(mapping, tag, task.id);
    saveNotionSyncMapping(newMapping, meta, mappingFile);
}

/**
 * Ensures all tasks (tasksObj: tag -> {tasks: [...]}) have Notion mapping (Notion page exists for each task/subtask).
 * Returns updated mapping.
 * Can be used for any task object, such as prevTasks or curTasks.
 */
async function ensureAllTasksHaveNotionMapping(tasksObj, mapping, meta, mappingFile, debug = false) {
    for (const tag of Object.keys(tasksObj || {})) {
        const tasksArr = Array.isArray(tasksObj[tag]?.tasks) ? tasksObj[tag].tasks : [];
        for (const { id, task } of flattenTasksWithTag(tasksArr, tag)) {
            if (!getNotionPageId(mapping, tag, id)) {
                if (debug) console.log(`${LOG_TAG} Creating missing Notion page for [${tag}] ${id}`);
                try {
                    await addTaskToNotion(task, tag, mapping, meta, mappingFile);
                    // Reload mapping after add
                    ({ mapping } = loadNotionSyncMapping(mappingFile));
                } catch (e) {
                    console.error(`${LOG_TAG} Failed to create Notion page for [${tag}] ${id}:`, e.message);
                }
            }
        }
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
async function updateAllTaskRelationsInNotion(tasksObj, mapping, debug = false) {
    for (const tag of Object.keys(tasksObj || {})) {
        const tasksArr = Array.isArray(tasksObj[tag]?.tasks) ? tasksObj[tag].tasks : [];
        for (const { id, task } of flattenTasksWithTag(tasksArr, tag)) {
            // Only update if dependencies or subtasks exist and are non-empty
            const hasDeps = Array.isArray(task.dependencies) && task.dependencies.length > 0;
            const hasSubs = Array.isArray(task.subtasks) && task.subtasks.length > 0;
            if (!hasDeps && !hasSubs) continue;
            const notionId = getNotionPageId(mapping, tag, id);
            if (!notionId) continue;
            const relationProps = buildNotionRelationProperties(task, tag, mapping);
            if (Object.keys(relationProps).length === 0) continue;
            try {
                await executeWithRetry(() => notion.pages.update({
                    page_id: notionId,
                    properties: relationProps
                }));
                if (debug) console.log(`${LOG_TAG} Updated relations for [${tag}] ${id}`);
            } catch (e) {
                console.error(`${LOG_TAG} Failed to update relations for [${tag}] ${id}:`, e.message);
            }
        }
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
async function updateChangedTaskRelationsInNotion(changes, mapping, debug = false) {
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
            await executeWithRetry(() => notion.pages.update({
                page_id: notionId,
                properties: relationProps
            }));
            if (debug) console.log(`${LOG_TAG} Updated relations for [${tag}] ${id}`);
        } catch (e) {
            console.error(`${LOG_TAG} Failed to update relations for [${tag}] ${id}:`, e.message);
        }
    }
}

/**
 * Syncs tasks with Notion using diffTasks. Applies add, update, delete, move operations and updates the mapping file.
 * @param {Object} prevTasks - Previous tasks object (tag -> {tasks: [...]})
 * @param {Object} curTasks - Current tasks object (tag -> {tasks: [...]})
 * @param {Object} [options] - { debug, meta, mappingFile }
 */
async function syncTasksWithNotion(prevTasks, curTasks, projectRoot, options = {}) {
    await initNotion();
    if (!isNotionEnabled || !notion) {
        console.error(`${LOG_TAG} Notion sync is disabled. Skipping syncTasksWithNotion.`);
        return;
    }
    const { debug = false, meta = {} } = options;
    const mappingFile = path.resolve(projectRoot, TASKMASTER_NOTION_SYNC_FILE)
    // Load mapping
    let { mapping, meta: loadedMeta } = loadNotionSyncMapping(mappingFile);
    if (Object.keys(meta).length === 0) Object.assign(meta, loadedMeta);

    // --- Ensure all prevTasks have Notion mapping ---
    const prevMapping = JSON.stringify(mapping);
    mapping = await ensureAllTasksHaveNotionMapping(prevTasks, mapping, meta, mappingFile, debug);
    // --- Only update relations if mapping changed (i.e., new pages were added) ---
    if (JSON.stringify(mapping) !== prevMapping) {
        await updateAllTaskRelationsInNotion(prevTasks, mapping, debug);
    }

    // Diff
    const changes = diffTasks(prevTasks, curTasks, { debug });
    try {
        for (const change of changes) {
            if (change.type === 'added') {
                if (debug) console.log(`${LOG_TAG} Adding task: [${change.tag}] ${change.id}`);
                await addTaskToNotion(change.cur, change.tag, mapping, meta, mappingFile);
                // mapping is updated inside addTaskToNotion
                ({ mapping } = loadNotionSyncMapping(mappingFile));
            } else if (change.type === 'updated') {
                if (debug) console.log(`${LOG_TAG} Updating task: [${change.tag}] ${change.id}`);
                await updateTaskInNotion(change.cur, change.tag, mapping, meta, mappingFile);
            } else if (change.type === 'deleted') {
                if (debug) console.log(`${LOG_TAG} Deleting task: [${change.tag}] ${change.id}`);
                await deleteTaskFromNotion(change.prev, change.tag, mapping, meta, mappingFile);
                ({ mapping } = loadNotionSyncMapping(mappingFile));
            } else if (change.type === 'moved') {
                if (debug) console.log(`${LOG_TAG} Moving task: [${change.tag}] ${change.id} => ${change.cur_id}`);
                const oldTag = change.prev_tag;
                const oldId = change.id;
                const newTag = change.tag;
                const newId = change.cur_id;
                const notionId = getNotionPageId(mapping, oldTag, oldId);
                if (notionId) {
                    mapping = removeNotionPageId(mapping, oldTag, oldId);
                    mapping = setNotionPageId(mapping, newTag, newId, notionId);
                    saveNotionSyncMapping(mapping, meta, mappingFile);
                    await updateTaskInNotion(change.cur, newTag, mapping, meta, mappingFile);
                } else {
                    await addTaskToNotion(change.cur, newTag, mapping, meta, mappingFile);
                    ({ mapping } = loadNotionSyncMapping(mappingFile));
                }
            }
        }
    } catch (e) {
        console.error(`${LOG_TAG} Error during Notion sync:`, e.message);
        throw e; // Re-throw to handle it in the caller
    }
    // Update relations for changed tasks
    await updateChangedTaskRelationsInNotion(changes, mapping, debug);

    if (debug) console.log(`${LOG_TAG} Notion sync complete.`);
}

export {
    syncTasksWithNotion,
    updateNotionComplexityForCurrentTag
};