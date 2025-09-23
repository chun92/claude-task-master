# Task Master - Notion Sync

This project is a fork of [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master).
It extends the local task management features of Task Master by synchronizing your tasks to Notion, allowing you to leverage Notion's powerful database tools for visualization and management.

![Notion Kanban Screenshot](https://raw.githubusercontent.com/chun92/claude-task-master/main/screenshot/notion2.png)
![Notion Task Page Screenshot](https://raw.githubusercontent.com/chun92/claude-task-master/main/screenshot/notion1.png)

<div align='center'>
<a href="https://trendshift.io/repositories/13971" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13971" alt="eyaltoledano%2Fclaude-task-master | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</div>

<p align="center">
  <a href="https://task-master.dev"><img src="./images/logo.png?raw=true" alt="Taskmaster logo"></a>
</p>

<p align="center">
<b>Taskmaster</b>: A task management system for AI-driven development, designed to work seamlessly with any AI chat.
</p>

<p align="center">
  <a href="https://discord.gg/taskmasterai" target="_blank"><img src="https://dcbadge.limes.pink/api/server/https://discord.gg/taskmasterai?style=flat" alt="Discord"></a> |
  <a href="https://docs.task-master.dev" target="_blank">Docs</a>
</p>

<p align="center">
  <a href="https://github.com/eyaltoledano/claude-task-master/actions/workflows/ci.yml"><img src="https://github.com/eyaltoledano/claude-task-master/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/eyaltoledano/claude-task-master/stargazers"><img src="https://img.shields.io/github/stars/eyaltoledano/claude-task-master?style=social" alt="GitHub stars"></a>
  <a href="https://badge.fury.io/js/task-master-ai"><img src="https://badge.fury.io/js/task-master-ai.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT%20with%20Commons%20Clause-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/task-master-ai"><img src="https://img.shields.io/npm/d18m/task-master-ai?style=flat" alt="NPM Downloads"></a>
  <a href="https://www.npmjs.com/package/task-master-ai"><img src="https://img.shields.io/npm/dm/task-master-ai?style=flat" alt="NPM Downloads"></a>
  <a href="https://www.npmjs.com/package/task-master-ai"><img src="https://img.shields.io/npm/dw/task-master-ai?style=flat" alt="NPM Downloads"></a>
</p>

## By [@eyaltoledano](https://x.com/eyaltoledano) & [@RalphEcom](https://x.com/RalphEcom)

[![Twitter Follow](https://img.shields.io/twitter/follow/eyaltoledano)](https://x.com/eyaltoledano)
[![Twitter Follow](https://img.shields.io/twitter/follow/RalphEcom)](https://x.com/RalphEcom)

## Features

- Dump all Task Master tasks into a Notion database.
- Use Notion's Kanban board, timeline, calendar, and other views for your tasks.
- Add rich notes and details to each task page in Notion for enhanced productivity.

## Usage

For basic installation and setup, refer to the [original documentation](https://github.com/eyaltoledano/claude-task-master?tab=readme-ov-file#documentation).

### Additional Setup for Notion Sync

#### 1. Installation

**npm installation:**
1. Install globally:
   ```sh
   npm install -g task-master-ai-notion
   ```
2. Or install locally in your project:
   ```sh
   npm install task-master-ai-notion
   ```
3. After installation, use the command:
   ```sh
   task-master-notion init
   ```
4. After running `task-master-notion init` in your project, set the following in your `.env` file:
   ```env
   NOTION_TOKEN=...
   NOTION_DATABASE_ID=...
   ```
   For details on how to obtain and set these values, see [2. Notion Setup](#2-notion-setup) below.
**Note:** This installation provides the `task-master-notion` command, which can be used alongside the original `task-master` without conflict.

**Local installation:**
1. Clone the repo:
   ```sh
   git clone https://github.com/chun92/claude-task-master
   ```
2. Install dependencies:
   ```sh
   npm install
   # Run the following only if you want to use the command globally:
   npm link
   ```

[![Add task-master-ai MCP server to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=task-master-ai&config=eyJjb21tYW5kIjoibnB4IC15IC0tcGFja2FnZT10YXNrLW1hc3Rlci1haSB0YXNrLW1hc3Rlci1haSIsImVudiI6eyJBTlRIUk9QSUNfQVBJX0tFWSI6IllPVVJfQU5USFJPUElDX0FQSV9LRVlfSEVSRSIsIlBFUlBMRVhJVFlfQVBJX0tFWSI6IllPVVJfUEVSUExFWElUWV9BUElfS0VZX0hFUkUiLCJPUEVOQUlfQVBJX0tFWSI6IllPVVJfT1BFTkFJX0tFWV9IRVJFIiwiR09PR0xFX0FQSV9LRVkiOiJZT1VSX0dPT0dMRV9LRVlfSEVSRSIsIk1JU1RSQUxfQVBJX0tFWSI6IllPVVJfTUlTVFJBTF9LRVlfSEVSRSIsIkdST1FfQVBJX0tFWSI6IllPVVJfR1JPUV9LRVlfSEVSRSIsIk9QRU5ST1VURVJfQVBJX0tFWSI6IllPVVJfT1BFTlJPVVRFUl9LRVlfSEVSRSIsIlhBSV9BUElfS0VZIjoiWU9VUl9YQUlfS0VZX0hFUkUiLCJBWlVSRV9PUEVOQUlfQVBJX0tFWSI6IllPVVJfQVpVUkVfS0VZX0hFUkUiLCJPTExBTUFfQVBJX0tFWSI6IllPVVJfT0xMQU1BX0FQSV9LRVlfSEVSRSJ9fQ%3D%3D)

#### MCP Setup Example

The following is an example MCP configuration for **VS Code** (add to `.vscode/mcp.json`).
**Important:** You must add both `NOTION_TOKEN` and `NOTION_DATABASE_ID` to your MCP config for Notion sync to work. For details on how to obtain and set these values, see [2. Notion Setup](#2-notion-setup) below.
For more detailed MCP setup instructions, please refer to the [original documentation](https://github.com/eyaltoledano/claude-task-master?tab=readme-ov-file#option-1-mcp-recommended).

```json
{
  "servers": {
    "taskmaster-ai-notion": {
      "command": "npx",
      "args": ["-y", "--package=task-master-ai-notion", "task-master-ai-notion"],
      "env": {
        "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_API_KEY_HERE",
        "PERPLEXITY_API_KEY": "YOUR_PERPLEXITY_API_KEY_HERE",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY_HERE",
        "GOOGLE_API_KEY": "YOUR_GOOGLE_KEY_HERE",
        "MISTRAL_API_KEY": "YOUR_MISTRAL_KEY_HERE",
        "OPENROUTER_API_KEY": "YOUR_OPENROUTER_KEY_HERE",
        "XAI_API_KEY": "YOUR_XAI_KEY_HERE",
        "AZURE_OPENAI_API_KEY": "YOUR_AZURE_KEY_HERE",
        "NOTION_TOKEN=": "...",
        "NOTION_DATABASE_ID": "..."
      },
      "type": "stdio"
    }
  }
}
```

#### 2. Notion Setup

1. Create a Notion Integration at [Notion Integrations](https://www.notion.so/profile/integrations).
   - Set content capabilities: **Read content**, **Update content**, **Insert content**.
   - Use the Internal Integration Secret as your `NOTION_TOKEN`.
2. Import the Notion template from the Marketplace to your workspace: [Claude Task Master Notion Template](https://www.notion.com/ko/templates/claude-task-master).
   - On the imported page, set the Integration's Connections ([see guide](https://www.notion.com/help/add-and-manage-connections-with-the-api)).
   - Set the inline database's ID as `NOTION_DATABASE_ID`.
     - The database ID can be found in the Notion page URL (e.g., `https://www.notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, use the part before any query string).
     - **Important:** Use the database ID, not the page ID.

![Notion Usage Example](https://raw.githubusercontent.com/chun92/claude-task-master/main/screenshot/notion_usage.png)

#### 3. Updating for Existing Task Master Users

If you have a `tasks.json` from version 0.20.0 or later, you can use it directly. (Migration from older versions is not guaranteed.)
All updates to tasks in your project will be processed in bulk.

## 4. Notion Sync

After completing all setup, when you run Task Master commands such as `parse-prd`, `update`, `analyze-complexity`, or `set-status` to update the state of your tasks, those tasks will be automatically synced to Notion.

#### 6. Common Commands

Use your AI assistant to:

- Parse requirements: `Can you parse my PRD at scripts/prd.txt?`
- Plan next step: `What's the next task I should work on?`
- Implement a task: `Can you help me implement task 3?`
- View multiple tasks: `Can you show me tasks 1, 3, and 5?`
- Expand a task: `Can you help me expand task 4?`
- **Research fresh information**: `Research the latest best practices for implementing JWT authentication with Node.js`
- **Research with context**: `Research React Query v5 migration strategies for our current API implementation in src/api.js`

[More examples on how to use Task Master in chat](docs/examples.md)

### Option 2: Using Command Line

#### Installation

```bash
# Install globally
npm install -g task-master-ai-notion

# OR install locally within your project
npm install task-master-ai-notion
```

#### Initialize a new project

```bash
# If installed globally
task-master-notion init

# If installed locally
npx task-master-notion init

# Initialize project with specific rules
task-master-notion init --rules cursor,windsurf,vscode
```

This will prompt you for project details and set up a new project with the necessary files and structure.

#### Common Commands

```bash
# Initialize a new project
task-master-notion init

# Parse a PRD and generate tasks
task-master-notion parse-prd your-prd.txt

# List all tasks
task-master-notion list

# Show the next task to work on
task-master-notion next

# Show specific task(s) - supports comma-separated IDs
task-master-notion show 1,3,5

# Research fresh information with project context
task-master-notion research "What are the latest best practices for JWT authentication?"

# Move tasks between tags (cross-tag movement)
task-master-notion move --from=5 --from-tag=backlog --to-tag=in-progress
task-master-notion move --from=5,6,7 --from-tag=backlog --to-tag=done --with-dependencies
task-master-notion move --from=5 --from-tag=backlog --to-tag=in-progress --ignore-dependencies

# Generate task files
task-master-notion generate

# Add rules after initialization
task-master-notion rules add windsurf,roo,vscode
```

## Claude Code Support

Task Master now supports Claude models through the Claude Code CLI, which requires no API key:

- **Models**: `claude-code/opus` and `claude-code/sonnet`
- **Requirements**: Claude Code CLI installed
- **Benefits**: No API key needed, uses your local Claude instance

[Learn more about Claude Code setup](docs/examples/claude-code-usage.md)

## Troubleshooting

### If `task-master-notion init` doesn't respond

Try running it with Node directly:

```bash
node node_modules/task-master-ai-notion/scripts/init.js
```

Or clone the repository and run:

```bash
git clone https://github.com/chun92/claude-task-master.git
cd claude-task-master
node scripts/init.js
```

## Cautions

- It is recommended to use this tool from the console.
- MCP mode is supported, but some issues may occur during testing.
- `task-master-notion` shares the same `tasks.json` file as the original `task-master` and can be used together, but for stability, it is recommended to use only one tool at a time. If you use your existing `tasks.json` from `task-master` with `task-master-notion`, it is strongly recommended to make a backup just in case. The author is not responsible for any loss or corruption of your original file.

## Known Bugs (Current Version)
- MCP may create duplicate tasks or use legacy formats unpredictably in multi-tag environments.
- MCP may expand tasks in wrong way with multi-tag environments.

## Version Support

| Original Version | Notion Sync Support |
|------------------|--------------------|
| v0.26.0          | Supported          |
| v0.21.0          | Supported          |
| v0.20.0          | Supported          |
| Earlier versions | Not supported      |

This fork will continue to track and update for versions after v0.20.0

## License

Task Master is licensed under the MIT License with Commons Clause. See the [LICENSE](LICENSE) file for details.

## Original Authors & Contributors

- [@eyaltoledano](https://x.com/eyaltoledano)
- [@RalphEcom](https://x.com/RalphEcom)
- [@jasonzhou1993](https://x.com/jasonzhou1993)
- See [contributors](https://github.com/eyaltoledano/claude-task-master/graphs/contributors)

<a href="https://github.com/eyaltoledano/claude-task-master/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=eyaltoledano/claude-task-master" alt="Task Master project contributors" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=eyaltoledano/claude-task-master&type=Timeline)](https://www.star-history.com/#eyaltoledano/claude-task-master&Timeline)