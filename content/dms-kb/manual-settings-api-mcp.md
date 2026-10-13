---
title: Harbourline DMS manual - settings, API, OpenAPI and MCP access
model: all
topic: manual
---

# Settings, API and MCP

The **Settings** page (`#/settings`) is for administrators and integrators. It shows how to reach the DMS from other systems, the roles and demo logins, and how to connect AI tools to the Harbourline knowledge box over MCP.

## API-first

Every screen in the DMS is built on the public API at **/dms/api**. Anything you can do in the UI, another system can do through the API with the right role.

- **API docs** – `GET /dms/api/docs` renders the full reference as a web page.
- **OpenAPI** – `GET /dms/api/openapi.json` is an OpenAPI 3.0 document generated from the route table, so it is always in step with the server.
- **Health** – `GET /dms/api/health` returns status without authentication.

### Authentication

1. `POST /dms/api/auth/login` with `{"email": "...", "password": "..."}`.
2. The response is `{token, user: {id, name, role, siteId}}`.
3. Send `Authorization: Bearer <token>` on every other request.
4. `GET /dms/api/auth/me` confirms who the token belongs to.

### List conventions

All list endpoints accept `q`, `siteId`, `status`, `from`, `to`, `sort`, `page` and `pageSize`, and return `{items, total, page, pageSize}`. Dates are ISO 8601; money is whole AUD.

### Main resources

Customers, leads, test drives, deals (with events), vehicles, trade-ins, finance applications, promotions, campaigns, staff, sites, documents, KPIs and Domo exports. AI endpoints: `/ask`, `/agent/query`, `/deals/:id/summary`, `/leads/:id/followup`, `/documents/:id/process`, `/documents/:id/verify`, `/search` and `/arag/status`.

## How do I open the API docs?

On **Settings**, click **Open API docs**. To load the API into Postman or another tool, click **Download OpenAPI**.

## How do I try a call?

1. Click **Copy token** (shown only for your current session).
2. Run, for example: `curl -H "Authorization: Bearer <token>" "https://<host>/dms/api/deals?stage=finance&siteId=pen"`.
3. Tokens are held in server memory and end when the server restarts or you sign out.

## Progress Agentic RAG status

The **Progress Agentic RAG** card calls `GET /dms/api/arag/status` and shows:

- The knowledge box id.
- Resource counts by topic: manual, policy, document, plus the configurator's product content.
- The agent ids used for Ask the ERP.
- The **MCP endpoint** URL of the knowledge box.

Tokens and API keys are never shown in the browser. All ARAG calls are made by the DMS server.

## MCP access

The knowledge box can be reached by any MCP client (for example Claude Desktop, Claude Code or Cursor) through its MCP endpoint. This lets a manager ask the same manual and policy questions from their own AI tool, with the same citations.

### How do I connect Claude or Cursor?

1. On **Settings**, click **Copy MCP endpoint**.
2. In your MCP client, add a remote MCP server with that URL.
3. Authenticate with a knowledge-box reader key issued by the DMS administrator. Do not use the owner service token.
4. Ask, for example, "Using the Harbourline knowledge box, what is the discount approval limit for a sales manager?"

MCP access covers the knowledge box (manual, policies, processed documents and product content). Live ERP data is only available through the DMS API and Ask the ERP, where your role limits what you see.

## Roles and demo logins

The **Roles** card lists the five roles and what each can do. The **Demo logins** card lists the demo accounts (general manager, sales manager Parramatta, salesperson Parramatta, digital experience manager, business manager F&I); the password for all of them is `demo1234`. These accounts exist only in the prototype.

## Site settings (general manager)

- **Monthly targets** – units and gross target per site and month. Click **Edit targets**, change the values and click **Save**.
- **Response SLAs** – read-only display of the lead response targets from the lead response policy.
- **Stuck thresholds** – days per pipeline stage before a deal is flagged stuck.

## Audit

Every change made through the API (and so through the UI) records the user id and time. Deal events, document verifications, approvals and promotion publishing are visible in the relevant timelines.
