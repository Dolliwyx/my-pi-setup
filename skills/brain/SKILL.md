---
name: brain
displayName: Brain
description: "Full reference for Brain: the Notion-like workspace platform. Use this skill whenever the user asks you to create, query, or modify databases, pages, docs, agents, skills, sites, or any other Brain resource. The brain_* tools below are exposed by Brain's MCP server (the legacy s16_* names still work as aliases)."
type: general
version: 1.0.0
tags: [brain, mcp, reference, platform]
---

# Brain platform reference

Brain is the AI workspace for your entire organization. Workspaces hold databases (EAV-schema, dynamic columns), docs (Tiptap rich-text), agents (sandboxed JS scripts), skills (SKILL.md prompts), and sites (publishable micro-pages). The tools listed below are exposed by Brain's MCP server.

## Core concepts

- **Workspace**: the top-level tenant; every resource belongs to exactly one workspace.
- **Database**: like a Notion database. Has properties (columns), pages (rows), views (table / board / list / calendar / gallery / timeline), and templates.
- **Page**: a row in a database. Has a properties_cache JSONB for fast reads, and a rich-text body.
- **Doc**: a standalone Tiptap document, not tied to any database.
- **Sidebar tree**: a single adjacency-list table linking docs, databases, and folders into a hierarchy. Has a separate "Private" section.
- **Agent**: a JS script that runs in a node:vm sandbox. Triggered manually, on schedule, on data changes, via webhook, or via Gmail. Uses the s16 API inside the sandbox.
- **Skill**: a SKILL.md file with YAML frontmatter that turns into an MCP prompt. Skills can be workspace-scoped, installed from marketplace, or system-level.
- **Site**: a publishable mini-app with a virtual filesystem (tree/files JSONB) that executes in a null-origin iframe.

## Authentication

Use brain_authenticate(returnUrl) and brain_complete_authentication when no Brain session exists. After auth, the MCP server holds the user context for every subsequent call.

## Common aiProjects

**Create a database with rows:**
1. brain_create_database: give it a name; primary title property is auto-created
2. brain_create_property: add the columns you want (text, select, relation, etc.)
3. brain_create_page: for each row

**Build an agent:**
1. brain_create_agent: name, systemPrompt, model, tools
2. brain_update_agent (you write the JS — a non-empty compiledScript on a draft vm agent auto-activates it)
3. brain_set_trigger: pick event / cron / webhook / gmail
4. brain_run_agent_by_name and brain_await_run to test

**Publish a site:**
1. brain_create_site
2. brain_create_site_page with files JSONB (a virtual filesystem)
3. The page becomes accessible at /s/<shareId>

## Tools

The brain_* tools below are the only way to read or write data in Brain. Pick the right one by skimming the descriptions. Each tool's input shape and an example payload is listed.


### agents

#### `brain_create_agent`

Create a new agent, then give it logic by writing its compiledScript via brain_update_agent — you write the JS (read brain_guide({ category: "agents" }) first so you use real brain.* methods, not invented ones). A vm agent runs that script as cheap sandboxed JS; an agent left WITHOUT a compiledScript falls back to an expensive LLM tool-calling loop on every run (driven by systemPrompt). Writing a non-empty compiledScript to a draft vm agent AUTO-ACTIVATES it (status draft→active); after that, verify it with brain_smoke_test_agent (or brain_run_agent + brain_await_run) before declaring it ready. Use skillIds to attach reusable knowledge. The new agent is auto-wrapped in its own AI Project; when several agents cooperate on one solution, add them to ONE shared AI Project with brain_add_project_item rather than leaving separate one-agent AI Projects. Returns the created agent.

Execution backend: agents default to 'vm' (sandboxed JS via the FLAT brain.* API — best for Brain data CRUD, HTTP, AI, transforms, scheduled jobs). Set executionBackend:'computer' (with agenticConfig) ONLY when the agent needs a real OS — a shell, writable filesystem, package install (pip/npm), git, a headless browser (Playwright), or long-running binaries; it runs in a gVisor pod (any workspace member, ~55s cold start, billed per pod-second). If the vm brain.* sandbox can do the job, use vm. A compiledScript is vm-only — do NOT set one on a computer-tier agent (it always runs an agentic loop).

**Input:**
  - `name`: string . Agent name
  - `category`?: string . Optional: a sidebar GROUP LABEL for the agent (NOT its name). Changing it re-groups the agent; clearing it (null) ungroups it. This never deletes the agent. To "rename a category", update this field on its agents.
  - `description`?: string . Agent description
  - `systemPrompt`?: string . System prompt for the agent
  - `model`?: string . Model ID (e.g. anthropic/claude-sonnet-5), or 'auto' to route every call by task. This is the DEFAULT model for the brain.ai / brain.aiStream / brain.aiChat calls inside the agent's compiledScript (a per-call { model } still wins), and the loop model for an agent that has no compiledScript. Discover current models via brain_list_models.
  - `modelParams`?: record . Model params: { temperature, max_tokens, ... }
  - `tools`?: array<any> . Custom tool definitions (OpenAI function calling format)
  - `inputSchema`?: record . JSON Schema for structured input
  - `skillIds`?: array<string> . Skill IDs to assign
  - `isLocked`?: boolean . If true, only owner can edit
  - `status`?: enum(active | draft | archived) . Agent status
  - `timeout`?: number . Execution timeout in seconds (default 3600 = 1 hour, max 86400 = 24 hours). For computer-tier agents this one value also caps the pod TTL and EACH run_code call (which otherwise defaults to 120s) — raise it (e.g. 1800) for long tasks or when the agent uses s16.askUser, which blocks a run_code call until the user replies.
  - `executionBackend`?: enum(vm | computer) . 'vm' (default sandboxed JS) or 'computer' (gVisor pod with real shell/fs/browser; any workspace member, billed per pod-second)
  - `agenticConfig`?: object . Agentic runtime config (model, capabilities, sizeTier, machineMode, dedicated, allowDestructive, …). Required shape for computer-tier agents.
  - `virtualMachineId`?: string (uuid) . The owned machine (Virtual Machines page) this agent runs on, or null for none. Top-level field, NOT an agenticConfig key. While set, the machine decides the size (agenticConfig.sizeTier/machine are ignored) and its keepWarm decides whether the pod is held between runs. Incompatible with machineMode 'persistent' and dedicated:true.
  - `llmSource`?: enum(auto | subscription | byok | platform) . WHOSE MONEY this agent's LLM calls spend: 'auto' (default — prefer the CREATOR's connected subscription (ChatGPT/Codex, Gemini, Grok), fall back to workspace credits), 'platform' (credits only, never a personal account), 'subscription' (a plan only), or 'byok' (a connected API KEY — pass llmCredentialId too). Only 'auto'/'subscription' depend on the model: a platform model id is billed to credits either way.
  - `llmCredentialId`?: string (uuid) . Which API key a llmSource:'byok' agent spends (brain_list_credentials gives the id). Required for 'byok': without it the agent falls back to 'auto' rather than picking whichever key of that brand it finds, which would be someone else's money. Ignored for the other sources — a subscription is resolved at run time from the creator's connected accounts.
  - `scratch`?: boolean . Set TRUE when you are creating this agent only to TRY SOMETHING OUT — a test, a demonstration, a throwaway you do not expect anyone to keep. The platform archives a scratch agent once it has gone quiet for a day, so the person's agent list does not fill with your experiments. It is an ARCHIVE, never a delete: its runs and its trace survive. Giving it a trigger cancels this. Leave it unset for anything you are building FOR the person.
  - `projectId`?: string (uuid) . Attach the new agent to this existing AI Project (project) id. Omit both project args to let it auto-wrap into its default project.
  - `newProjectName`?: string . Attach the new agent to a fresh AI Project created with this name. Ignored when projectId is set.

```json
{
  "tool": "brain_create_agent",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_delete_agent`

Delete an agent (irreversible; locked agents: owner only). Deleting the last agent in a category now removes the empty category grouping automatically. Returns { success }.

**Input:**
  - `agentId`: string (uuid) . Agent ID

```json
{
  "tool": "brain_delete_agent",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_agent`

Get full agent details including system prompt, model, tools, triggers. The response includes compiledScriptHash — pass it as expectedCompiledScriptHash to brain_update_agent when you modify compiledScript, so a stale rewrite cannot overwrite newer changes.

**Input:**
  - `agentId`: string (uuid) . Agent ID

```json
{
  "tool": "brain_get_agent",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_agent_webhook_url`

Get the webhook URL for an agent that has a webhook trigger configured. Returns { agentId, agentName, webhookUrl, mode } (mode = async | sync); errors if the agent has no webhook trigger.

**Input:**
  - `agentId`: string (uuid) . Agent ID

```json
{
  "tool": "brain_get_agent_webhook_url",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_agent_history`

List the change history of an agent (who edited it, when, and which fields changed). Each entry includes changedFields, per-field {from, to} diff (large values truncated), source (app | mcp | restore | system), and the editor user info. Optionally filter by userId to see only one editor's changes.

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `limit`?: number . Max entries to return (default 50, max 200)
  - `userId`?: string (uuid) . Optional: only return changes made by this user

```json
{
  "tool": "brain_list_agent_history",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_agent_versions`

List the saved versions (restorable snapshots) of an agent. Each entry has a version id, createdAt, optional changeDescription, the editor (`user`) and `actor` — the machine that wrote it, null for a person in the app. Use the version id with brain_restore_agent_version. (Differs from brain_list_agent_history, which returns the per-edit field diff.)

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `limit`?: number . Max versions to return (default 30)

```json
{
  "tool": "brain_list_agent_versions",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_agents`

List all agents (single sandboxed scripts) in the workspace. Returns an array of { id, name, description, category, model, status, isLocked, accessLevel, triggers } (triggers = count) — call brain_get_agent for the full systemPrompt/tools/compiledScript.

```json
{
  "tool": "brain_list_agents",
  "arguments": {}
}
```

#### `brain_run_agent`

Run an agent manually (the agent must have status:active — writing a non-empty compiledScript auto-activates a draft vm agent; drafts/archived are rejected). Agents with a compiledScript execute that JS; agents without one run an LLM tool-calling loop. Returns immediately with a run object { id, status } — call brain_await_run to wait for completion and read output/logs. To verify a not-yet-active agent without flipping its status, use brain_smoke_test_agent.

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `inputPrompt`?: string . Text prompt for the agent
  - `inputData`?: record . Structured input data (JSON)

```json
{
  "tool": "brain_run_agent",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_run_agent_by_name`

Find an agent by name (exact match first, then case-insensitive substring) and run it — handy when you know the name but not the UUID. The matched agent must have status:active. Returns the run object (with agentName); pass await:true to poll up to 120s and return the settled run incl. logs/output.

**Input:**
  - `name`: string . Agent name or substring to match (e.g. "Buffer", "Transcript Importer")
  - `inputPrompt`?: string . Text prompt for the agent
  - `inputData`?: record . Structured input data (JSON)
  - `await`?: boolean . If true, wait for the run to complete (up to 120s) and return full result including logs and output. Default: false

```json
{
  "tool": "brain_run_agent_by_name",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_set_agent_sharing`

Set who inside the workspace may see and use a agent. Everything starts as "private" — visible only to whoever created it, plus the workspace owner and admins — so a agent built for colleagues has to be shared before they can see it. Pass visibility "public" to open it to the whole workspace, or "restricted" with grantTo to name people. Returns the resulting grant list.

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `visibility`?: enum(public | restricted | private) . Who in the workspace may see and use it. "public" = the whole workspace, "restricted" = only the people in the grant list, "private" = only the creator (and the workspace owner/admins). Omit to leave it as it is.
  - `grantTo`?: array<string> . User ids to give access to. Use brain_list_workspace_members to find them.
  - `revokeFrom`?: array<string> . User ids to take access away from.

```json
{
  "tool": "brain_set_agent_sharing",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_agent`

Update an existing agent, including its `readme` (the write-up on its page). To give it logic, set compiledScript directly — you write the JS (read brain_guide({ category: "agents" }) for the sandbox API). Writing a non-empty compiledScript to a draft vm agent auto-activates it (status draft→active). Editing systemPrompt/model/tools does NOT rewrite the compiledScript — a vm agent keeps running its existing script; only an agent WITHOUT a compiledScript uses systemPrompt at run time (an LLM tool-calling loop). model is the exception that DOES take effect on a vm agent without a recompile: it is the default model for the brain.ai / brain.aiStream / brain.aiChat calls the script makes. Locked agents: owner-only. IMPORTANT: when setting compiledScript on an agent that already has one, you MUST first call brain_get_agent and pass its compiledScriptHash as expectedCompiledScriptHash — this is rejected otherwise. It prevents overwriting newer changes with a script generated from a stale copy. Always base your new script on the CURRENT compiledScript from brain_get_agent.

Execution backend: keep 'vm' (sandboxed JS) unless the agent needs a real OS — a shell, writable filesystem, package install, git, a browser, or long-running binaries — in which case set executionBackend:'computer' with agenticConfig (gVisor pod, any workspace member, billed per pod-second). See brain_guide({ category: "agents" }).

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `name`?: string . Agent name
  - `category`?: string . A sidebar GROUP LABEL for the agent (NOT its name). Changing it re-groups the agent; clearing it (null) ungroups it. This never deletes the agent. To "rename a category", update this field on its agents.
  - `description`?: string . Description
  - `systemPrompt`?: string . System prompt
  - `model`?: string . Model ID, or 'auto' to route every call by task. The DEFAULT model for brain.ai / brain.aiStream / brain.aiChat inside the compiledScript (a per-call { model } still wins), and the loop model for an agent without a compiledScript. Changing it re-points the agent's LLM calls without touching its script.
  - `modelParams`?: record . Model params
  - `tools`?: array<any> . Tool definitions
  - `inputSchema`?: record . Input schema
  - `skillIds`?: array<string> . Skill IDs to assign
  - `isLocked`?: boolean . Lock status
  - `status`?: enum(active | draft | archived) . Status
  - `compiledScript`?: string . Manually set the compiled JS script. Pass null to clear. Base it on the CURRENT script from brain_get_agent.
  - `expectedCompiledScriptHash`?: string . The compiledScriptHash from your most recent brain_get_agent. Required when overwriting an existing compiledScript — the write is rejected if the live script has changed since (optimistic concurrency / If-Match).
  - `timeout`?: number . Execution timeout in seconds (default 3600 = 1 hour, max 86400 = 24 hours). For computer-tier agents this one value also caps the pod TTL and EACH run_code call (which otherwise defaults to 120s) — raise it (e.g. 1800) for long tasks or when the agent uses s16.askUser, which blocks a run_code call until the user replies.
  - `executionBackend`?: enum(vm | computer) . 'vm' (default) or 'computer' (gVisor real-shell tier; any workspace member, billed per pod-second)
  - `agenticConfig`?: object . Agentic runtime config for computer-tier agents (model, capabilities, sizeTier, machineMode, dedicated, allowDestructive, …).
  - `virtualMachineId`?: string (uuid) . The owned machine this agent runs on, or null to take it off one. Top-level field, NOT an agenticConfig key. While set, the machine decides the size and its keepWarm decides whether the pod is held between runs. Incompatible with machineMode 'persistent' and dedicated:true.
  - `llmSource`?: enum(auto | subscription | byok | platform) . WHOSE MONEY this agent's LLM calls spend: 'auto' (default — prefer the CREATOR's connected subscription (ChatGPT/Codex, Gemini, Grok), fall back to workspace credits), 'platform' (credits only, never a personal account), 'subscription' (a plan only), or 'byok' (a connected API KEY — pass llmCredentialId too). Only 'auto'/'subscription' depend on the model: a platform model id is billed to credits either way.
  - `llmCredentialId`?: string (uuid) . Which API key a llmSource:'byok' agent spends (brain_list_credentials gives the id). Required for 'byok': without it the agent falls back to 'auto' rather than picking whichever key of that brand it finds, which would be someone else's money. Ignored for the other sources — a subscription is resolved at run time from the creator's connected accounts.
  - `readme`?: string . The agent's ReadMe — the full write-up shown on its page, in markdown (headings, **bold**, - bullets). Gated exactly like the rest of this tool: if you may edit the agent, you may edit its ReadMe.

```json
{
  "tool": "brain_update_agent",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### blocks

#### `brain_create_block`

Append ONE block to a page body. A typed block (callout, toggle, bulleted_list, embed_database, quote, code, heading_*, to_do, divider, image, file) is translated into the editor's own markup and appended to the body, so it RENDERS — until 2026-09-21 it was written as a separate row that the page never read and nobody ever saw. For several blocks at once prefer brain_update_page_content, and to change an existing block use brain_edit_page_blocks. Returns the page's body block.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `parentBlockId`?: string (uuid) . Optional parent block ID
  - `type`: enum(paragraph | heading_1 | heading_2 | heading_3 | bulleted_list | numbered_list | to_do | toggle | code | quote | divider | image | file | table | embed_database | callout | bookmark) . Block type: paragraph, heading_1/2/3, bulleted_list, numbered_list, to_do, toggle, code, quote, divider, image, file, table, embed_database, callout, bookmark
  - `content`?: record . Free-form JSONB payload whose keys depend on type. Text-bearing blocks (paragraph/heading/quote/callout) carry rich text under content.html. {} for divider.
  - `position`?: number . Optional block position

```json
{
  "tool": "brain_create_block",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "type": "paragraph"
  }
}
```

#### `brain_delete_block`

Delete a block from a page. Returns { success }.

**Input:**
  - `blockId`: string (uuid) . Block ID

```json
{
  "tool": "brain_delete_block",
  "arguments": {
    "blockId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_blocks`

List blocks for a page in editor order. Returns block rows ({ id, type, content, position, ... }). For reading/writing page body as HTML prefer brain_get_page_content / brain_update_page_content.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_list_blocks",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_block`

Update a block's type, content, or position. Returns the updated block.

**Input:**
  - `blockId`: string (uuid) . Block ID
  - `type`?: enum(paragraph | heading_1 | heading_2 | heading_3 | bulleted_list | numbered_list | to_do | toggle | code | quote | divider | image | file | table | embed_database | callout | bookmark) . Block type
  - `content`?: record . Free-form JSONB payload whose keys depend on type. Text-bearing blocks carry rich text under content.html. Replaces the existing content.
  - `position`?: number . Block position

```json
{
  "tool": "brain_update_block",
  "arguments": {
    "blockId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### cells

#### `brain_update_cell`

Update a single cell value on a row. Use property ID (UUID). Value types by property type: text/title/url/email/phone→string, number→number, checkbox→boolean, date→ISO string, select/status→option label string, multi_select→comma-separated labels, relation→comma-separated target page UUIDs or string[] of UUIDs (UUIDs, not titles — resolve names via brain_list_pages first), files→array of { name, url, size?, mimeType? } objects (use brain_upload_file first to get URLs). Prefer brain_bulk_update_cells to set several fields at once. Returns { success, stored } — `stored` is the value the cell HOLDS after the write, read back from the row: compare it with what you intended before you tell anybody it is done.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `propertyId`: string (uuid) . Property ID (UUID from brain_get_database)
  - `value`: union . New value

```json
{
  "tool": "brain_update_cell",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000",
    "value": null
  }
}
```

### credentials

#### `brain_create_credential`

Create a service credential (API key, bot token, OAuth token, etc.) (workspace admin/owner only). Credentials are stored as JSON. The returned `id` is the STABLE handle — hardcode that uuid in the agent script and read the credential with brain.getCredentialById(id) / brain.requireCredentialById(id); never reference an integration by title, because a rename breaks it. Common services: telegram, airtable, slack, github, openai, stripe, twilio.

**Input:**
  - `service`: string . Service identifier (e.g. "telegram", "airtable", "slack")
  - `title`?: string . Human-readable title (e.g. "Orbit Bot", "S16vc CRM 2.0")
  - `credentials`: record . Credentials JSON. Telegram: { botToken, botUsername? }. Airtable: { apiKey, baseId }. Generic: { apiKey } or any key-value pairs.
  - `connectionType`?: enum(manual | oauth) . manual or oauth
  - `provider`?: enum(google | google_drive | krisp | generic_oauth) . OAuth provider ID
  - `capabilities`?: array<enum> . Credential capabilities
  - `accountIdentifier`?: string . Optional email/account identifier
  - `visibility`?: enum(public | private) . public — anyone in workspace and any agent can use; private — only creator and agents owned by creator. Defaults to private.

```json
{
  "tool": "brain_create_credential",
  "arguments": {
    "service": "service",
    "credentials": null
  }
}
```

#### `brain_delete_credential`

Delete a service credential (workspace admin/owner only). Irreversible.

**Input:**
  - `id`: string (uuid) . Credential ID

```json
{
  "tool": "brain_delete_credential",
  "arguments": {
    "id": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_credential`

Get a single credential with provider-aware metadata (workspace admin/owner only).

**Input:**
  - `credentialId`: string (uuid) . Credential ID

```json
{
  "tool": "brain_get_credential",
  "arguments": {
    "credentialId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_credential_auth_session`

Get the current status of a credential OAuth session (workspace admin/owner only): "pending" until the user authorizes, then "completed" (credential in `result`) or "failed" (`error`). Reading it is what settles a Nango connection finished in another tab.

**Input:**
  - `sessionId`: string (uuid) . OAuth session ID

```json
{
  "tool": "brain_get_credential_auth_session",
  "arguments": {
    "sessionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_credential_providers`

List available credential providers and their supported capabilities (workspace admin/owner only).

```json
{
  "tool": "brain_list_credential_providers",
  "arguments": {}
}
```

#### `brain_update_credential`

Update an existing service credential (workspace admin/owner only). The credentials field REPLACES the entire stored JSON object — pass the full set, not a partial patch.

**Input:**
  - `id`: string (uuid) . Credential ID
  - `title`?: string . New title
  - `credentials`?: record . New credentials JSON (replaces entire object)
  - `status`?: enum(active | inactive) . Status
  - `connectionType`?: enum(manual | oauth) . manual or oauth
  - `provider`?: enum(google | google_drive | krisp | generic_oauth) . OAuth provider ID
  - `capabilities`?: array<enum> . Credential capabilities
  - `accountIdentifier`?: string . Optional email/account identifier
  - `visibility`?: enum(public | private) . public — anyone in workspace and any agent can use; private — only creator and agents owned by creator

```json
{
  "tool": "brain_update_credential",
  "arguments": {
    "id": "00000000-0000-0000-0000-000000000000"
  }
}
```

### databases

#### `brain_create_database`

Create a new database in the workspace. Automatically creates the primary title property and a default table view. Pass `folderId` to drop it straight into a sidebar folder (top-level database only; ignored when parentPageId embeds it in a page). Returns the new database row.

**Input:**
  - `name`: string . Database name
  - `parentPageId`?: string (uuid) . Nest this database under an existing page (embedded/inline DB). Omit for a top-level database; databases with a parentPageId are excluded from brain_list_databases.
  - `folderId`?: string (uuid) . Sidebar folder id to file the new top-level database into (from brain_list_folders)
  - `isPrivate`?: boolean . Whether the database is private to its creator

```json
{
  "tool": "brain_create_database",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_delete_database`

Delete a database and all its rows (workspace admin/owner only; irreversible). Returns { success }.

**Input:**
  - `databaseId`: string (uuid) . Database ID

```json
{
  "tool": "brain_delete_database",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_database`

Get a database schema: properties (id, name, type, isPrimary), views, and templates (id, name, isDefault). Use property IDs for filters/sorts in brain_list_pages. Use template IDs with brain_get_template/brain_apply_template.

**Input:**
  - `databaseId`: string (uuid) . Database ID

```json
{
  "tool": "brain_get_database",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_databases`

List all databases in the workspace. Returns { id, name, folder } where folder = the sidebar folder it sits in ({ id, name } or null). Use brain_get_database to get properties.

```json
{
  "tool": "brain_list_databases",
  "arguments": {}
}
```

#### `brain_reorder_databases`

Reorder top-level databases in the workspace sidebar. Returns the reordered database list.

**Input:**
  - `orderedIds`: array<string> . Database IDs in final order

```json
{
  "tool": "brain_reorder_databases",
  "arguments": {
    "orderedIds": []
  }
}
```

#### `brain_set_database_default_template`

Set or clear the default template applied to new rows in a database (templateId null clears it). Returns the updated database.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `templateId`?: string (uuid) . Template page ID or null to clear

```json
{
  "tool": "brain_set_database_default_template",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_database`

Update database metadata: name, icon, property order, and privacy. Returns the updated database.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `name`?: string . New database name
  - `icon`?: string . Icon: emoji ("🚀"), Phosphor name ("icon:Rocket"), or image URL
  - `propertyOrder`?: array<string> . Ordered property IDs
  - `isPrivate`?: boolean . Whether the database is private

```json
{
  "tool": "brain_update_database",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### docs

#### `brain_create_doc`

Create a new doc in the workspace. Can set title and rich content in one call (markdown default, or HTML). Pass `folderId` to drop it straight into a sidebar folder (top-level doc only; ignored when parentId nests it under another doc). For images/files/charts pass HTML embeds — full spec: brain_guide({ category: "rich_embeds" }). Returns the new doc plus a url.

**Input:**
  - `title`: string . Doc title
  - `parentId`?: string (uuid) . Parent doc ID (nests the doc under another doc — NOT a folder)
  - `folderId`?: string (uuid) . Sidebar folder id to file the new top-level doc into (from brain_list_folders)
  - `content`?: string . Doc body content in markdown or HTML
  - `contentFormat`?: enum(markdown | html) . Content format
  - `isPrivate`?: boolean . Whether the doc is private

```json
{
  "tool": "brain_create_doc",
  "arguments": {
    "title": "title"
  }
}
```

#### `brain_delete_doc`

Archive a doc and its subtree to trash. Reversible via brain_restore_doc. Returns { success }.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_delete_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_doc_permanently`

Permanently delete a doc and its subtree (irreversible). Returns { success }.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_delete_doc_permanently",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc`

Get a doc with its metadata (id, title, parentId, icon, coverUrl, shareId, config, ...) plus a url, `publicUrl` (the ready-to-send public share link when the doc isPublic, else null — send it verbatim, never build a share URL yourself), and `folder` = the sidebar folder it sits in ({ id, name } or null). Use brain_get_doc_content for the HTML body. The legacy `folderId` field is intentionally omitted (dead column, unrelated to sidebar folders).

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_get_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_ancestors`

Get the ancestor chain of a doc, root first. Returns [{ id, title, parentId }] (the doc itself excluded).

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_get_doc_ancestors",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_backlinks`

Find docs whose body links to the target doc (by docId substring match). Returns an array of doc rows, newest first.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `limit`?: number . Max results

```json
{
  "tool": "brain_get_doc_backlinks",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_content`

Get the rich content (HTML) of a doc. Returns full HTML body.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_get_doc_content",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_images`

List image files embedded in a doc, each with a directly fetchable URL (signed, ~5 min, for private files). Returns [{ fileId, url, name, mimeType, size }].

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_get_doc_images",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_layout`

Read the STRUCTURE of a doc: every block in order, how it nests, and how it is configured — column count and per-column widths, callout icons, database embeds with their view type / height / hidden chrome / filter count, list items, table size, image widths. Use this instead of brain_get_doc_content when you are about to change a layout: the HTML is the same document as one long string, and a block here carries the `id` you can name in a later edit. Returns { blocks, counts }.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_get_doc_layout",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_doc_version`

Read ONE saved version of a document: its title and body HTML exactly as a restore would re-apply it, plus `actor` — the machine that wrote it, null for a person. Use it to confirm a version is the right one before calling brain_restore_doc_version. `unavailable: true` means the payload was pruned by retention and this version can no longer be restored.

**Input:**
  - `versionId`: string (uuid) . Version ID from brain_list_doc_versions

```json
{
  "tool": "brain_get_doc_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_doc_children`

List the direct child docs of a doc, in sidebar order. Returns an array of doc rows.

**Input:**
  - `docId`: string (uuid) . Parent doc ID

```json
{
  "tool": "brain_list_doc_children",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_doc_versions`

List the saved content versions of a document, newest first. Each entry has a version id, createdAt, optional label, `user` (the PERSON the write happened for) and `actor` (the MACHINE that made it: { type: "agent"|"ai_chat"|"mcp", label, agentId, runId }, or null when a person wrote it in the app — for an agent, `label` is its name as it was at write time). Use the id with brain_get_doc_version to inspect one, or brain_restore_doc_version to roll the document back. Versions are saved automatically as the document is edited.

**Input:**
  - `docId`: string (uuid) . Document ID
  - `limit`?: number . Max versions to return (default 30)
  - `cursor`?: object . Pass the previous call's nextCursor to get the next page

```json
{
  "tool": "brain_list_doc_versions",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_docs`

List docs in the workspace (top-level, or children of parentId). Returns [{ id, title, parentId, createdAt, updatedAt, url }].

**Input:**
  - `parentId`?: string (uuid) . Parent doc ID (omit for root docs)

```json
{
  "tool": "brain_list_docs",
  "arguments": {}
}
```

#### `brain_move_doc`

Move a doc under another parent, or to the root (parentId null). Returns the updated doc.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `parentId`?: string (uuid) . New parent doc ID or null

```json
{
  "tool": "brain_move_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_set_doc_content_from_file`

Replace a doc body with the content of a previously uploaded file (see brain_upload_file / brain_create_upload_url). The server reads the file directly, so there is no tool-input size limit — use this for very large docs (long reports, DDQ responses, etc.) that do not fit in a single tool call. The file should contain markdown or HTML text. Content format is inferred from the file name / MIME type (.md or text/markdown → markdown, otherwise HTML) unless contentFormat is given. Replaces all existing content.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `fileId`: string (uuid) . File ID of an uploaded markdown/HTML file
  - `contentFormat`?: enum(markdown | html) . Override content format. Defaults to inference from the file name / MIME type.

```json
{
  "tool": "brain_set_doc_content_from_file",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000",
    "fileId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_set_doc_sharing`

Enable or disable public sharing for a doc. Returns the updated doc with a resolved `publicUrl` — the ready-to-send public link (the workspace's own host + /share/<shareId>) when public, else null. Send `publicUrl` verbatim; never construct a share URL by guessing a host or subdomain.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `isPublic`: boolean . Whether the doc should be public

```json
{
  "tool": "brain_set_doc_sharing",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000",
    "isPublic": false
  }
}
```

#### `brain_update_doc`

Update a doc: title, icon, cover, config, hierarchy, archived/private flags, and/or body content (markdown default or HTML; replaces existing). For images/files/charts pass HTML embeds — full spec: brain_guide({ category: "rich_embeds" }). Returns the updated doc.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `title`?: string . New title
  - `icon`?: string . Icon: emoji ("🚀"), Phosphor name ("icon:Rocket"), or image URL
  - `coverUrl`?: string . Cover image URL
  - `config`?: record . Doc config merge patch, e.g. { fullWidth: true }
  - `parentId`?: string (uuid) . Parent doc ID
  - `position`?: number . Sibling position
  - `isArchived`?: boolean . Archived state
  - `isPrivate`?: boolean . Private state
  - `content`?: string . Doc body content in markdown or HTML (replaces existing)
  - `contentFormat`?: enum(markdown | html) . Content format

```json
{
  "tool": "brain_update_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_doc_content`

Set the rich content of a doc. This REPLACES ALL existing content — you MUST provide the COMPLETE document body, never a fragment: anything you omit is permanently DELETED, so never send just a rewritten section. For a large document that does not fit in a single call, do NOT truncate here — set the first block-aligned chunk with this tool (or start empty), then build the rest with successive brain_append_doc_content calls (~10K tokens each, split only at block boundaries). Accepts markdown (converted to HTML) or raw HTML. Returns { success, docId, blocks } where blocks counts what the doc now holds, plus differences[] when the editor schema changed something you sent. For layout blocks (callouts, columns, live database views) and images/files/charts pass contentFormat "html" — full spec: brain_guide({ category: "rich_embeds" }); read a layout back with brain_get_doc_layout.

Supported markdown syntax:
- Headings: # H1, ## H2, ### H3
- Bold: **text**, Italic: *text*, Strikethrough: ~~text~~
- Inline code: `code`, Links: [text](url)
- Bullet list: - item
- Numbered list: 1. item
- Task list (to-do): - [ ] unchecked, - [x] checked
- Blockquote: > text
- Code block: ```lang ... ```
- Horizontal rule: ---
- Collapsible block (toggle): >>> Title\ncontent lines\n<<< (use ">>> closed: Title" to start collapsed)
- Callout (titled box with an icon): > [!TIP] Title, then indented > lines for the body (NOTE/TIP/IMPORTANT/WARNING/CAUTION)

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `content`: string . Content in markdown or HTML format
  - `contentFormat`?: enum(markdown | html) . Content format: markdown (default) or html

```json
{
  "tool": "brain_update_doc_content",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000",
    "content": "content"
  }
}
```

### files

#### `brain_create_file`

Register a file record (step 3 of the brain_create_upload_url flow — pass the id + s3Key it returned). Returns the created file record.

**Input:**
  - `id`?: string (uuid) . Pre-allocated file id from brain_create_upload_url
  - `name`: string . File name
  - `url`: string (url) . File URL. A direct S3 bucket URL (the publicUrl of a public create_upload_url) registers a PUBLIC, embed-anywhere file; a /file/serve proxy URL registers a PRIVATE file.
  - `s3Key`?: string . S3 object key from brain_create_upload_url
  - `size`?: number . Optional file size in bytes
  - `mimeType`?: string . Optional MIME type
  - `public`?: boolean . Force public/private, overriding the URL-shape inference.

```json
{
  "tool": "brain_create_file",
  "arguments": {
    "name": "name",
    "url": "https://example.com"
  }
}
```

#### `brain_delete_file`

Delete a file record. Returns { success }.

**Input:**
  - `fileId`: string (uuid) . File ID

```json
{
  "tool": "brain_delete_file",
  "arguments": {
    "fileId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_file_url`

Get a directly fetchable, temporary URL for a workspace file by id (signed, ~5 min, for private files). Lets you hand a Brain file to an external service (Telegram, email) without making the whole doc public. Returns { url, mimeType, name }.

**Input:**
  - `fileId`: string (uuid) . File ID

```json
{
  "tool": "brain_get_file_url",
  "arguments": {
    "fileId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_files`

List files uploaded in the current workspace. Returns file rows ({ id, name, url, size, mimeType, ... }); url is an auth-gated proxy — use brain_get_file_url for a fetchable signed URL.

```json
{
  "tool": "brain_list_files",
  "arguments": {}
}
```

#### `brain_upload_file`

Upload a small file from base64-encoded data to S3 storage. Returns the created file record with its hosted URL. Use the returned file record to set a "files" property value via brain_update_cell or brain_bulk_update_cells (pass an array of { name, url, size?, mimeType? } objects). NOTE: tool inputs are limited (~100 KB raw, ~150 KB after base64). For anything larger (decks, PDFs, contracts, models) use brain_create_upload_url + brain_create_file instead — that path streams the file directly to S3 without going through the MCP request body.

**Input:**
  - `filename`: string . File name including extension (e.g. "deck.pdf")
  - `contentType`?: string . MIME type (e.g. "application/pdf"). Defaults to application/octet-stream.
  - `base64`: string . Base64-encoded file content
  - `public`?: boolean . Make the file publicly embeddable (no auth). Defaults to TRUE for raster images so embeds render everywhere — incl. share pages, emails, Telegram, off-platform. SVG and non-images default private; an SVG never renders inline from a Brain URL, so upload a PNG when the picture has to be embedded.

```json
{
  "tool": "brain_upload_file",
  "arguments": {
    "filename": "filename",
    "base64": "base64"
  }
}
```

### pages

#### `brain_archive_page`

Mark a row archived (sets isArchived; hidden from default views, still queryable and editable). Reversible. NOT trash — use brain_delete_page to trash. Returns { success }.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_archive_page",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_count_pages`

Count rows in a database with optional ANDed filters and search. Returns { count }.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `filters`?: array<object> . Column filters as [{ propertyId, operator, value }], all ANDed
  - `search`?: string . Search term

```json
{
  "tool": "brain_count_pages",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_create_page`

Create a new row in a database. Can set title, property values, and rich content in one call. For cells, use property NAME (case-insensitive) as key. Value types: text/title/url/email/phone→string, number→number, checkbox→boolean, date→ISO string, select/status→option label string, multi_select→comma-separated labels or string[], relation→comma-separated target page UUIDs or string[] of UUIDs. Returns the new page fields at top level plus { warnings, url } (responseFormat "minimal" → { id }, "cells" → { id, propertiesCache }; both avoid echoing the table schema, ~13K tokens/call on wide tables).

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `title`?: string . Page title (primary property value)
  - `cells`?: record . Property values as { propertyName: value }. Use property NAME (case-insensitive). For relation: pass string[] of UUIDs. Example: { "Status": "Active", "Company": ["uuid1", "uuid2"] }
  - `content`?: string . Page body in markdown or HTML. For images/files/charts use contentFormat "html" with <div data-type="file-embed">/<div data-type="chart-embed">. Full embed spec: brain_guide({ category: "rich_embeds" }). Writes through to an open live editor, so it lands whether or not someone has the page open.
  - `contentFormat`?: enum(markdown | html) . Content format. MUST be "html" when content includes <div data-type="file-embed"> or <div data-type="chart-embed"> — markdown mode strips them.
  - `responseFormat`?: enum(minimal | cells | full) . Response verbosity. "full" (default): complete page object with per-cell schema and content. "cells": id + row values keyed by property ID, no schema. "minimal": { id } only — avoids echoing the table schema (~13K tokens/call on wide tables), best for bulk writes.

```json
{
  "tool": "brain_create_page",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_page`

Move a row to trash (sets deletedAt; blocks further edits until restored). Distinct from brain_archive_page. No MCP restore tool — restore from trash in the UI. Returns { success }.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_delete_page",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_page`

Get a row by ID. Returns the page with cellValues (per-cell with property), blocks (body), propertiesCache (FLAT), isDeleted, url and `publicUrl` (the ready-to-send public share link when the row isPublic, else null — send it verbatim, never build a share URL yourself). For body HTML use brain_get_page_content.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_get_page",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_page_content`

Get the rich content (HTML) of a page/row. Returns the full HTML body of the page editor.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_get_page_content",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_page_images`

List image files embedded in a page/row, each with a directly fetchable URL (signed, ~5 min, for private files). Use this instead of regexing page HTML or hitting /file/serve yourself. Returns [{ fileId, url, name, mimeType, size }].

**Input:**
  - `pageId`: string (uuid) . Page/row ID

```json
{
  "tool": "brain_get_page_images",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_page_layout`

Read the STRUCTURE of a page: every block in order, how it nests, and how it is configured — column count and per-column widths, callout icons, database embeds with their view type / height / hidden chrome / filter count, list items, table size, image widths. Use this instead of brain_get_page_content when you are about to change a layout: the HTML is the same document as one long string, and a block here carries the `id` you can name in a later edit. Returns { blocks, counts }.

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_get_page_layout",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_page_version`

Read ONE saved version of a row: its body HTML exactly as a restore would re-apply it, plus the cell values it held (keyed by property ID) and `actor` — the machine that wrote it, null for a person. Use it to confirm a version is the right one before calling brain_restore_page_version. `unavailable: true` means the payload was pruned by retention and this version can no longer be restored.

**Input:**
  - `versionId`: string (uuid) . Version ID from brain_list_page_versions

```json
{
  "tool": "brain_get_page_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_page_versions`

List the saved content versions of a row, newest first. Each entry has a version id, createdAt, optional label, `user` (the PERSON the write happened for) and `actor` (the MACHINE that made it: { type: "agent"|"ai_chat"|"mcp", label, agentId, runId }, or null when a person wrote it in the app — for an agent, `label` is its name as it was at write time). Use the id with brain_get_page_version to inspect one, or brain_restore_page_version to roll the row back. Versions are saved automatically (on cell writes, on editor idle, and before a delete).

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `limit`?: number . Max versions to return (default 30)
  - `cursor`?: object . Pass the previous call's nextCursor to get the next page

```json
{
  "tool": "brain_list_page_versions",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_pages`

List rows in a database with search, ANDed filters, sort and field projection. Returns { items, nextCursor }; each item has { id, propertiesCache (FLAT, may be stale — pass withCells to refresh given properties), url, ... }. Note: relation cells in propertiesCache hold TITLES; get target UUIDs via brain_list_relations.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `limit`?: number . Max pages (default 50)
  - `cursor`?: number . Offset cursor for pagination
  - `search`?: string . Full-text search across all cell values
  - `searchField`?: string (uuid) . Restrict search to this property ID
  - `filters`?: array<object> . Column filters as [{ propertyId, operator, value }], all ANDed
  - `sorts`?: array<object> . Sort order as [{ propertyId, direction }]
  - `fields`?: array<string> . Return only these property IDs from propertiesCache (primary always included)
  - `withCells`?: array<string> . Load fresh cell values from DB for these property IDs

```json
{
  "tool": "brain_list_pages",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_set_page_sharing`

Enable or disable public sharing for a row. Returns the updated page with a resolved `publicUrl` — the ready-to-send public link (the workspace's own host + /share/<shareId>) when public, else null. Send `publicUrl` verbatim; never construct a share URL by guessing a host or subdomain.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `isPublic`: boolean . Whether the page should be public

```json
{
  "tool": "brain_set_page_sharing",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "isPublic": false
  }
}
```

#### `brain_update_page`

Update an existing row: set cell values and/or replace page content. Use property NAME (case-insensitive) for cells. Content can be markdown (default) or HTML. Returns { page, warnings } (page fields are nested under "page", unlike brain_create_page which is flat); responseFormat "minimal" → { id }, "cells" → { id, propertiesCache } to keep responses small for bulk writes.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `databaseId`: string (uuid) . Database ID (needed to resolve property names)
  - `cells`?: record . Property values as { propertyName: value }
  - `content`?: string . Page body in markdown or HTML (replaces existing). For images/files/charts use contentFormat "html". Full embed spec: brain_guide({ category: "rich_embeds" }). Writes through to an open live editor, so it lands whether or not someone has the page open.
  - `contentFormat`?: enum(markdown | html) . Content format. MUST be "html" when content includes <div data-type="file-embed"> or <div data-type="chart-embed"> — markdown mode strips them.
  - `icon`?: string . Page icon
  - `coverUrl`?: string (url) . Page cover URL
  - `config`?: record . Page config merge patch, e.g. { fullWidth: true }
  - `responseFormat`?: enum(minimal | cells | full) . Response verbosity. "full" (default): complete page object with per-cell schema and content. "cells": id + row values keyed by property ID, no schema. "minimal": { id } only — avoids echoing the table schema (~13K tokens/call on wide tables), best for bulk writes.

```json
{
  "tool": "brain_update_page",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_page_content`

Set the rich content of a row, replacing all existing content. Accepts markdown (converted to HTML) or raw HTML. Writes through to an open live editor, so it lands whether or not someone has the page open.

Supported markdown syntax:
- Headings: # H1, ## H2, ### H3
- Bold: **text**, Italic: *text*, Strikethrough: ~~text~~
- Inline code: `code`, Links: [text](url)
- Bullet list: - item
- Numbered list: 1. item
- Task list (to-do): - [ ] unchecked, - [x] checked
- Blockquote: > text
- Code block: ```lang ... ```
- Horizontal rule: ---
- Collapsible block (toggle): >>> Title\ncontent lines\n<<< (use ">>> closed: Title" to start collapsed)

- Callout (titled box with an icon): > [!TIP] Title, then indented > lines for the body (NOTE/TIP/IMPORTANT/WARNING/CAUTION).

For layout blocks (callouts, side-by-side columns, live database views, toggles) and for images / files / charts, pass contentFormat "html". Callout: <div data-type="callout" data-icon="🌞"><p>..</p></div>. Columns (TWO or more): <div data-type="columns"><div data-type="column" style="flex-grow: 2">..</div><div data-type="column">..</div></div>. Live view: <div data-type="database-embed" databaseid=".." workspaceid=".." viewtype="calendar"></div>. Full spec + attributes + gotchas: brain_guide({ category: "rich_embeds" }). Read a layout back with brain_get_page_layout. Returns { success, pageId, blocks } where blocks counts what the page now holds, plus differences[] when the schema changed something you sent.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `content`: string . Content in markdown or HTML format. Use HTML for images/files/charts (see tool description).
  - `contentFormat`?: enum(markdown | html) . Content format: "markdown" (default) or "html". MUST be "html" when content includes <div data-type="file-embed"> or <div data-type="chart-embed">.

```json
{
  "tool": "brain_update_page_content",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "content": "content"
  }
}
```

### platform

#### `brain_add_project_item`

Add an existing asset (referenced by its own id) to an AI Project. By default this adds a COPY of the asset, EXCEPT integrations and databases which are linked by reference (they share the original — copying a credential/secret or a database's rows would be wrong). Pass mode:"reference" to attach the asset ITSELF instead of a copy — that is what you want when the project simply owns something the script analyzer did not derive on its own (the site an agent publishes to, a page, another agent), since a duplicated site is a member nothing writes to. The source must belong to the same workspace. Copies get a fresh id; reference-adds are idempotent. Pass an optional position to control ordering. Returns { mode: "copied" | "linked", assetType, name }.

**Input:**
  - `projectId`: string (uuid) . AI Project id
  - `itemType`: enum(agent | skill | integration | component | site | database | page | folder) . agent | skill | integration | component | site | database | page | folder
  - `itemId`: string (uuid) . Id of the existing asset to add
  - `position`?: number . Optional 0-based ordering position among members
  - `mode`?: enum(copy | reference) . "copy" (default for agents/skills/sites/components/pages) duplicates the asset; "reference" attaches the existing one, shared

```json
{
  "tool": "brain_add_project_item",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000",
    "itemType": "agent",
    "itemId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_add_relation`

Link a target row to a source row through a relation property. If the relation is two-way (has inversePropertyId), the inverse side is updated automatically. Returns { relations, page } (the source row's updated relation list and its page).

**Input:**
  - `sourcePageId`: string (uuid) . Source page ID
  - `targetPageId`: string (uuid) . Target page ID
  - `propertyId`: string (uuid) . Relation property ID

```json
{
  "tool": "brain_add_relation",
  "arguments": {
    "sourcePageId": "00000000-0000-0000-0000-000000000000",
    "targetPageId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_admin_add_credits`

Add credits to any workspace (platform admin only). Resolves the workspace by id (UUID) or slug, records a manual top-up entry for audit, and updates the credit balance. Returns { workspace, creditsAdded, amountUsdEquivalent, balance: { balanceCredits, lockedCredits }, topupId }.

**Input:**
  - `workspace`: string . Workspace id (UUID) or slug
  - `credits`: number . Number of credits to add (must be positive)
  - `note`?: string . Free-form audit note saved alongside the top-up record

```json
{
  "tool": "brain_admin_add_credits",
  "arguments": {
    "workspace": "workspace",
    "credits": 0
  }
}
```

#### `brain_ai_chat`

Ask the full Brain AI chat a question and get its answer — the SAME agentic assistant as the in-app chat, headless. It autonomously reads/computes/acts over the workspace (it runs code over the whole Brain API as you, and only mutates data when the message clearly asks), and can produce charts/images. Use this to power a bot or external service that should "do everything the AI chat can" with one call, instead of orchestrating tools yourself. There is no server-side memory: pass prior turns as `history` for a multi-turn conversation. Returns { text, attachments, calledMethods, model } — send `text` back to your user. Billed to the workspace.

**Input:**
  - `prompt`: string . The user message / question to answer.
  - `model`?: string . Model id (e.g. 'anthropic/claude-sonnet-5'). Omit or 'auto' to route by task — with `images`, omitting it picks a vision model automatically, while a pinned model that cannot see fails the call with a capability error naming the model. List options with brain_list_models.
  - `reasoningEffort`?: enum(minimal | low | medium | high | xhigh | max) . Reasoning effort for models that support it.
  - `context`?: string . Extra grounding text to give the assistant.
  - `history`?: array<object> . Prior conversation turns YOU keep, oldest first — for multi-turn memory.
  - `images`?: array<string> . Up to 4 image URLs for the assistant to look at (vision).
  - `files`?: array<object> . Up to 5 text files (url + name) for the assistant to read.
  - `skillInstructions`?: string . A skill body to steer the assistant style/behaviour.
  - `imageModel`?: enum(google/gemini-2.5-flash-image | google/gemini-3-pro-image-preview | google/gemini-3.1-flash-image-preview | openai/gpt-image-1.5 | krea/krea-2-medium-turbo | krea/krea-2-large | sourceful/riverflow-v2.5-fast | recraft/recraft-v4.1 | xai/grok-imagine-image-2.0 | xai/grok-imagine-image-quality | black-forest-labs/flux.2-max | black-forest-labs/flux.2-pro | qwen/qwen-image-3-pro | qwen/qwen-image-3) . Image-generation model id (for when the assistant makes an image). The set is closed — omit it for the default. Any spelling of an offered id is accepted (the bare id brain_list_models prints resolves to its full form).

```json
{
  "tool": "brain_ai_chat",
  "arguments": {
    "prompt": "prompt"
  }
}
```

#### `brain_append_doc_content`

Append rich content to the END of a doc body without replacing existing content. Accepts markdown (converted to HTML) or raw HTML. Use this to build a large doc across several calls when the full content does not fit in a single tool call — push successive block-aligned chunks (e.g. ~10K tokens each). Chunk only at block boundaries (whole paragraphs/headings/tables), never mid-element. Appending to an empty doc behaves like setting its content. Supports the same markdown syntax as brain_update_doc_content.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `content`: string . Content to append, in markdown or HTML format
  - `contentFormat`?: enum(markdown | html) . Content format: markdown (default) or html

```json
{
  "tool": "brain_append_doc_content",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000",
    "content": "content"
  }
}
```

#### `brain_await_run`

Wait for an agent run to settle — polls every 1s until status is success | failed | cancelled, or the timeout elapses (default 120s, max 300s). Returns the full run incl. status, output, scriptLogs, tokensUsed (still-running if it timed out).

**Input:**
  - `runId`: string (uuid) . Agent run ID to wait for
  - `timeoutSeconds`?: number . Max seconds to wait (default 120)

```json
{
  "tool": "brain_await_run",
  "arguments": {
    "runId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_bulk_delete_pages`

Move multiple rows to trash (soft delete, sets deletedAt). No MCP restore tool — restore from trash in the UI. Returns { success, deleted } (count actually trashed).

**Input:**
  - `pageIds`: array<string> . Array of Page IDs (max 100)

```json
{
  "tool": "brain_bulk_delete_pages",
  "arguments": {
    "pageIds": []
  }
}
```

#### `brain_bulk_update_cells`

Update several cell values on a row in one call. Use property NAME (case-insensitive) as key. Value types: text/title/url/email/phone→string, number→number, checkbox→boolean, date→ISO string, select/status→option label string, multi_select→comma-separated labels or string[], relation→comma-separated target page UUIDs or string[] of UUIDs (UUIDs, not titles), files→array of { name, url, size?, mimeType? } objects. Returns { success, updated, errors? } (errors lists per-property warnings for unresolved names or rejected values).

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `databaseId`: string (uuid) . Database ID (needed to resolve property names)
  - `cells`: record . Property values as { propertyName: value }. Use property NAME (case-insensitive).

```json
{
  "tool": "brain_bulk_update_cells",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "cells": null
  }
}
```

#### `brain_bulk_update_rows`

Write cells across MANY rows in one call — the set-based form of brain_bulk_update_cells, and what to use instead of calling it in a loop. One call resolves the schema once and writes the whole set as one operation, so a table of rows costs one round trip instead of one per row. Keys in `cells` are property NAMES (case-insensitive) or ids; the primary/title property is skipped. Value types are the same as brain_bulk_update_cells. Max 200 rows and 1000 cells per call — over either it refuses rather than truncating, so send the rest in another call. Returns COUNTS, never rows: { rows, updated, unchanged, failed, overwroteManualEdits, warnings }. `overwroteManualEdits` is how many of the changed cells a person had last edited BY HAND — the write is never blocked, but say so in your answer when it is not zero, because somebody's own correction was just replaced.

**Input:**
  - `databaseId`: string (uuid) . Database ID (all rows must belong to it)
  - `rows`: array<object> . The rows to write, each with its own cells

```json
{
  "tool": "brain_bulk_update_rows",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "rows": []
  }
}
```

#### `brain_call_mcp_tool`

Call a tool exposed by a remote MCP credential (workspace admin/owner only). Inspect brain_list_mcp_tools first and then call the selected tool by name.

**Input:**
  - `credentialId`: string (uuid) . Credential ID for the remote MCP connection
  - `toolName`: string . Remote MCP tool name
  - `args`?: record . Arguments passed to the remote tool

```json
{
  "tool": "brain_call_mcp_tool",
  "arguments": {
    "credentialId": "00000000-0000-0000-0000-000000000000",
    "toolName": "toolName"
  }
}
```

#### `brain_cancel_run`

Cancel a running agent run: terminates the worker thread and sets run status to "cancelled". Safe to call on an already-finished run (no-op). Returns { cancelled } (false if nothing was running to cancel).

**Input:**
  - `runId`: string (uuid) . Agent run ID to cancel

```json
{
  "tool": "brain_cancel_run",
  "arguments": {
    "runId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_cell_provenance`

Where one cell's value came from: the recent edits, who or what made each, and — for an agent edit — the models that produced it, what that run cost in credits, and the agent version live at the time. All read from records that already exist, so it is the truth at read time rather than a snapshot taken at write time. Use it before trusting or overwriting a value.

**Input:**
  - `pageId`: string (uuid) . The row (page) the cell belongs to
  - `propertyId`: string (uuid) . The column
  - `limit`?: number . How many recent edits. Default 20.

```json
{
  "tool": "brain_cell_provenance",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_check_project_updates`

Check whether an installed AI Project has upstream changes: compares this copy against the project it was installed from. Returns { status: "unavailable" | "up_to_date" | "updates", sourceName, items: [{ sourceItemId, localItemId, itemType, name, change: "new" | "updated" | "removed", localEdited, pullable }] }. Databases are never auto-pulled (their schema is yours once installed), and a "removed" item is a report only — drop it yourself with brain_remove_project_item. Apply one change with brain_pull_project_asset.

**Input:**
  - `projectId`: string (uuid) . Installed AI Project id

```json
{
  "tool": "brain_check_project_updates",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_column_confidence`

How much of a column can be accounted for: a sample of up to 1 000 live cells classified by who last edited each, reduced to one confidence number (the share whose last editor is an agent run with billing records to back it). Four buckets, deliberately distinct: person (someone typed it), attributed (an agent run we can trace), unattributed (an agent edit with no traceable run), no-history (never edited since the column existed). Ask it before running a bulk write over a column: a high number means the column is machine-maintained and traceable, a low one means most of it is nobody-knows.

**Input:**
  - `databaseId`: string (uuid) . The table
  - `propertyId`: string (uuid) . The column

```json
{
  "tool": "brain_column_confidence",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_convert_relation_to_two_way`

Convert a one-way relation property to two-way: creates an inverse column on the target database and backfills existing relation data. Check isTwoWay in brain_get_database output first. Returns { success, inverseProperty: { id, name, databaseId } }.

**Input:**
  - `propertyId`: string (uuid) . One-way relation property ID to convert

```json
{
  "tool": "brain_convert_relation_to_two_way",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_create_folder`

Create a sidebar folder in the workspace. Returns the new folder { id, name, ... }. Nest it under an existing folder with parentId. File docs/databases into it with brain_move_to_folder, or create docs straight inside with brain_create_doc({ folderId }).

**Input:**
  - `name`: string . Folder name
  - `icon`?: string . Optional emoji/icon
  - `parentId`?: string (uuid) . Parent folder id to nest under (omit for top level)
  - `isPrivate`?: boolean . Create in the private section (default false = workspace-shared)

```json
{
  "tool": "brain_create_folder",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_create_pdf`

Turn HTML into a PDF and store it, returning a durable file URL. Use this for any "make me a PDF" — a report, an invoice, a summary, a one-pager — INSTEAD of starting a computer task: no virtual machine, no browser, no pod, one call. Write ordinary HTML (headings, paragraphs, lists, tables, <img>); it is rendered with the same stylesheet a document export uses, so the result looks like the rest of the product. Images must be Brain file URLs or data: URIs — anything else is dropped rather than fetched, and scripts, iframes and remote stylesheets are removed. Returns { url, name, size, mimeType }.

**Input:**
  - `html`: string . The document body as HTML.
  - `title`?: string . Printed as the heading at the top of the first page.
  - `name`?: string . File name. ".pdf" is added when missing.
  - `workspaceId`?: string (uuid) . Target workspace. Omit to use your default workspace.

```json
{
  "tool": "brain_create_pdf",
  "arguments": {
    "html": "html"
  }
}
```

#### `brain_create_project`

Create an AI Project — a named collection of agents, a site, and databases that work together as one solution (e.g. a Telegram bot and everything that powers it). Returns the new project; add members with brain_add_project_item.

**Input:**
  - `name`: string . AI Project name (e.g. "Orbit bot")
  - `description`?: string . What this project does

```json
{
  "tool": "brain_create_project",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_create_upload_url`

Generate a presigned PUT URL for uploading a file directly to S3 storage. Use this for files of ANY size — the file content does not pass through the MCP request, so there is no ~100KB tool-input limit (unlike brain_upload_file). AiProject: 1) Call brain_create_upload_url to get { fileId, uploadUrl, publicUrl, key, requiredHeaders }. 2) PUT the file bytes directly to uploadUrl with the listed requiredHeaders — always echo the returned x-amz-acl header (e.g. `curl -X PUT -H "Content-Type: ..." -H "x-amz-acl: public-read" --data-binary @photo.png "<uploadUrl>"` for a public file, or `x-amz-acl: private` for a private one). 3) Call brain_create_file with { id: fileId, name, url: publicUrl, s3Key: key, size, mimeType } to register the upload. 4) Use that record to fill a "files" property via brain_update_cell or brain_bulk_update_cells. The signed URL expires in 600 seconds. When public:true, the requiredHeaders carry x-amz-acl: public-read and the publicUrl is a DIRECT, embed-anywhere S3 URL (renders in <img> off-platform). Otherwise the upload is private and the publicUrl is an auth-gated proxy that resolves a fresh short-lived signed URL per request. Defaults to public for raster images; SVG and non-images default private. An SVG is script-capable and is never served inline, so it does not render as an inline image from a Brain URL — upload a PNG when the picture has to be embedded.

**Input:**
  - `filename`: string . File name including extension (e.g. "deck.pdf")
  - `contentType`?: string . MIME type (e.g. "application/pdf"). Defaults to application/octet-stream.
  - `public`?: boolean . Make the file publicly embeddable (no auth). Defaults to TRUE for raster images so embeds render everywhere — incl. share pages, emails, Telegram, off-platform. SVG and non-images default private; an SVG never renders inline from a Brain URL, so upload a PNG when the picture has to be embedded.

```json
{
  "tool": "brain_create_upload_url",
  "arguments": {
    "filename": "filename"
  }
}
```

#### `brain_credential_history`

What has happened to one integration, newest first: who connected it, who renamed it from what to what, who changed who can use it, and when it broke or was reconnected. Returns [{ id, action, actorId, actorName, detail, at }] where `action` is "connected" | "renamed" | "visibility_changed" | "status_changed" | "access_granted" | "access_revoked" | "reauthorized" and `detail` carries the before/after values. A null `actorName` means the platform did it and no person was involved — a token refresh that was refused, for instance. ANSWER "which of these two is which" WITH THIS plus the `createdAt` / `createdBy` from brain_list_credentials, rather than saying you have no such data.

**Input:**
  - `credentialId`: string (uuid) . Credential ID from brain_list_credentials
  - `limit`?: number . How many entries, newest first. Default 50.

```json
{
  "tool": "brain_credential_history",
  "arguments": {
    "credentialId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_project`

Delete an AI Project. For a user-authored project this ALSO deletes its member agents (each agent's runs/triggers/versions cascade); member sites and databases are NOT deleted (only their membership rows go). For a CATEGORY grouping (auto-created, named after an agent category) it removes ONLY the grouping — the agents stay. NEVER use delete to RENAME or RELABEL a category/project — that destroys agents; use brain_update_project to rename a project, or brain_update_agent({ category }) to move/relabel an agent. Returns { success, changed, removedAgents } — changed:false means the project was already gone; removedAgents:0 for a category grouping.

**Input:**
  - `projectId`: string (uuid) . AI Project id

```json
{
  "tool": "brain_delete_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_trigger`

Delete an agent trigger by id (irreversible). Returns { success }.

**Input:**
  - `triggerId`: string (uuid) . Trigger ID

```json
{
  "tool": "brain_delete_trigger",
  "arguments": {
    "triggerId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_describe_methods`

Full documentation for named brain.* methods: what each one does, when to use it, and an example. The capability index you already have lists every method that exists with its signature and return shape — read this only when that line is not enough to call one correctly. Pass exact names as the index spells them ("readDatabase"), or a fragment or resource name ("mail") to get that whole group. It never invents: a name that matches nothing is reported as matching nothing.

**Input:**
  - `methods`: array<string> . Method names as the index lists them ("readDatabase"), or a fragment / resource name ("mail") to get that group.

```json
{
  "tool": "brain_describe_methods",
  "arguments": {
    "methods": []
  }
}
```

#### `brain_drive_create_file`

Create a file in Google Drive. Brain keeps access to whatever it creates, so this is the one way to get a Drive file nobody had to pick. Pass content as UTF-8 text or as a data: URL (the exact string brain_drive_read returns with asDataUrl). Set mimeType to "application/vnd.google-apps.document" / ".spreadsheet" / ".presentation" to have Drive CONVERT the uploaded text or HTML into a Google file. Uploads are capped at 5 MB. folderId must name a folder Brain may write to — a folder this connection cannot reach is refused by name. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. Returns { id, name, mimeType, isFolder, size, createdTime, modifiedTime, webViewLink, iconLink, parents, trashed, shortcutTargetId }.

**Input:**
  - `name`: string . File name, e.g. "Q3 forecast.md"
  - `content`?: string . UTF-8 text, or a data: URL for binary content. Omit to create an empty file.
  - `mimeType`?: string . MIME type of the created file. A "application/vnd.google-apps.*" value converts the content into a native Google file.
  - `folderId`?: string . Create it inside this folder id. Omit for the root of the connected Drive.
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_create_file",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_drive_create_folder`

Create a folder in Google Drive. Brain keeps access to what it creates, so files it later puts in this folder stay reachable. parentFolderId must name a folder Brain may write to — a folder this connection cannot reach is refused by name. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. Returns the created folder record.

**Input:**
  - `name`: string . Folder name
  - `parentFolderId`?: string . Create it inside this folder id. Omit for the root of the connected Drive.
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_create_folder",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_drive_get`

Get the metadata of one Google Drive file or folder — name, MIME type, size, timestamps, parents, webViewLink. Reads no content (use brain_drive_read for that). Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. A file this connection cannot reach is refused by name; Drive answers the same way for a deleted file, so the refusal cannot tell the two apart. A result carrying `shortcutTargetId` is a SHORTCUT, not the file: it has no content of its own, so use that target id with drive.get / drive.read / drive.list instead. Returns { id, name, mimeType, isFolder, size, createdTime, modifiedTime, webViewLink, iconLink, parents, trashed, shortcutTargetId }.

**Input:**
  - `fileId`: string . Google Drive file id (from brain_drive_list / brain_drive_search — NOT a Brain uuid)
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_get",
  "arguments": {
    "fileId": "fileId"
  }
}
```

#### `brain_drive_list`

List Google Drive files. Omit folderId to list EVERYTHING this connection can see; pass folderId to list the children of one folder. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. An empty result is answered with a `note` saying so, and never means "the Drive is empty". A result carrying `shortcutTargetId` is a SHORTCUT, not the file: it has no content of its own, so use that target id with drive.get / drive.read / drive.list instead. Returns { files: [{ id, name, mimeType, isFolder, size, createdTime, modifiedTime, webViewLink, iconLink, parents, trashed, shortcutTargetId }], nextPageToken, note }.

**Input:**
  - `folderId`?: string . List the children of this folder id. Omit to list everything that was picked, plus everything Brain created.
  - `pageSize`?: number . Files per page, 1-100 (default 50)
  - `pageToken`?: string . nextPageToken from a previous call
  - `mimeType`?: string . Return only files of this exact MIME type (e.g. "application/pdf", "application/vnd.google-apps.document")
  - `includeTrashed`?: boolean . Include trashed files (default false)
  - `orderBy`?: string . Drive sort expression, e.g. "modifiedTime desc" (the default), "name", "createdTime desc"
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_list",
  "arguments": {}
}
```

#### `brain_drive_read`

Read the CONTENT of one Google Drive file as text. Google-native files are exported first (Docs → markdown, Sheets → spreadsheet, Slides → PDF, overridable with exportMimeType); Word/Excel/CSV are flattened to text; anything else comes back with `text: null` and a note naming what to do instead. Text over 100000 characters is cut and flagged with `truncated`; files over 10 MB are refused. Reading a SHORTCUT is refused with the id to read instead — A result carrying `shortcutTargetId` is a SHORTCUT, not the file: it has no content of its own, so use that target id with drive.get / drive.read / drive.list instead. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. Returns { fileId, filename, mimeType, size, text, truncated, dataUrl, note }.

**Input:**
  - `fileId`: string . Google Drive file id
  - `exportMimeType`?: string . Export format for a Google-native file, e.g. "text/plain", "text/markdown", "text/csv", "application/pdf". Ignored for ordinary files. A format Drive cannot produce for this file is refused rather than silently swapped.
  - `asDataUrl`?: boolean . Also return the raw bytes as a data: URL (default false). The base64 payload after the comma is exactly what brain_upload_file takes as `base64`. Costs ~33% more than the file size in response text — leave it off unless you need the bytes.
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_read",
  "arguments": {
    "fileId": "fileId"
  }
}
```

#### `brain_drive_search`

Search the Google Drive files this connection can see by a PLAIN term (matched against name and full text) — not Drive query syntax. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. Searching reaches exactly what brain_drive_list reaches and no further, so an empty result is an answer about what this connection can REACH, never about the Drive. Returns { files: [...], nextPageToken, note }.

**Input:**
  - `query`: string . Plain search term, e.g. "Q3 forecast". Not Drive query syntax.
  - `folderId`?: string . Restrict the search to the children of this folder id
  - `driveQuery`?: string . Escape hatch: a raw Drive API `q` expression ANDed with the term above (e.g. "modifiedTime > '2026-01-01T00:00:00'"). Leave empty unless you know the syntax — a malformed expression is refused by Google.
  - `pageSize`?: number . Files per page, 1-100 (default 50)
  - `pageToken`?: string . nextPageToken from a previous call
  - `mimeType`?: string . Return only files of this exact MIME type (e.g. "application/pdf", "application/vnd.google-apps.document")
  - `includeTrashed`?: boolean . Include trashed files (default false)
  - `orderBy`?: string . Drive sort expression, e.g. "modifiedTime desc" (the default), "name", "createdTime desc"
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_search",
  "arguments": {
    "query": "query"
  }
}
```

#### `brain_drive_update_file`

Rename a Google Drive file and/or REPLACE its content — content is overwritten whole, never appended, so read it first if you mean to edit it. Pass at least one of name/content. Uploads are capped at 5 MB; moving a file between folders is not offered. Brain sees only the files and folders the person picked in Google Drive, plus what Brain created itself. A file this connection cannot reach, or one the account may only read, is refused by name. Returns the updated file record.

**Input:**
  - `fileId`: string . Google Drive file id
  - `name`?: string . New file name
  - `content`?: string . Replacement content: UTF-8 text, or a data: URL for binary content
  - `mimeType`?: string . MIME type of the replacement content (defaults to the content's own)
  - `credentialId`?: string (uuid) . Which connected Google Drive account to use, by credential id. Omit it — Brain then uses the first Google Drive connection you may spend, which is the normal case — and pass one only when somebody names a specific connection.
  - `credentialTitle`?: string . Pick the Google Drive connection by its title instead of its id. Prefer credentialId: a rename breaks a title lookup.

```json
{
  "tool": "brain_drive_update_file",
  "arguments": {
    "fileId": "fileId"
  }
}
```

#### `brain_duplicate_doc`

Duplicate a doc and its whole subtree. Returns the new root doc.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_duplicate_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_duplicate_page`

Duplicate a row including its cell values and page settings. Returns the new page (with id and FLAT propertiesCache).

**Input:**
  - `pageId`: string (uuid) . Page ID

```json
{
  "tool": "brain_duplicate_page",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_duplicate_property`

Duplicate an existing property/column (config only, not cell values). Returns the new property.

**Input:**
  - `propertyId`: string (uuid) . Property ID

```json
{
  "tool": "brain_duplicate_property",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_edit_doc_blocks`

Change PART of a doc without re-sending the whole body. Each edit names one block — by the `id` from brain_get_doc_layout (preferred; an embed or a columns wrapper has no id, so use `at` for those) or by `at`, the position path from the same layout read ([2,1,0] = third top-level block, its second column, that column's first block). Ops: replace | insertAfter | insertBefore | delete | setAttrs (merged, so changing an embed's height keeps its database and filters) | append (end of doc, no target). Anything you do not name is untouched, so this is the safe way to add a section to a doc you did not write. Edits apply in order. An unknown target is refused by name rather than silently skipped.

**Input:**
  - `docId`: string (uuid) . Doc ID
  - `edits`: array<object> . Edits, applied in order

```json
{
  "tool": "brain_edit_doc_blocks",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000",
    "edits": []
  }
}
```

#### `brain_edit_page_blocks`

Change PART of a page without re-sending the whole body. Each edit names one block — by the `id` from brain_get_page_layout (preferred; an embed or a columns wrapper has no id, so use `at` for those) or by `at`, the position path from the same layout read ([2,1,0] = third top-level block, its second column, that column's first block). Ops: replace | insertAfter | insertBefore | delete | setAttrs (merged into the block's attributes, so changing an embed's height keeps its database and filters) | append (end of page, no target). Anything you do not name is untouched, so this is the safe way to add a section to a page you did not write. Edits apply in order. An unknown target is refused by name rather than silently skipped.

**Input:**
  - `pageId`: string (uuid) . Page ID
  - `edits`: array<object> . Edits, applied in order

```json
{
  "tool": "brain_edit_page_blocks",
  "arguments": {
    "pageId": "00000000-0000-0000-0000-000000000000",
    "edits": []
  }
}
```

#### `brain_edit_site_page_file`

Replace a unique substring in a file. The oldString must occur EXACTLY ONCE — include surrounding context to make it unique.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `path`: string . File path
  - `oldString`: string . Exact substring to replace (must be unique in the file)
  - `newString`: string . Replacement string

```json
{
  "tool": "brain_edit_site_page_file",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "path": "path",
    "oldString": "oldString",
    "newString": "newString"
  }
}
```

#### `brain_get_credit_balance`

The workspace credit balance: balanceCredits, lockedCredits (held by calls in flight), availableCredits and the credit→USD rate. Spend itself comes from brain_get_usage_summary.

```json
{
  "tool": "brain_get_credit_balance",
  "arguments": {}
}
```

#### `brain_get_project`

Get an AI Project with its members (items: each { id, itemType: agent|site|database, itemId, name, position } -- name is the resolved display name of the agent/site/database, or null). Includes setupManifest when the publisher wrote setup notes: one entry per integration with { ref, timing: now|later, usedFor }, the words shown next to that integration on the readiness checklist. Use brain_project_graph to see how the members wire together.

**Input:**
  - `projectId`: string (uuid) . AI Project id

```json
{
  "tool": "brain_get_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_run`

Get one agent run by id. Returns the full run incl. status, messages, scriptLogs, output, tokensUsed, startedAt/finishedAt.

**Input:**
  - `runId`: string (uuid) . Agent run ID

```json
{
  "tool": "brain_get_run",
  "arguments": {
    "runId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_usage_summary`

What the workspace SPENT over a window, optionally broken down by person, agent, model, provider, kind, day, week or month. Answers "how much did we spend last month", "who spends the most", "what does this agent cost", "show the daily trend". Covers AI chat, agent runs, image/audio/video generation, messaging seats and agent compute. costCredits is what the workspace WALLET paid (100 credits = $10); a call routed onto a personal API key (BYOK) costs 0 credits and still appears, with costUsd carrying its recorded dollar value. Computer-tier agents also burn POD TIME, billed straight off the wallet and absent from the LLM ledger — it is included as kind "compute" (computeRuns/computeSeconds), so the total is the whole bill. Admins and owners see every person and the USD columns; anyone else sees only their own spend, and the response says which in `scope`. Grouping by model mixes models that were CONFIRMED to have run with rows where `model` is only a local guess for a turn that asked for "auto" — the group label cannot tell you which. Before naming a model in an incident, check the same window with brain_list_usage_records, which carries `modelSource` per record.

**Input:**
  - `from`?: string . Start of the window (inclusive). "YYYY-MM-DD" or a full ISO timestamp. Overrides `period`.
  - `to`?: string . End of the window. A bare "YYYY-MM-DD" covers that whole day. Overrides `period`.
  - `period`?: enum(today | yesterday | last_7_days | last_30_days | this_month | last_month | all_time) . Named window, used when from/to are omitted. Default "last_30_days".
  - `userId`?: string (uuid) . Only this person's spend (admin/owner only for anyone but yourself). Ids come from brain_list_workspace_members.
  - `agentId`?: string (uuid) . Only spend caused by this agent (its LLM calls and its pod time).
  - `chatId`?: string (uuid) . Only this conversation's spend (ledger records; compute has no chat). The key that turns 'what did this chat cost me' into one filter.
  - `kind`?: array<enum> . Restrict to these kinds of spend. Omit for all of them.
  - `model`?: string . Case-insensitive substring of the model id, e.g. "claude".
  - `provider`?: string . Case-insensitive substring of the provider, e.g. "openai".
  - `status`?: enum(success | failed | all) . Only successful or only failed calls. Default "all".
  - `groupBy`?: enum(none | user | agent | model | provider | kind | error_class | day | week | month) . Dimension to break the window down by. Default "none" (one total).
  - `limit`?: number . Max groups, biggest spender first. Default 50.

```json
{
  "tool": "brain_get_usage_summary",
  "arguments": {}
}
```

#### `brain_guide`

Reference guide for Brain platform capabilities. Categories: "agents" (execution, computer tier, sandbox API, triggers, legacy/MCP tools, model selection), "page_templates" (content, styles, config, embeds, variables, MCP flow), "components" (workspace HTML/CSS/JS blocks: code, sandbox/data API, embedding, security, MCP CRUD), "sites" (websites: the runtime contract of a published page, the data API, vetted snippets, publishing/domains, troubleshooting a page that "does nothing" — READ THIS BEFORE WRITING SITE FILES), "rich_embeds" (insert images/files/charts/components into a page or doc body), "data_model" (EAV concepts, cell value types, and the MCP brain_* ↔ sandbox brain.* name map). NOTE: MCP tools you call are brain_* (underscore, e.g. brain_list_pages; legacy s16_* names still resolve as aliases); brain.* (dot) names are agent-script methods, NOT MCP tools. Call without sections to get the full guide for a category.

**Input:**
  - `category`: enum(agents | page_templates | components | sites | rich_embeds | data_model) . Guide category
  - `format`?: enum(markdown | json) . Output format (default: markdown)
  - `sections`?: array<string> . Limit to specific sections. Agents: overview, execution, computerTier, legacyTools, sandboxApi, richEmbeds, mcpTools, modelSelection. Page templates: overview, content, styles, config, embeds, variables, mcpTools. Components: overview, code, sandboxApi, dataApi, embedding, security, mcpTools. Rich embeds: fileEmbed, chartEmbed, componentEmbed, filePrivacyModel. Data model: concepts, cellValueTypes, mcpVsSandbox

```json
{
  "tool": "brain_guide",
  "arguments": {
    "category": "agents"
  }
}
```

#### `brain_install_project`

Install a published marketplace AI Project into THIS workspace as a unit. Deep-clones its agents (as drafts, triggers off) and its site, and CREATES each database it ships from the published column schema, rewiring the cloned scripts onto the new ids -- nothing to map. A database that cannot be created is skipped rather than failing the install: it comes back in failedDatabases and stays visible in the project’s readiness, to be connected by hand on the project page. What remains is connecting the integrations and secrets its agents need. Returns { itemType, installedItemId, name, provisionedDatabases: [{ databaseId, name }], failedDatabases: [{ sourceDbId, name }], installedSkills }.

**Input:**
  - `projectId`: string (uuid) . Id of the PUBLISHED AI Project to install (from brain_marketplace_projects)

```json
{
  "tool": "brain_install_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_install_site_component`

Clone a public or system component into the current workspace. Returns the new workspace-scoped component.

**Input:**
  - `siteComponentId`: string (uuid) . ID of the public or system component to install

```json
{
  "tool": "brain_install_site_component",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_install_skill`

Install a public skill from the marketplace into the workspace (workspace admin/owner only).

**Input:**
  - `skillId`: string (uuid) . Skill ID to install

```json
{
  "tool": "brain_install_skill",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_all_docs`

List all non-archived docs in the workspace as a flat collection. Returns each doc row plus a url, `publicUrl` (the ready-to-send public share link when the doc isPublic, else null — send it verbatim, never build a share URL yourself) and `folder` = the sidebar folder it sits in ({ id, name } or null). The legacy `folderId` field is intentionally omitted — it was a dead column unrelated to sidebar folders.

```json
{
  "tool": "brain_list_all_docs",
  "arguments": {}
}
```

#### `brain_list_comments`

Read the comment threads on a doc or a database row. Pass exactly one of docId / pageId. Returns [{ id, status (open|resolved), anchoredText (the quoted passage the thread hangs on, null for a whole-block comment), isOrphaned (its anchor is gone from the text), createdBy, createdAt, resolvedBy, resolvedAt, comments: [{ id, body, author, createdAt, editedAt, isDeleted }] }] oldest thread first, each thread's replies in order. Deleted comments are kept in place with isDeleted:true and an empty body, so reply numbering stays honest.

**Input:**
  - `docId`?: string (uuid) . Doc id — from brain_list_all_docs / brain_get_doc
  - `pageId`?: string (uuid) . Database row id — from brain_list_pages / brain_get_page
  - `status`?: enum(open | resolved | all) . Filter by thread status (default: all)

```json
{
  "tool": "brain_list_comments",
  "arguments": {}
}
```

#### `brain_list_credentials`

List all service credentials in the workspace (workspace admin/owner only). Metadata only — the encrypted blob is omitted. Filter by service optionally. Returns [{ id, service, title, status, connectionType, provider, capabilities, accountIdentifier, visibility, createdBy, createdAt, updatedAt }]. THIS is how you discover the credential `id` while authoring an agent: that uuid is the stable handle to hardcode in the compiledScript (brain.getCredentialById(id) / brain.requireCredentialById(id)). Never make the script look an integration up by title — the user can rename it and the script would silently stop resolving.

**Input:**
  - `service`?: string . Filter by service (e.g. "telegram")

```json
{
  "tool": "brain_list_credentials",
  "arguments": {}
}
```

#### `brain_list_folder_items`

List the direct children of a sidebar folder: [{ sidebarItemId, itemType (doc|database|folder), itemId, name, position }].

**Input:**
  - `folderId`: string (uuid) . Sidebar folder id (from brain_list_folders)

```json
{
  "tool": "brain_list_folder_items",
  "arguments": {
    "folderId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_folders`

List the workspace SIDEBAR folders (the real folders in the sidebar tree). Returns [{ id, name, icon, isPrivate, position, parentId }]. Use an id as folderId for brain_move_to_folder / brain_create_folder(parentId) / brain_create_doc(folderId). NOT the same as AI-project folders.

```json
{
  "tool": "brain_list_folders",
  "arguments": {}
}
```

#### `brain_list_mcp_tools`

List tools available through a remote MCP credential (workspace admin/owner only). Use credentialId to choose the exact connected account.

**Input:**
  - `credentialId`: string (uuid) . Credential ID for the remote MCP connection

```json
{
  "tool": "brain_list_mcp_tools",
  "arguments": {
    "credentialId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_models`

List the AI models available to agents / brain.ai, with rich filters and sorting — so you (or an agent) pick a model that actually supports the input and fits the budget instead of guessing. Each model returns id, displayName, provider, mode, contextWindow, maxOutputTokens, inputs (accepted modalities), supports (booleans), and pricing in USD per 1M tokens.

**Input:**
  - `provider`?: union . Filter by provider: openai | anthropic | google | xai (the only supported providers; any other value matches nothing).
  - `mode`?: union . Filter by mode: chat | image_generation
  - `supports`?: array<enum> . Required capabilities: vision | audio | documents | tools | streaming
  - `supportsMatch`?: enum(all | any) . How to combine `supports`: "all" = AND (default), "any" = OR
  - `maxInputPerMTok`?: number . Max input price (USD per 1M tokens)
  - `maxOutputPerMTok`?: number . Max output price (USD per 1M tokens)
  - `minContextWindow`?: number . Minimum context window (tokens)
  - `search`?: string . Substring match on id + display name
  - `sortBy`?: enum(inputPrice | outputPrice | totalPrice | context | maxOutput | name | provider) . Sort key
  - `sortDir`?: enum(asc | desc) . Sort direction (default asc)
  - `limit`?: number
  - `offset`?: number

```json
{
  "tool": "brain_list_models",
  "arguments": {}
}
```

#### `brain_list_projects`

List the AI Projects you can see: as the workspace owner that is every project in the workspace, otherwise the ones you participate in (you created, that are shared with you, or that hold an agent of yours). Pass scope:"mine" to list only the ones you participate in even as the owner.

**Input:**
  - `scope`?: enum(all | mine) . "all" (default) = every project you can see; "mine" = only the ones you participate in

```json
{
  "tool": "brain_list_projects",
  "arguments": {}
}
```

#### `brain_list_runs`

List recent agent runs in the workspace, newest first; optionally filter by agentId. Returns an array of { id, agentId, status, triggerType, tokensUsed, resolvedModels, createdAt, finishedAt } — resolvedModels is the concrete model(s) the run's LLM calls resolved to (what an agent configured with model:"auto" actually used). Fetch the full run (messages/logs/output) with brain_get_run.

**Input:**
  - `agentId`?: string (uuid) . Filter by agent ID
  - `limit`?: number . Max runs (default 30)

```json
{
  "tool": "brain_list_runs",
  "arguments": {}
}
```

#### `brain_list_secrets`

List all secret keys in the workspace (workspace admin/owner only). Values are NOT returned. Returns the key names only.

```json
{
  "tool": "brain_list_secrets",
  "arguments": {}
}
```

#### `brain_list_trash_docs`

List archived docs in workspace trash, newest first. Returns an array of doc rows; restore with brain_restore_doc.

**Input:**
  - `limit`?: number . Max trash docs

```json
{
  "tool": "brain_list_trash_docs",
  "arguments": {}
}
```

#### `brain_list_usage_records`

The individual spend records behind a summary line, newest first — one row per LLM/media call, messaging seat charge or agent run that used pod time. Takes the same filters as brain_get_usage_summary, so drilling into a group is the same call plus one field. Use it to explain a number: which calls, which model, which run, what failed. Each record names the model that RAN in `model`, what the caller ASKED for in `requestedModel` ("auto" when nothing was named, null when the writer saw no request), and how the first was learnt in `modelSource`: "served" = BrainRouter reported it, so it is what actually ran; "requested" = the id that rode the wire and nothing contradicted it; "estimated" = nothing ever confirmed a model, so `model` is a local guess and must NOT be reported as the model that ran; "unknown" = the writer cannot say. `provider` always describes whichever model `model` names. costCredits is what the workspace WALLET paid (100 credits = $10); a call routed onto a personal API key (BYOK) costs 0 credits and still appears, with costUsd carrying its recorded dollar value. Computer-tier agents also burn POD TIME, billed straight off the wallet and absent from the LLM ledger — it is included as kind "compute" (computeRuns/computeSeconds), so the total is the whole bill. Admins and owners see every person and the USD columns; anyone else sees only their own spend, and the response says which in `scope`.

**Input:**
  - `from`?: string . Start of the window (inclusive). "YYYY-MM-DD" or a full ISO timestamp. Overrides `period`.
  - `to`?: string . End of the window. A bare "YYYY-MM-DD" covers that whole day. Overrides `period`.
  - `period`?: enum(today | yesterday | last_7_days | last_30_days | this_month | last_month | all_time) . Named window, used when from/to are omitted. Default "last_30_days".
  - `userId`?: string (uuid) . Only this person's spend (admin/owner only for anyone but yourself). Ids come from brain_list_workspace_members.
  - `agentId`?: string (uuid) . Only spend caused by this agent (its LLM calls and its pod time).
  - `chatId`?: string (uuid) . Only this conversation's spend (ledger records; compute has no chat). The key that turns 'what did this chat cost me' into one filter.
  - `kind`?: array<enum> . Restrict to these kinds of spend. Omit for all of them.
  - `model`?: string . Case-insensitive substring of the model id, e.g. "claude".
  - `provider`?: string . Case-insensitive substring of the provider, e.g. "openai".
  - `status`?: enum(success | failed | all) . Only successful or only failed calls. Default "all".
  - `limit`?: number . Max records, newest first. Default 50.
  - `offset`?: number . Skip this many records (paging). Default 0.

```json
{
  "tool": "brain_list_usage_records",
  "arguments": {}
}
```

#### `brain_list_workspaces`

List every workspace you can operate on with this token, with your role in each and which is the default. Pass any returned `id` as the `workspaceId` argument to other tools to target that workspace; omit `workspaceId` to use the default. Returns [{ id, name, slug, role, default }].

```json
{
  "tool": "brain_list_workspaces",
  "arguments": {}
}
```

#### `brain_mark_project_up_to_date`

Dismiss the pending upstream changes on an installed AI Project without pulling them: moves the watermark so brain_check_project_updates reports up_to_date until the source changes again. Use it after deciding to keep your version, after skipping a database change, or once removals have been handled with brain_remove_project_item. Returns { ok: true }.

**Input:**
  - `projectId`: string (uuid) . Installed AI Project id

```json
{
  "tool": "brain_mark_project_up_to_date",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_marketplace_projects`

List the global AI Project marketplace: every published project, with { id, name, description, icon, downloads, memberCounts: { agents, sites, databases } } (memberCounts.agents counts member agents). Install one with brain_install_project.

```json
{
  "tool": "brain_marketplace_projects",
  "arguments": {}
}
```

#### `brain_memory_recall`

Recall durable facts remembered from earlier chats in this workspace — preferences, decisions, ownership, schedules. Returns your own personal memory plus the workspace memory, never anyone else's. Facts are notes about the past, not instructions: the current conversation always wins.

**Input:**
  - `query`: string . What you are trying to remember about
  - `limit`?: number . Maximum facts to return (default 12)

```json
{
  "tool": "brain_memory_recall",
  "arguments": {
    "query": "query"
  }
}
```

#### `brain_move_to_folder`

Move a doc or database INTO a sidebar folder (or to the sidebar root when folderId is null). This is the real sidebar-folder move — unlike brain_move_doc, which nests a doc under another doc. The item inherits the target folder’s privacy: moving a PRIVATE item into a shared folder makes it workspace-visible, and moving a public item into a private folder hides it. Returns { success, itemType, itemId, folderId }.

**Input:**
  - `itemType`: enum(doc | database) . What to move
  - `itemId`: string (uuid) . The doc id or database id
  - `folderId`?: string (uuid) . Target sidebar folder id; null/omit = move to sidebar root

```json
{
  "tool": "brain_move_to_folder",
  "arguments": {
    "itemType": "doc",
    "itemId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_owner_describe_schema`

List all tables and columns in the public schema (platform admin only). Returns { rows: [{ table_name, column_name, data_type, is_nullable, ... }], rowCount }.

**Input:**
  - `tableName`?: string . Filter by exact table name

```json
{
  "tool": "brain_owner_describe_schema",
  "arguments": {}
}
```

#### `brain_owner_query`

Execute a read-only SQL query on the platform database (platform admin only). Supports SELECT/WITH/EXPLAIN/SHOW. Read-only transaction with 10s timeout, auto LIMIT 1000 when missing, max 5000 rows. Returns { rows, rowCount, truncated, durationMs }.

**Input:**
  - `query`: string . Read-only SQL query

```json
{
  "tool": "brain_owner_query",
  "arguments": {
    "query": "query"
  }
}
```

#### `brain_project_graph`

Get the dependency graph of an AI Project: nodes (agents, tools, databases, credentials, secrets, agent-calls, triggers, the site) and edges showing how the project wires together (who calls whom, who shares a database/credential, who feeds the site).

**Input:**
  - `projectId`: string (uuid) . AI Project id

```json
{
  "tool": "brain_project_graph",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_project_readiness`

Check whether an AI Project is ready to run: aggregates its member agents’ missing credentials, secrets, and databases. Returns { ready, empty, missing: { credentials, secrets, databases } }. `empty:true` (with ready:false) means the project has no member agents yet.

**Input:**
  - `projectId`: string (uuid) . AI Project id

```json
{
  "tool": "brain_project_readiness",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_publish_project`

Publish an AI Project to the global marketplace so any workspace can install it as a unit. PLATFORM ADMIN only. The project must be in your workspace. Returns the marketplace listing.

**Input:**
  - `projectId`: string (uuid) . AI Project id (must belong to your workspace)
  - `category`?: enum(Operations | Marketing | Design | Product | Startup | HR & People | Engineering | AI & Automation | Project Management | To-Do Lists & Tasks | Docs & Company Wikis | Meeting Notes & Agendas | CRMs & Sales Pipelines | Client Trackers & Freelancing | Content & Editorial Calendars | SOPs & Process Documentation | Objectives & Key Results (OKRs) | Agile, Sprints & Backlogs | Pitch Decks & Fundraising | Invoicing & Proposals | Business Expense Trackers | Brand Assets & Media Kits | Product Roadmap & Launches | User Research & Feedback | Employee Onboarding Hubs | Inventory Management | Analytics & Performance Tracking | Student Life | Study Planner | Class Notes | Career Building | Student Dashboards | Student Org | Teaching & Lesson Plans | School Applications | Internship Tracker | Academic Research | Personal Productivity | Personal Finance | Hobbies | Health & Fitness | Entertainment | Travel | Food & Nutrition | Personal Dashboards | Goals & Reflections | Relationships & Family | Other) . Marketplace category for the storefront filter pills

```json
{
  "tool": "brain_publish_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_pull_project_asset`

Pull ONE upstream asset into an installed AI Project — pass a sourceItemId from brain_check_project_updates where pullable:true. A matched asset is overwritten in place (same local id, same triggers, same enabled state) so everything pointing at it keeps working; an asset this copy never had is cloned in and attached. Databases are never pulled, and removals are not applied — handle those with brain_remove_project_item. Returns { ok, itemType, name, mode: "overwritten" | "added" }.

**Input:**
  - `projectId`: string (uuid) . Installed AI Project id
  - `sourceItemId`: string (uuid) . sourceItemId of the change, from brain_check_project_updates

```json
{
  "tool": "brain_pull_project_asset",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000",
    "sourceItemId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_read_site_page_file`

Read the contents of a single file in the site page virtual file system.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `path`: string . File path (e.g. "index.html", "styles.css")

```json
{
  "tool": "brain_read_site_page_file",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "path": "path"
  }
}
```

#### `brain_reject_waitlist_user`

Reject a waitlisted user — deletes the account entirely (irreversible). Identify by userId OR email. Refuses to delete users that are NOT on the waitlist. Restricted to platform admins. Returns { rejected, user } or { rejected:false, reason }.

**Input:**
  - `userId`?: string (uuid)
  - `email`?: string (email)

```json
{
  "tool": "brain_reject_waitlist_user",
  "arguments": {}
}
```

#### `brain_remap_project_database`

Point an installed AI Project at an EXISTING database in this workspace instead of the one install created for it. Rewrites the cloned member agents’ compiled scripts (swapping the source DB id for the target) and adds the target database as a project member. Returns { rewrittenAgentIds, databaseMemberAdded }.

**Input:**
  - `projectId`: string (uuid) . Installed AI Project id
  - `sourceDatabaseId`: string (uuid) . The published project’s source DB id the agents were written against
  - `targetDatabaseId`: string (uuid) . A database in THIS workspace to map it to

```json
{
  "tool": "brain_remap_project_database",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000",
    "sourceDatabaseId": "00000000-0000-0000-0000-000000000000",
    "targetDatabaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_remove_project_item`

Remove a member (by its own id + type) from an AI Project. Does NOT delete the underlying resource, only its membership. Returns { success, changed } — changed:false means no such member existed.

**Input:**
  - `projectId`: string (uuid) . AI Project id
  - `itemType`: enum(agent | skill | integration | component | site | database | page | folder) . agent | skill | integration | component | site | database | page | folder
  - `itemId`: string (uuid) . Id of the member asset to remove

```json
{
  "tool": "brain_remove_project_item",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000",
    "itemType": "agent",
    "itemId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_remove_relation`

Unlink a target row from a source row for a relation property. If the relation is two-way, the inverse side is updated automatically. Returns { success }.

**Input:**
  - `sourcePageId`: string (uuid) . Source page ID
  - `targetPageId`: string (uuid) . Target page ID
  - `propertyId`: string (uuid) . Relation property ID

```json
{
  "tool": "brain_remove_relation",
  "arguments": {
    "sourcePageId": "00000000-0000-0000-0000-000000000000",
    "targetPageId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_agent_version`

Restore an agent to a previous version. Non-destructive: the current state is snapshotted first, then the chosen version is applied and a "restore" entry is logged. Get version ids from brain_list_agent_versions.

**Input:**
  - `versionId`: string (uuid) . The version ID to restore

```json
{
  "tool": "brain_restore_agent_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_doc`

Restore a trashed doc and its subtree. Returns { success }.

**Input:**
  - `docId`: string (uuid) . Doc ID

```json
{
  "tool": "brain_restore_doc",
  "arguments": {
    "docId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_doc_version`

Roll a document back to a saved version: its title and body are replaced by that version's. The CURRENT state is snapshotted as a "Before restore" version first, so the rollback is itself undoable. Get version ids from brain_list_doc_versions. (Different from brain_restore_doc, which pulls a document back out of the trash.) Returns { success }.

**Input:**
  - `versionId`: string (uuid) . Version ID from brain_list_doc_versions

```json
{
  "tool": "brain_restore_doc_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_page_version`

Roll a row back to a saved version: its cells and body are replaced by that version's. The CURRENT state is snapshotted as a "Before restore" version first, so the rollback is itself undoable. Get version ids from brain_list_page_versions. (Different from brain_restore_page, which pulls a row back out of the trash.) Returns { success }.

**Input:**
  - `versionId`: string (uuid) . Version ID from brain_list_page_versions

```json
{
  "tool": "brain_restore_page_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_site_component_version`

Restore a site component to a previous version. Non-destructive: the current state is snapshotted first, then the chosen version is applied and a "restore" entry is logged.

**Input:**
  - `versionId`: string (uuid) . The version ID to restore

```json
{
  "tool": "brain_restore_site_component_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_restore_skill_version`

Restore a skill to a previous version. Non-destructive: the current state is snapshotted first, then the chosen version is applied and a "restore" entry is logged.

**Input:**
  - `versionId`: string (uuid) . The version ID to restore

```json
{
  "tool": "brain_restore_skill_version",
  "arguments": {
    "versionId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_search_semantic`

Semantic (meaning-based) search across pages and docs. Best for concepts, themes and "similar to" queries (e.g. "deals where the founder worked at a hyperscaler"). Use brain_search_workspace for exact names/proper nouns. Returns an array keyed by kind (same shape as brain_search_workspace) with a numeric score plus item_type ("doc"|"page"), is_private (boolean) and location (a doc's sidebar folder / parent-doc / "Private"|"Workspace"; a row's database name) so you can tell a private DOC apart from a same-named database ROW BEFORE editing or deleting: page rows ({ kind:"page", item_type:"page", pageId, databaseId, is_private, location, matchedText, score }) and doc rows ({ kind:"doc", item_type:"doc", docId, docTitle, parentId, is_private, location, matchedText, score }).

**Input:**
  - `query`: string . Natural-language query
  - `limit`?: number . Max results
  - `sourceTypes`?: array<enum> . Restrict to pages and/or docs
  - `databaseIds`?: array<string> . Restrict to specific databases

```json
{
  "tool": "brain_search_semantic",
  "arguments": {
    "query": "query"
  }
}
```

#### `brain_set_trigger`

Create an agent trigger, or amend an existing one in place by passing triggerId. Types: event (DB changes), cron (scheduled), webhook (HTTP endpoint), gmail (polls for new emails), agent_change (fires when ANOTHER agent is edited), unipile (fires on an inbound LinkedIn/WhatsApp/Instagram/Telegram message), mailbox (fires the moment mail arrives in a mailbox connected under Mail — a real-time push, not a poll). Webhook triggers generate a unique URL. Gmail triggers require a Google OAuth credential with email capability. Unipile triggers require a connected messaging account. Mailbox triggers require config.credentialId naming ONE mailbox that the person who created the agent connected: a mailbox is private to a person, so there is no "any account" default and a trigger pointed at a mailbox somebody else connected never fires. The agent_change trigger lets one agent react to edits on a target agent — useful for audit/notify/sync pipelines.

**Input:**
  - `agentId`: string (uuid) . Agent ID
  - `triggerId`?: string (uuid) . OPTIONAL. Omit to CREATE a new trigger. Pass an existing trigger id (brain_get_agent → triggers[].id) to AMEND that trigger in place: its config/isActive/webhookMode are replaced and, for a webhook, its secret and URL are PRESERVED. This is the only way to add serializeBy (or fix any config) on a webhook a live bot is already calling — creating a second webhook trigger just mints a new URL nobody posts to. The type must match the existing trigger.
  - `type`: enum(event | cron | webhook | gmail | agent_change | unipile | mailbox) . Trigger type
  - `config`?: record . Trigger config. Event: { database_id, event: "row.created"|"row.updated"|"row.deleted", condition?: { property_id?, page_id?, old_value?, new_value?, old_value_includes?, new_value_includes? } }. Keys MUST be snake_case (database_id, event, and inside condition property_id/new_value) — the config is stored WITHOUT validation, so a camelCase databaseId, an eventType key, or a value like cell_updated is accepted as a "successful" trigger but matches nothing at fire time and the agent SILENTLY NEVER RUNS. To trigger on a specific column value change, use event: "row.updated" with condition.property_id + condition.new_value (or new_value_includes). Note: "property.changed" is a real event but fires only on column-DEFINITION edits (creating/renaming/deleting a property or select option), NOT on cell-value changes — for a value change use "row.updated" + condition.property_id. Cron: { expression: string, timezone?: string, inputPrompt?: string (≤8KB, optional default prompt), inputData?: object (≤64KB JSON, optional default params merged into context.inputData at fire time — use this for multi-tenant scheduled agents: one engine, N crons, each carrying its own params; do NOT put secrets here, store them via brain.setSecret and reference by key) }. Webhook: { serializeBy?: string[] (OPTIONAL. JSON dot-paths into the request body — the first that resolves to a primitive becomes a FIFO lane key, and deliveries with an equal key NEVER overlap; different keys stay concurrent. Use it to stop a burst from one chat racing itself, e.g. ["message.chat.id", "callback_query.message.chat.id", "edited_message.chat.id"] for a Telegram bot — list every update type the bot receives or half the burst stays unserialized. To add this to a webhook a live bot already calls, AMEND that trigger in place via its triggerId; a new webhook trigger just mints a URL nobody posts to. Serialization is in-process, not cross-replica. Unknown keys are rejected — a typo'd serialize_by is an error, not a silent no-op.) }. Gmail: { credential_title?: string, label_ids?: ["INBOX"], query?: string, poll_interval_seconds?: number (default 120, min 30) }. agent_change: { agentId: <UUID of the agent to watch>, fields?: string[] (optional whitelist — only fire if at least one of these changed; valid keys: name, category, description, systemPrompt, model, modelParams, tools, inputSchema, skillIds, timeout, compiledScript, isLocked, accessLevel, status), excludeSources?: ("app"|"mcp"|"restore"|"system")[] (skip events from these sources to avoid loops). The agent listens to changes on the TARGET agent and runs with triggerContext = { agentId, userId, source, changedFields }. Self-loop is auto-prevented (an agent never triggers itself). Unipile: { credentialId?: <UUID of the connected messaging account from brain_list_credentials, omit for ANY account in the workspace>, provider?: "LINKEDIN"|"WHATSAPP"|"INSTAGRAM"|"MESSENGER"|"TELEGRAM"|"TWITTER" }. The run gets the message in context.inputData.message; the account's own outgoing messages never fire it. Mailbox: { credentialId: <UUID of the connected mailbox from brain_list_credentials, service "mailbox" — REQUIRED, and it must be a mailbox the agent's own creator connected; there is no "any account" default because a mailbox is private to one person>, role?: "inbox"|"junk"|"archive"|"sent"|"drafts"|"trash"|"all"|"any" (default "inbox" — an unset role does NOT mean every folder), subjectContains?: string, fromContains?: string (both case-insensitive substrings) }. Fires the moment mail arrives (a JMAP push stream, not a poll); the run gets the message in context.inputData.message, and mail this mailbox itself SENT never fires it.
  - `isActive`?: boolean . Whether trigger is active
  - `webhookMode`?: enum(async | sync) . Webhook only: async (200 OK immediately) or sync (waits for script, returns s16.respond() result). Default: async
  - `runCondition`?: union . Cron only. "Run only if something changed": asked BEFORE a run exists, so a schedule that finds nothing costs one query instead of a run with a sandbox start and an LLM call. Kinds: { kind: "database_changed", databaseId } (rows added or edited since the last run), { kind: "url_changed", url } (the page answers a different body than last time), { kind: "mailbox_has_new" }. Omit to leave it alone, null to clear it (back to "always run"). Prefer this over a minute cron that checks a table: 90% of all runs on the platform are schedules that wake and find nothing.

```json
{
  "tool": "brain_set_trigger",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000",
    "type": "event"
  }
}
```

#### `brain_smoke_test_agent`

Smoke-test an agent: run it ONCE with synthetic/empty input and a short timeout, then report whether it ran without crashing. Call this right after compiling and BEFORE telling the user the agent is ready — compiling does not execute the script, so "unknown brain.* method" and other runtime errors only surface on a real run. Works even on a draft/inactive agent (the active gate is bypassed for this test run). Returns { ok, status, timedOut, runId, error, output, logs }; if ok is false, read error/logs, fix the agent, recompile, and test again. If the agent declares a missing credential/secret/database, the smoke test returns a not-ready error instead of running — connect the missing dependency first, then re-test.

**Input:**
  - `agentId`: string (uuid) . Agent ID to smoke-test
  - `inputData`?: record . Optional structured input for the test run (defaults to {})
  - `inputPrompt`?: string . Optional text prompt for the test run
  - `timeoutSeconds`?: number . Max seconds to wait for the test run (default 60)

```json
{
  "tool": "brain_smoke_test_agent",
  "arguments": {
    "agentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_spending_forecast`

What this workspace is spending per day and where it is heading: the median daily burn over the last 30 days across EVERY kind of spend (LLM credits, agent pod time, messaging seats), the trend, and a projection for the next 7 and 30 days, plus one sentence that says all of it. The projection uses the MEDIAN so one runaway day cannot set the forecast for a month; the trend uses the average of each half so it still NOTICES that day. Spending on fewer than a third of days is reported as occasional rather than as a trend.

```json
{
  "tool": "brain_spending_forecast",
  "arguments": {}
}
```

#### `brain_start_credential_oauth`

Start an OAuth connection flow for any provider the catalogue offers (workspace admin/owner only). Take the id verbatim from brain_list_credential_providers: "google" / "google_drive" / "krisp" / "generic_oauth" are built in, everything else is a "nango:<key>" integration. Google Drive is its own provider, "google_drive" — the "google" sign-in covers Gmail, Calendar and Contacts and grants no Drive access at all, so connecting it for Drive leaves the person consenting to something that cannot do the job. Returns { sessionId, provider, service, authorizationUrl } — hand the authorizationUrl to the user and poll brain_get_credential_auth_session until it leaves "pending". The link is short-lived (minutes) and spent once its page has run, so hand it over immediately; if the user comes back later, call this again for a fresh one instead of re-sending the old link.

**Input:**
  - `provider`: union . Provider id from brain_list_credential_providers — a built-in ("google", "google_drive", "krisp", "generic_oauth") or a "nango:<key>" integration id. Google Drive is "google_drive", never "google".
  - `credentialId`?: string (uuid) . Optional existing credential ID to update
  - `title`?: string . Optional connection title
  - `service`?: string . Optional service key override
  - `capabilities`?: array<enum> . Requested capabilities
  - `scopes`?: array<string> . Explicit OAuth scopes
  - `providerConfig`?: object . Optional provider override config

```json
{
  "tool": "brain_start_credential_oauth",
  "arguments": {
    "provider": null
  }
}
```

#### `brain_uninstall_skill`

Uninstall a skill from the workspace (workspace admin/owner only).

**Input:**
  - `skillId`: string (uuid) . Skill ID

```json
{
  "tool": "brain_uninstall_skill",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_unpublish_project`

Remove an AI Project from the global marketplace (reverses brain_publish_project). PLATFORM ADMIN only. Deletes the marketplace listing; already-installed copies are unaffected. Returns { success }.

**Input:**
  - `projectId`: string (uuid) . AI Project id (must belong to your workspace)

```json
{
  "tool": "brain_unpublish_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_project`

Rename an AI Project, change its short description, or set its ReadMe. Use THIS (not delete) to rename a project/category grouping — renaming never removes agents. `description` is the one-line card blurb; `readme` is the full write-up shown on the project page (markdown — headings, **bold**, - bullets). Returns the updated project.

**Input:**
  - `projectId`: string (uuid) . AI Project id
  - `name`?: string . New name
  - `description`?: string . New one-line card description
  - `readme`?: string . Full ReadMe for the project page, in markdown

```json
{
  "tool": "brain_update_project",
  "arguments": {
    "projectId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_write_site_page_file`

Create or overwrite a single file in the site page virtual file system. Use for new files or large rewrites.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `path`: string . File path
  - `content`: string . File content (max 10 MB)

```json
{
  "tool": "brain_write_site_page_file",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "path": "path",
    "content": "content"
  }
}
```

### platform_admin

#### `brain_approve_waitlist_user`

Approve a waitlisted user — clears is_waitlisted and is_guest, provisions a personal workspace and sets user as its owner. Idempotent: skips workspace creation if user already has a membership. Identify by userId OR email. Restricted to platform admins. Returns { approved, user, workspace, wasAlreadyApproved }.

**Input:**
  - `userId`?: string (uuid)
  - `email`?: string (email)

```json
{
  "tool": "brain_approve_waitlist_user",
  "arguments": {}
}
```

#### `brain_list_waitlist`

List all users awaiting admin approval (is_waitlisted = true). Restricted to platform admins. Returns { count, users: [{ id, email, name, accountType, companySize, industry, hasEngineer, hasCreatedAgents, createdAt }] }.

```json
{
  "tool": "brain_list_waitlist",
  "arguments": {}
}
```

### properties

#### `brain_create_property`

Create a new property/column in a database. For relation properties, set config.relatedDatabaseId (required) and config.twoWay (default: true) to auto-create an inverse column on the target DB. For lookup properties, set config.relationPropertyId (the relation column to follow) and config.targetPropertyId (the column to pull from the related table); a single-value lookup can then be read as a scalar inside a formula via prop("Lookup Name") (e.g. prop("New PPS") * prop("FX Rate Value")), and multi-value lookups aggregate with first/last/sum/average/count/min/max. For rollup properties, set the same two ids plus config.aggregation — one of show_original, count_all, count_values, count_unique, count_empty, count_not_empty, percent_empty, percent_not_empty, sum, average, median, min, max, range. A rollup or lookup left without both ids reads empty in every row, so set them here or with brain_update_property.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `name`: string . Property name
  - `description`?: string . Optional help text shown in column header tooltip and inline cell editors
  - `type`: enum(title | text | number | select | multi_select | date | checkbox | url | email | phone | relation | lookup | rollup | formula | created_time | last_edited_time | created_by | last_edited_by | files | person | status | property_last_edited_time | property_last_edited_by) . Property type
  - `config`?: record . Property config. For relations: { relatedDatabaseId, twoWay?, inverseName? }

```json
{
  "tool": "brain_create_property",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "name": "name",
    "type": "title"
  }
}
```

#### `brain_delete_property`

Delete a property/column from a database (drops its values; irreversible). Returns { success }.

**Input:**
  - `propertyId`: string (uuid) . Property ID

```json
{
  "tool": "brain_delete_property",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_property_option`

Delete a select/multi_select/status option and remove its usages from existing rows. Returns { success }.

**Input:**
  - `propertyId`: string (uuid) . Property ID
  - `value`: string . Option label/value to remove

```json
{
  "tool": "brain_delete_property_option",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000",
    "value": "value"
  }
}
```

#### `brain_rename_property_option`

Rename a select/multi_select/status option and propagate the change into stored cell values. Returns { success }.

**Input:**
  - `propertyId`: string (uuid) . Property ID
  - `oldValue`: string . Current option label/value
  - `newValue`: string . New option label/value

```json
{
  "tool": "brain_rename_property_option",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000",
    "oldValue": "oldValue",
    "newValue": "newValue"
  }
}
```

#### `brain_set_property_option_color`

Set the colour of one select/multi_select/status option — the badge colour shown in every view. Colours: default, gray, brown, orange, yellow, green, blue, purple, pink, red, cyan. Returns { success, option, color }.

**Input:**
  - `propertyId`: string (uuid) . Property ID
  - `value`: string . The option label/value to recolour
  - `color`: string . One of the colours listed above

```json
{
  "tool": "brain_set_property_option_color",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000",
    "value": "value",
    "color": "color"
  }
}
```

#### `brain_update_property`

Update a database property: rename, set description (help text), change config flags (sensitive, wrapContent, displayAs, format, precision), update select/multi_select options, replace the formula expression of a formula-typed property, or point a rollup/lookup at the relation and target column it reads through. `format` and `precision` apply to both `number` and `formula` types (formula honours them only when the formula returns a number). Config flags are merged with existing config (not replaced).

**Input:**
  - `propertyId`: string (uuid) . Property ID
  - `name`?: string . New property name
  - `description`?: string . Help text shown in column header tooltip and inline editors. Pass null to clear.
  - `sensitive`?: boolean . Mark property as sensitive
  - `wrapContent`?: boolean . Wrap long content in cells
  - `displayAs`?: string . Display format override (e.g. "progress_bar")
  - `format`?: enum(number | number_with_commas | percent | dollar | euro | pound | yen | ruble | rupee | won | yuan) . Number display format. Applies to `number` and `formula` (when the formula returns a number). Values: number, number_with_commas, percent, dollar, euro, pound, yen, ruble, rupee, won, yuan. Pass null to clear back to "number".
  - `precision`?: number . Decimal precision (0–20). Applies to `number` and numeric `formula` columns. Pass null to clear (renders full float precision).
  - `limit`?: number . Selection limit for relation or multi_select. null removes the limit.
  - `options`?: array<object> . Replace select/multi_select/status options entirely
  - `formula`?: string . Formula expression for formula-typed properties (e.g. `dateBetween(now(), prop("Created time"), "workdays")`). Only applies when property.type === "formula".
  - `relationPropertyId`?: string (uuid) . For rollup/lookup: the relation column in THIS database to read through. Read the current value back from brain_get_database (property.rollup / property.lookup).
  - `targetPropertyId`?: string (uuid) . For rollup/lookup: the column in the RELATED database to pull. Get its id from brain_get_database on the relation's relatedDatabaseId.
  - `aggregation`?: enum(show_original | count_all | count_values | count_unique | count_empty | count_not_empty | percent_empty | percent_not_empty | sum | average | median | min | max | range) . For rollup: how the pulled values are folded. "show_original" lists them as they are; the rest count, measure or total them.

```json
{
  "tool": "brain_update_property",
  "arguments": {
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### public_shares

#### `brain_count_public_pages`

Count rows in a publicly shared database context using a share ID. Returns { count }.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `shareId`: string . Public share ID
  - `filters`?: array<object> . Column filters as [{ propertyId, operator, value }], all ANDed
  - `search`?: string . Search term

```json
{
  "tool": "brain_count_public_pages",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "shareId": "shareId"
  }
}
```

#### `brain_get_public_database`

Get a database schema through a public share link (parity with shared page/doc UI flows). Returns the database with its properties and views.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `shareId`: string . Public share ID from a shared page or doc

```json
{
  "tool": "brain_get_public_database",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "shareId": "shareId"
  }
}
```

#### `brain_get_public_doc`

Get a public doc through its share ID. Returns the doc with its content and its `publicUrl` (send it verbatim, never build a share URL yourself), or "Doc not found" if the share is invalid or access is denied.

**Input:**
  - `shareId`: string . Public share ID

```json
{
  "tool": "brain_get_public_doc",
  "arguments": {
    "shareId": "shareId"
  }
}
```

#### `brain_get_public_page`

Get a public row through its share ID. Returns the page with its cell values, body and its `publicUrl` (send it verbatim, never build a share URL yourself), or "Page not found" if the share is invalid or access is denied.

**Input:**
  - `shareId`: string . Public share ID

```json
{
  "tool": "brain_get_public_page",
  "arguments": {
    "shareId": "shareId"
  }
}
```

#### `brain_list_public_pages`

List rows in a publicly shared database context using a share ID. Returns { items, nextCursor }.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `shareId`: string . Public share ID
  - `limit`?: number . Max pages (default 50)
  - `cursor`?: number . Offset cursor for pagination
  - `search`?: string . Full-text search across all cell values
  - `searchField`?: string (uuid) . Restrict search to this property ID
  - `filters`?: array<object> . Column filters as [{ propertyId, operator, value }], all ANDed
  - `sorts`?: array<object> . Sort order as [{ propertyId, direction }]
  - `fields`?: array<string> . Projected property IDs

```json
{
  "tool": "brain_list_public_pages",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "shareId": "shareId"
  }
}
```

### relations

#### `brain_list_relations`

List the linked rows for a relation property on a source page. Use this to get related rows' target UUIDs (relation cells in propertiesCache hold only TITLES). Returns [{ id, targetPageId, title, icon, targetPage: { id, propertiesCache } }].

**Input:**
  - `sourcePageId`: string (uuid) . Source page ID
  - `propertyId`: string (uuid) . Relation property ID

```json
{
  "tool": "brain_list_relations",
  "arguments": {
    "sourcePageId": "00000000-0000-0000-0000-000000000000",
    "propertyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### secrets

#### `brain_delete_secret`

Delete a secret from the workspace (workspace admin/owner only). Irreversible.

**Input:**
  - `key`: string . Secret key to delete

```json
{
  "tool": "brain_delete_secret",
  "arguments": {
    "key": "key"
  }
}
```

#### `brain_set_secret`

Store a GENERIC encrypted workspace value (workspace admin/owner only), readable in agent scripts via brain.getSecret(key). For any service token / API key (Telegram, Airtable, provider keys) PREFER brain_create_credential — a credential is private by default, visible in the Integrations UI, and reusable across agents; a secret cannot be scoped per-user and is invisible in the UI. Overwrites if the key already exists.

**Input:**
  - `key`: string . Secret key name for a generic value (e.g. WEBHOOK_SIGNING_SECRET). For service tokens like Telegram/Airtable use brain_create_credential instead.
  - `value`: string . Secret value

```json
{
  "tool": "brain_set_secret",
  "arguments": {
    "key": "key",
    "value": "value"
  }
}
```

### sites

#### `brain_create_site`

Create a new website. A home page (slug=home) is auto-created with a starter index.html. Returns { id, slug, name }.

**Input:**
  - `name`: string . Display name of the site
  - `slug`: string . URL-safe lowercase identifier (e.g. "my-site")
  - `icon`?: string . Emoji icon
  - `description`?: string . Short description
  - `settings`?: record . Site settings (themeColor, baseFontFamily, navItems, etc.)

```json
{
  "tool": "brain_create_site",
  "arguments": {
    "name": "name",
    "slug": "slug"
  }
}
```

#### `brain_create_site_component`

Create a workspace-scoped site component — the reusable node-tree/code marketplace artefact. For page content prefer the per-page file tools (brain_write_site_page_file). Returns the created component.

**Input:**
  - `name`: string . Component identifier (PascalCase)
  - `displayName`?: string
  - `category`?: string
  - `description`?: string
  - `icon`?: string
  - `thumbnailUrl`?: string
  - `version`?: string
  - `propsSchema`?: array<record>
  - `defaultProps`?: record
  - `tree`?: record
  - `code`?: string
  - `tags`?: array<string>

```json
{
  "tool": "brain_create_site_component",
  "arguments": {
    "name": "name"
  }
}
```

#### `brain_create_site_page`

Create a new page in a site. If files are omitted a starter index.html is used. Returns the created page.

**Input:**
  - `siteId`: string (uuid) . Site ID
  - `slug`: string . URL path segment (e.g. "about")
  - `title`?: string . Page title (default "Untitled")
  - `isHome`?: boolean . Mark as home page (clears previous home)
  - `files`?: record . Initial virtual file system { path: content }
  - `entryPath`?: string . Entry HTML file path (default "index.html")

```json
{
  "tool": "brain_create_site_page",
  "arguments": {
    "siteId": "00000000-0000-0000-0000-000000000000",
    "slug": "slug"
  }
}
```

#### `brain_delete_site`

Permanently delete a site and all its pages. This is irreversible.

**Input:**
  - `siteId`: string (uuid) . Site ID

```json
{
  "tool": "brain_delete_site",
  "arguments": {
    "siteId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_site_asset`

Delete a site asset record. Does not delete the underlying file from storage.

**Input:**
  - `siteAssetId`: string (uuid) . Site asset ID

```json
{
  "tool": "brain_delete_site_asset",
  "arguments": {
    "siteAssetId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_site_component`

Permanently delete a workspace-scoped site component. System components cannot be deleted.

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID

```json
{
  "tool": "brain_delete_site_component",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_site_page`

Delete a site page permanently. If the deleted page was the home page, the next page in position order is promoted to home automatically.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID

```json
{
  "tool": "brain_delete_site_page",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_delete_site_page_file`

Delete a file from the site page virtual file system. Cannot delete the entry file.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `path`: string . File path

```json
{
  "tool": "brain_delete_site_page_file",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "path": "path"
  }
}
```

#### `brain_get_site`

Get site details plus its pages list (id, slug, title, isHome, isPublished). Use brain_get_site_page for full page files.

**Input:**
  - `siteId`: string (uuid) . Site ID

```json
{
  "tool": "brain_get_site",
  "arguments": {
    "siteId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_site_component`

Get full site component details including propsSchema, defaultProps, tree (JSON), and code (JS).

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID

```json
{
  "tool": "brain_get_site_component",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_site_page`

Get full site page data. Returns { id, siteId, slug, title, files, entryPath, filesVersion, customCss, customJs, seo, isHome, isPublished, shareId, ... } — files is the virtual file system { path: content }.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID

```json
{
  "tool": "brain_get_site_page",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_site_assets`

List site assets uploaded to the workspace. Optionally filter by site.

**Input:**
  - `siteId`?: string (uuid) . Filter assets belonging to a specific site

```json
{
  "tool": "brain_list_site_assets",
  "arguments": {}
}
```

#### `brain_list_site_component_history`

List the change history of a site component (who edited it, when, and which fields changed). Each entry includes changedFields, per-field {from, to} diff (large values truncated), source (app | mcp | restore | system), and the editor user info. Optionally filter by userId.

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID
  - `limit`?: number . Max entries to return (default 50, max 200)
  - `userId`?: string (uuid) . Optional: only return changes made by this user

```json
{
  "tool": "brain_list_site_component_history",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_site_component_versions`

List the saved versions (restorable snapshots) of a site component. Each entry has a version id, createdAt, optional changeDescription, the editor (`user`) and `actor` — the machine that wrote it, null for a person in the app. Use the version id with brain_restore_site_component_version. (Differs from brain_list_site_component_history, which returns the per-edit field diff.)

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID
  - `limit`?: number . Max versions to return (default 30)

```json
{
  "tool": "brain_list_site_component_versions",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_site_components`

List site components available to the workspace (system, public, and workspace-scoped). Supports filtering by scope, category, or search term.

**Input:**
  - `scope`?: enum(system | workspace | public) . Filter by scope (omit for all accessible)
  - `category`?: string . Filter by category name
  - `search`?: string . Search in name, displayName, description

```json
{
  "tool": "brain_list_site_components",
  "arguments": {}
}
```

#### `brain_list_site_page_files`

List all file paths in a site page virtual file system. Returns { paths, entryPath, filesVersion }.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID

```json
{
  "tool": "brain_list_site_page_files",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_site_pages`

List all pages for a site. Returns metadata and entry path. Use brain_get_site_page for the full files dictionary.

**Input:**
  - `siteId`: string (uuid) . Site ID

```json
{
  "tool": "brain_list_site_pages",
  "arguments": {
    "siteId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_sites`

List all sites in the workspace. Returns id, name, slug, icon, isPublished, isArchived. Use includeArchived to also return archived sites.

**Input:**
  - `includeArchived`?: boolean . Include archived sites (default false)

```json
{
  "tool": "brain_list_sites",
  "arguments": {}
}
```

#### `brain_publish_site_page`

Publish or unpublish a site page. When publishing, a shareId is generated if one does not exist. Returns { isPublished, shareId, publicUrl } — `publicUrl` is the ready-to-send public link (the workspace's own host + /s/<shareId>). Send it verbatim; never build a public URL by guessing a host.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `publish`: boolean . true to publish, false to unpublish

```json
{
  "tool": "brain_publish_site_page",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "publish": false
  }
}
```

#### `brain_set_site_component_sharing`

Set who inside the workspace may see and use a component. Everything starts as "private" — visible only to whoever created it, plus the workspace owner and admins — so a component built for colleagues has to be shared before they can see it. Pass visibility "public" to open it to the whole workspace, or "restricted" with grantTo to name people. Returns the resulting grant list.

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID
  - `visibility`?: enum(public | restricted | private) . Who in the workspace may see and use it. "public" = the whole workspace, "restricted" = only the people in the grant list, "private" = only the creator (and the workspace owner/admins). Omit to leave it as it is.
  - `grantTo`?: array<string> . User ids to give access to. Use brain_list_workspace_members to find them.
  - `revokeFrom`?: array<string> . User ids to take access away from.

```json
{
  "tool": "brain_set_site_component_sharing",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_set_site_page_files`

Replace the entire virtual file system of a site page. Optionally update entryPath.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `files`: record . Full files dictionary { path: content }
  - `entryPath`?: string . Entry HTML file path

```json
{
  "tool": "brain_set_site_page_files",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000",
    "files": null
  }
}
```

#### `brain_update_site`

Update site metadata. Only provided fields are changed. Use brain_get_site first to read current values.

**Input:**
  - `siteId`: string (uuid) . Site ID
  - `name`?: string . Display name
  - `slug`?: string . URL-safe lowercase identifier
  - `icon`?: string . Emoji icon (null to clear)
  - `description`?: string . Short description
  - `settings`?: record . Site settings object (replaces entirely)
  - `globalCss`?: string . Global CSS injected on all pages
  - `globalJs`?: string . Global JS injected on all pages
  - `faviconUrl`?: string . Favicon URL
  - `isPublished`?: boolean . Publish/unpublish the site
  - `isArchived`?: boolean . Archive/restore the site

```json
{
  "tool": "brain_update_site",
  "arguments": {
    "siteId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_site_component`

Update a workspace-scoped site component. Only provided fields are changed. System components cannot be modified.

**Input:**
  - `siteComponentId`: string (uuid) . Site component ID
  - `name`?: string
  - `displayName`?: string
  - `category`?: string
  - `description`?: string
  - `icon`?: string
  - `thumbnailUrl`?: string
  - `version`?: string
  - `propsSchema`?: array<record>
  - `defaultProps`?: record
  - `tree`?: record
  - `code`?: string
  - `tags`?: array<string>

```json
{
  "tool": "brain_update_site_component",
  "arguments": {
    "siteComponentId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_site_page`

Update site page metadata (slug, title, css, js, seo, isHome, isPublished). For file edits use brain_write_site_page_file or brain_edit_site_page_file.

**Input:**
  - `sitePageId`: string (uuid) . Site page ID
  - `slug`?: string . URL path segment
  - `title`?: string . Page title
  - `customCss`?: string . Page-level CSS override
  - `customJs`?: string . Page-level JS override
  - `seo`?: record . SEO object: { title?, description?, ogImageUrl?, noindex?, canonicalUrl? }
  - `isHome`?: boolean . Mark as home page
  - `isPublished`?: boolean . Publish/unpublish the page

```json
{
  "tool": "brain_update_site_page",
  "arguments": {
    "sitePageId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### skills

#### `brain_create_skill`

Create a new skill in the workspace (workspace admin/owner only). A skill is a SKILL.md file with instructions/knowledge. Every new skill is attached to an AI Project: pass projectId to add it to an existing project, or newProjectName to spin up a fresh one; omit both and it lands in the workspace's Miscellaneous project.

**Input:**
  - `name`: string . Skill slug (lowercase, hyphens, e.g. analyze-deal)
  - `displayName`: string . Display name
  - `description`?: string . Skill description
  - `skillMd`: string . SKILL.md content (frontmatter + markdown)
  - `files`?: record . Supporting files: { "reference.md": "content...", "scripts/helper.py": "..." }
  - `tags`?: array<string> . Tags
  - `version`?: string . Semver version
  - `type`?: enum(general | editor) . Skill type: general (MCP prompt) or editor (available in Tiptap editor AI)
  - `projectId`?: string (uuid) . Attach the new skill to this existing AI Project (project) id.
  - `newProjectName`?: string . Attach the new skill to a fresh AI Project created with this name. Ignored when projectId is set.

```json
{
  "tool": "brain_create_skill",
  "arguments": {
    "name": "name",
    "displayName": "displayName",
    "skillMd": "skillMd"
  }
}
```

#### `brain_delete_skill`

Delete a skill (workspace admin/owner only). Irreversible.

**Input:**
  - `skillId`: string (uuid) . Skill ID

```json
{
  "tool": "brain_delete_skill",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_skill`

Read one skill by id — its instructions (skillMd), name and description. Also reads the approaches Brain has learned in this workspace (the "Approaches that already worked here" entries in the workspace map), which brain_list_skills does not list. Use it when a person asks for something an entry there describes: read the approach, then do the task that way. Never present these entries to the person as skills or playbooks — to them it is simply how the work gets done.

**Input:**
  - `skillId`: string (uuid) . The skill id, e.g. from the workspace map

```json
{
  "tool": "brain_get_skill",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_skill_history`

List the change history of a skill (who edited it, when, and which fields changed). Each entry includes changedFields, per-field {from, to} diff (large values truncated), source (app | mcp | restore | system), and the editor user info. Optionally filter by userId.

**Input:**
  - `skillId`: string (uuid) . Skill ID
  - `limit`?: number . Max entries to return (default 50, max 200)
  - `userId`?: string (uuid) . Optional: only return changes made by this user

```json
{
  "tool": "brain_list_skill_history",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_skill_versions`

List the saved versions (restorable snapshots) of a skill. Each entry has a version id, createdAt, optional changeDescription, the editor (`user`) and `actor` — the machine that wrote it, null for a person in the app. Use the version id with brain_restore_skill_version. (Differs from brain_list_skill_history, which returns the per-edit field diff.)

**Input:**
  - `skillId`: string (uuid) . Skill ID
  - `limit`?: number . Max versions to return (default 30)

```json
{
  "tool": "brain_list_skill_versions",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_skills`

List skills: workspace-owned and installed from marketplace (workspace admin/owner only). Returns { own, installed }.

```json
{
  "tool": "brain_list_skills",
  "arguments": {}
}
```

#### `brain_set_skill_sharing`

Set who inside the workspace may see and use a skill. Everything starts as "private" — visible only to whoever created it, plus the workspace owner and admins — so a skill built for colleagues has to be shared before they can see it. Pass visibility "public" to open it to the whole workspace, or "restricted" with grantTo to name people. Returns the resulting grant list.

**Input:**
  - `skillId`: string (uuid) . Skill ID
  - `visibility`?: enum(public | restricted | private) . Who in the workspace may see and use it. "public" = the whole workspace, "restricted" = only the people in the grant list, "private" = only the creator (and the workspace owner/admins). Omit to leave it as it is.
  - `grantTo`?: array<string> . User ids to give access to. Use brain_list_workspace_members to find them.
  - `revokeFrom`?: array<string> . User ids to take access away from.

```json
{
  "tool": "brain_set_skill_sharing",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_skill`

Update an existing skill (workspace admin/owner only). Owner-access skills: owner only.

**Input:**
  - `skillId`: string (uuid) . Skill ID
  - `name`?: string . Skill slug
  - `displayName`?: string . Display name
  - `description`?: string . Description
  - `skillMd`?: string . SKILL.md content
  - `files`?: record . Supporting files
  - `tags`?: array<string> . Tags
  - `version`?: string . Version
  - `type`?: enum(general | editor) . Skill type: general (MCP prompt) or editor (available in Tiptap editor AI)

```json
{
  "tool": "brain_update_skill",
  "arguments": {
    "skillId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### templates

#### `brain_apply_template`

Apply a template to create a single new page. The page is created empty, so {{current_page.property*}} variables resolve to empty strings (only date/title variables fill); use brain_apply_template_to_all to resolve property values per existing page. Sets icon/cover/config/styles from the template. Returns { pageId }.

**Input:**
  - `templateId`: string (uuid) . Template ID

```json
{
  "tool": "brain_apply_template",
  "arguments": {
    "templateId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_apply_template_to_all`

Apply a template to ALL existing non-archived pages in the database. WARNING: destructive — overwrites page content, config, styles, icon, cover, and deletes existing Yjs documents. Variables are resolved per-page using each page's property cache.

**Input:**
  - `templateId`: string (uuid) . Template ID

```json
{
  "tool": "brain_apply_template_to_all",
  "arguments": {
    "templateId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_create_template`

Create a new template for a database. After creation, use brain_set_database_default_template to make it default. Call brain_guide({ category: "page_templates" }) for full reference on content HTML, styles, config, embeds, and variables.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `name`: string . Template name
  - `icon`?: string . Emoji icon for pages created from this template
  - `title`?: string . Default page title. Supports {{variables}} like {{current_date.date}}
  - `content`?: record . Content object: { html: "<p>Hello</p>" }. Use semantic HTML only (p, h1-h3, ul, ol, table, blockquote). No div layouts. Embed databases via <div data-embed-id="EMBED_ID"></div>
  - `config`?: record . Config: { layout?: "narrow"|"full", cover?: "url", icon?: "emoji", showProperties?: ["uuid1","uuid2"] }
  - `styles`?: record . Styles: { background?, fontFamily?, textColor?, maxWidth?, padding?, titleFontSize?, titleColor?, titleFontFamily?, titleAlign?, headerBackground?, headerPadding?, customCSS? }
  - `embeds`?: array<record> . Embedded databases: [{ id: "unique-id", databaseId: "uuid", title?: "Heading shown above the embed", viewType: "table"|"board"|"list"|"gallery", filters: [{propertyId, operator, value, conjunction?: "and"|"or"}], sorts: [{propertyId, direction}] }]. Reference in HTML via <div data-embed-id="id"></div>. Filter values support {{variables}}.

```json
{
  "tool": "brain_create_template",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "name": "name"
  }
}
```

#### `brain_delete_template`

Delete a template from a database. If this template is the default, clear it first with brain_set_database_default_template(templateId: null).

**Input:**
  - `templateId`: string (uuid) . Template ID

```json
{
  "tool": "brain_delete_template",
  "arguments": {
    "templateId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_get_template`

Get a template by ID with full details: name, icon, title, content (HTML), config (layout/cover/icon/showProperties), styles (background/fonts/colors/CSS), and embeds (embedded database views with filters). Call brain_guide({ category: "page_templates" }) for full reference on content HTML, styles, config, embeds, and variables.

**Input:**
  - `templateId`: string (uuid) . Template ID

```json
{
  "tool": "brain_get_template",
  "arguments": {
    "templateId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_templates`

List all templates for a database. Returns id, name, icon, isDefault flag, and a short content preview. Use brain_get_template for full details.

**Input:**
  - `databaseId`: string (uuid) . Database ID

```json
{
  "tool": "brain_list_templates",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_update_template`

Update an existing template. Only provided fields are changed; omitted fields stay as-is. Use brain_get_template first to read current values. Call brain_guide({ category: "page_templates" }) for full reference on content HTML, styles, config, embeds, and variables.

**Input:**
  - `templateId`: string (uuid) . Template ID
  - `name`?: string . Template name
  - `icon`?: string . Emoji icon (null to clear)
  - `title`?: string . Default page title. Supports {{variables}}. null to clear
  - `content`?: record . Content: { html: "<p>...</p>" }. Replaces entire content.
  - `config`?: record . Config: { layout?, cover?, icon?, showProperties? }. Replaces entire config.
  - `styles`?: record . Styles: { background?, fontFamily?, textColor?, maxWidth?, padding?, titleFontSize?, titleColor?, titleFontFamily?, titleAlign?, headerBackground?, headerPadding?, customCSS? }. Replaces entire styles.
  - `embeds`?: array<record> . Embedded databases array (same shape as brain_create_template: { id, databaseId, title?, viewType, filters:[{propertyId, operator, value, conjunction?}], sorts }). Replaces the entire embeds list.

```json
{
  "tool": "brain_update_template",
  "arguments": {
    "templateId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### views

#### `brain_create_view`

Create a new database view (table/board/list/calendar/gallery/timeline). Returns the new view.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `name`: string . View name
  - `type`?: enum(table | board | list | calendar | gallery | timeline) . View type

```json
{
  "tool": "brain_create_view",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "name": "name"
  }
}
```

#### `brain_delete_view`

Delete a database view. Returns { success }.

**Input:**
  - `viewId`: string (uuid) . View ID

```json
{
  "tool": "brain_delete_view",
  "arguments": {
    "viewId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_list_views`

List the views of a database you can see. Returns full view rows including type, filters, sorts, visibleProperties, groupBy, config and isPrivate. A view another member marked private is not listed.

**Input:**
  - `databaseId`: string (uuid) . Database ID

```json
{
  "tool": "brain_list_views",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_reorder_views`

Reorder views inside a database. Returns the reordered view list.

**Input:**
  - `databaseId`: string (uuid) . Database ID
  - `orderedIds`: array<string> . View IDs in final order

```json
{
  "tool": "brain_reorder_views",
  "arguments": {
    "databaseId": "00000000-0000-0000-0000-000000000000",
    "orderedIds": []
  }
}
```

#### `brain_share_view`

Toggle public sharing for a database view. Returns { shareId, isPublic, publicUrl } — `publicUrl` is the ready-to-send public link (the workspace's own host + /share/<shareId>) when public, else null. Send it verbatim; never construct a share URL by guessing a host or subdomain.

**Input:**
  - `viewId`: string (uuid) . View ID
  - `on`: boolean . true = make public, false = unshare

```json
{
  "tool": "brain_share_view",
  "arguments": {
    "viewId": "00000000-0000-0000-0000-000000000000",
    "on": false
  }
}
```

#### `brain_update_view`

Update an existing view: name, type, filters, sorts, visibleProperties, propertyWidths, groupBy, cardFields, cardOrder, config, and order. config is merged with the existing config (not replaced). Returns the updated view.

**Input:**
  - `viewId`: string (uuid) . View ID
  - `name`?: string . View name
  - `type`?: enum(table | board | list | calendar | gallery | timeline) . View type
  - `filters`?: array<object> . View filters as [{ propertyId, operator, value, conjunction? }]
  - `sorts`?: array<object> . View sorts as [{ propertyId, direction }]
  - `visibleProperties`?: array<string> . Visible property IDs
  - `propertyWidths`?: record . Property width map { propertyId: pixels }
  - `groupBy`?: string (uuid) . Group by property ID (null to clear)
  - `cardFields`?: array<string> . Board/gallery card field IDs
  - `cardOrder`?: string . Card ordering preset
  - `config`?: record . View config merge patch, e.g. { freezeFirstColumn: true, cardCover: "..." }
  - `order`?: number . Manual view order

```json
{
  "tool": "brain_update_view",
  "arguments": {
    "viewId": "00000000-0000-0000-0000-000000000000"
  }
}
```

### workspace

#### `brain_clear_workspace_plan_price`

Clear a custom plan price for a workspace, archiving the Stripe Price (platform admin only). Active subscriptions keep their current price until the next checkout.

**Input:**
  - `workspaceId`: string (uuid) . Target workspace UUID
  - `planId`: string . Plan id

```json
{
  "tool": "brain_clear_workspace_plan_price",
  "arguments": {
    "workspaceId": "00000000-0000-0000-0000-000000000000",
    "planId": "planId"
  }
}
```

#### `brain_get_workspace_plan_prices`

List custom plan price overrides for a workspace (platform admin only). Returns a map of planId → { priceUsd, stripePriceId, createdAt }.

**Input:**
  - `workspaceId`: string (uuid) . Target workspace UUID

```json
{
  "tool": "brain_get_workspace_plan_prices",
  "arguments": {
    "workspaceId": "00000000-0000-0000-0000-000000000000"
  }
}
```

#### `brain_invite_user`

Invite a person into THIS workspace by email. Sends them an email invitation with a link to join; the recipient sets their own password and becomes a member on accept (an invite is NOT the same as instantly adding them — they must accept, and the link expires in 7 days). Use this to onboard a teammate into the workspace. Admins may invite only as 'member'; promoting to 'admin' or 'owner' requires the caller to be an owner. Inviting an existing GUEST (someone shared into a single folder/database/doc) promotes them to the given role immediately instead of mailing a link — the response then carries promoted:true and expiresAt:null. Fails if the email is already a full member. Returns { success, email, role, expiresAt, promoted }.

**Input:**
  - `email`: string (email) . Email address of the person to invite into the workspace.
  - `role`?: enum(owner | admin | member) . Workspace role to grant on accept. 'member' (default) is a regular member; 'admin' and 'owner' can only be granted when the caller is an owner.

```json
{
  "tool": "brain_invite_user",
  "arguments": {
    "email": "user@example.com"
  }
}
```

#### `brain_list_workspace_members`

List members of the current workspace. Returns { id, name, avatarUrl } per member — email is intentionally omitted as private metadata. Use the returned `id` (or `name`) as the value when assigning a Person property via brain_update_cell / brain_bulk_update_cells.

**Input:**
  - `search`?: string . Case-insensitive name filter. Returns all members if omitted.

```json
{
  "tool": "brain_list_workspace_members",
  "arguments": {}
}
```

#### `brain_search_workspace`

Keyword/text search across pages AND docs in the current workspace. Best for exact names and proper nouns; for concept/similarity queries use brain_search_semantic. Every result carries item_type ("doc"|"page"), is_private (boolean) and location (where it lives — a doc's sidebar folder / parent-doc / "Private"|"Workspace"; a row's database name) so you can tell a private DOC apart from a same-named database ROW and scope to a named place BEFORE editing or deleting. Returns an array keyed by kind: page rows ({ kind:"page", item_type:"page", pageId, databaseId, databaseName, is_private, location, matchedText, propertiesCache, url }) and doc rows ({ kind:"doc", item_type:"doc", docId, docTitle, parentId, is_private, location, matchedText, url }).

**Input:**
  - `query`: string . Search query
  - `limit`?: number . Max results

```json
{
  "tool": "brain_search_workspace",
  "arguments": {
    "query": "query"
  }
}
```

#### `brain_set_workspace_plan_price`

Set a custom plan price for a workspace, creating a Stripe Price (platform admin only). Applies at the next checkout — does not retroactively update an existing active subscription.

**Input:**
  - `workspaceId`: string (uuid) . Target workspace UUID
  - `planId`: string . Plan id (e.g. "business")
  - `priceUsd`: number . Custom price in USD per month

```json
{
  "tool": "brain_set_workspace_plan_price",
  "arguments": {
    "workspaceId": "00000000-0000-0000-0000-000000000000",
    "planId": "planId",
    "priceUsd": 0
  }
}
```

