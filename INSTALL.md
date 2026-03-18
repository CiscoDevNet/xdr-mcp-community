# Cisco XDR MCP Server — Installation & Change Log

This document is the **go-to reference** for installation, configuration, learnings, and changes made while building the Cisco XDR MCP server.

---

## Quick Start

```bash
cd /path/to/xdr-mcp
npm install
cp .env.example .env
# Edit .env with XDR_CLIENT_ID and XDR_CLIENT_PASSWORD
npm run build
npm start
```

---

## Table of Contents

1. [Authentication](#authentication)
2. [API Base URLs & Regions](#api-base-urls--regions)
3. [Tool Overview (27 Tools)](#tool-overview-27-tools)
4. [Change Log](#change-log)
5. [Known Issues & Workarounds](#known-issues--workarounds)
6. [References](#references)

---

## Authentication

### Method: OAuth2 Client Credentials

Per [Cisco XDR Authentication](https://developer.cisco.com/docs/cisco-xdr/authentication/):

1. **Create API Client** in XDR: Administration → API Clients
2. **Scopes**: Select required scopes (e.g. `enrich:read`, `inspect:read`, `casebook`, `private-intel:read`, `response:read`, `ao` for Automation)
3. **Credentials**: Client ID and Client Password (save immediately — password cannot be recovered)

### Token Flow

```
POST https://visibility.{region}.amp.cisco.com/iroh/oauth2/token
Authorization: Basic base64(client_id:client_password)
Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials
```

Response: `access_token`, `token_type` (bearer), `expires_in` (seconds)

### Credential Handling

- **Never** put credentials in `mcp.json`
- Use `.env` file (copy from `.env.example`)
- Required env vars: `XDR_CLIENT_ID`, `XDR_CLIENT_PASSWORD`
- Optional: `XDR_REGION` (us | eu | apjc)

---

## API Base URLs & Regions

Different XDR API families use **different base URLs**. Mixing these causes 404 errors.

| API Family | Base URL (US) | Used By |
|------------|---------------|---------|
| **Platform (IROH)** | `https://visibility.amp.cisco.com/iroh` | Inspect, Enrich, Incidents, Response, Casebooks, Profile, Integrations |
| **Private Intel (CTIA)** | `https://private.intel.amp.cisco.com/ctia` | Indicators, Judgments, Sightings, Feeds |
| **Automation** | `https://automate.us.security.cisco.com/api` | Workflows, Instances |

### Region Mapping

| Region | Platform | Private Intel | Automation |
|--------|----------|---------------|------------|
| **us** | visibility.amp.cisco.com | private.intel.amp.cisco.com | automate.us.security.cisco.com |
| **eu** | visibility.eu.amp.cisco.com | private.intel.eu.amp.cisco.com | automate.eu.security.cisco.com |
| **apjc** | visibility.apjc.amp.cisco.com | private.intel.apjc.amp.cisco.com | automate.apjc.security.cisco.com |

### IROH Platform API Paths (per [Cisco XDR Introduction](https://developer.cisco.com/docs/cisco-xdr/introduction/))

- **Inspect**: `/iroh-inspect/inspect`
- **Enrich**: `/iroh-enrich/observe/observables`, `/iroh-enrich/deliberate/observables`, `/iroh-enrich/refer/observables`
- **Incident Management**: `/iroh-incident/incidents`
- **Response**: `/iroh-response/respond/observables`, `/iroh-response/respond/trigger`
- **Casebooks**: `/iroh-casebook/casebooks`
- **Profile**: `/iroh-profile/profile`
- **Integrations**: `/iroh-int/integrations`

---

## Tool Overview (27 Tools)

### Section 1 — Inspect & Investigate (3 tools)

| Tool | Description |
|------|-------------|
| `xdr_inspect` | Parse text to extract IOCs (IPs, domains, hashes, emails, etc.) |
| `xdr_investigate` | Full enrichment: sightings + verdicts + pivot links across all integrations |
| `xdr_inspect_and_investigate` | One-shot: extract IOCs from text, then investigate all in parallel |

### Section 2 — Incidents (6 tools)

| Tool | Description |
|------|-------------|
| `xdr_incidents_list` | List incidents with filters (status, limit, offset) |
| `xdr_incident_get` | Get full incident details |
| `xdr_incident_update` | Update status, assignee, resolution (uses PATCH) |
| `xdr_incident_worklog` | Get worklog/audit trail |
| `xdr_incident_worklog_add` | Add note to worklog |
| `xdr_incident_observables` | List all observables in an incident |

### Section 3 — Response Actions (2 tools)

| Tool | Description |
|------|-------------|
| `xdr_response_get_actions` | Discover available actions (block, isolate, quarantine) for observables |
| `xdr_response_trigger` | Execute action (requires action_id, module_instance_id, module_type_id from get_actions) |

### Section 4 — Casebooks (4 tools)

| Tool | Description |
|------|-------------|
| `xdr_casebook_list` | List casebooks |
| `xdr_casebook_get` | Get casebook details |
| `xdr_casebook_create` | Create new casebook |
| `xdr_casebook_add_observables` | Add observables to casebook |

### Section 5 — Threat Intelligence (4 tools)

| Tool | Description |
|------|-------------|
| `xdr_intel_indicators` | Search indicators (malware, campaign, MITRE) |
| `xdr_intel_judgments` | Get disposition for observable |
| `xdr_intel_feeds` | List private feeds |
| `xdr_intel_sightings` | Search sightings of observable in environment |

### Section 6 — Workflows & Automation (6 tools)

| Tool | Description |
|------|-------------|
| `xdr_workflow_list` | List workflows |
| `xdr_workflow_get` | Get workflow definition |
| `xdr_workflow_start` | Execute workflow |
| `xdr_workflow_instance_list` | List workflow runs |
| `xdr_workflow_instance_get` | Get instance details |
| `xdr_workflow_instance_cancel` | Cancel running instance |

### Section 7 — Admin & Platform (2 tools)

| Tool | Description |
|------|-------------|
| `xdr_integrations_list` | List integration modules (health, module_instance_id) |
| `xdr_profile_get` | Get org profile and scopes |

---

## Change Log

### v2.0.0 (2026-03)

**Major expansion from v1.0 (20 tools) to 27 tools.**

#### New Capabilities

- **xdr_investigate**: Combined observe + deliberate + refer in one call
- **xdr_inspect_and_investigate**: Inspect text → investigate all IOCs in one call
- **Incidents**: Full CRUD (list, get, update, worklog, worklog_add, observables)
- **Response Actions**: get_actions + trigger (block, isolate, quarantine)
- **Casebooks**: list, get, create, add_observables
- **Threat Intel**: indicators, judgments, feeds, sightings
- **Integrations**: List modules for response trigger

#### API Changes

- **Incidents**: Switched from `private-intel/incident` to `iroh-incident/incidents` (IROH Platform API per [Cisco XDR Introduction](https://developer.cisco.com/docs/cisco-xdr/introduction/))
- **Response**: New `iroh-response/respond/observables` and `iroh-response/respond/trigger`
- **Casebooks**: New `iroh-casebook/casebooks`
- **Integrations**: New `iroh-int/integrations`
- **PATCH support**: Added `patch()` to xdrApi for incident updates (handles 204 No Content)

#### Code Changes

- **xdrApi.ts**: Rewritten to use full URLs; added `patch()` method
- **server.ts**: Replaced with 27-tool implementation; uses Zod for input validation
- **Config**: Base URLs now from `loadConfig()` (region-aware)
- **Enrich API**: Body is array of observables directly (not `{ observables }`) for observe/deliberate/refer
- **Automation API**: Paths use `/v1/workflows`, `/v1/instances` per [Automation API Guide](https://developer.cisco.com/docs/cisco-xdr/automation-api-guide/)

#### Dependencies

- Added `zod` for input validation

### v1.0.0 (Initial)

- Inspect, Enrich (observe, deliberate, refer)
- Incidents (summary, worklog, create) via private-intel
- Workflows, instances, calendars, schedules, targets, variables, webhooks
- Profile

---

## Known Issues & Workarounds

### 1. Automation API Path Versioning

The Automation API has multiple versions (v1, v1.1, v1.2). Current implementation uses `/v1/workflows` and `/v1/instances`. If you see 404:

- Try `/v1.2/workflows` for listing
- Try `/v1.1/instances` for instances
- Workflow start may require POST to `/v1.1/workflows/start` with query params instead of path

### 2. Enrich API Request Body

Some Enrich endpoints may expect `{ observables: [...] }` vs `[...]` directly. If observe/deliberate/refer fail with 400, try wrapping: `{ observables }`.

### 3. Casebooks & Integrations

Casebook and Integration APIs may require additional scopes or may not be available in all XDR tiers. Verify in your XDR tenant.

### 4. Response Trigger

`xdr_response_trigger` requires exact `action_id`, `module_instance_id`, `module_type_id` from `xdr_response_get_actions`. Always call get_actions first.

---

## References

- [Cisco XDR API Introduction](https://developer.cisco.com/docs/cisco-xdr/introduction/)
- [Authentication](https://developer.cisco.com/docs/cisco-xdr/authentication/)
- [Getting Started](https://developer.cisco.com/docs/cisco-xdr/getting-started/)
- [Automation API Guide](https://developer.cisco.com/docs/cisco-xdr/automation-api-guide/)
- [API Clients (XDR Help)](https://docs.xdr.security.cisco.com/Content/Administration/api-clients.htm)
- [CiscoDevNet devnet-template](https://github.com/CiscoDevNet/devnet-template)
