
# Task Master - Notion Sync

This project is a fork of [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master).
It extends the local task management features of Task Master by synchronizing your tasks to Notion, allowing you to leverage Notion's powerful database tools for visualization and management.

![Notion Kanban Screenshot](https://raw.githubusercontent.com/chun92/claude-task-master/main/screenshot/notion2.png)
![Notion Task Page Screenshot](https://raw.githubusercontent.com/chun92/claude-task-master/main/screenshot/notion1.png)

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

## Cautions

- It is recommended to use this tool from the console.
- MCP mode is supported, but some issues may occur during testing.
- `task-master-notion` shares the same `tasks.json` file as the original `task-master` and can be used together, but for stability, it is recommended to use only one tool at a time. If you use your existing `tasks.json` from `task-master` with `task-master-notion`, it is strongly recommended to make a backup just in case. The author is not responsible for any loss or corruption of your original file.

## Known Bugs (Current Version)
- If there are tasks in the master tag, running `parse` in another tag will re-add all master tag tasks to that tag. This can result in duplication of master tasks across tags.
- MCP may create duplicate tasks or use legacy formats unpredictably in multi-tag environments.


## Version Support

| Original Version | Notion Sync Support |
|------------------|--------------------|
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
