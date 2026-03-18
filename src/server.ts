/*
 * Cisco XDR MCP Server v2.0
 * 27 tools across Inspect, Investigate, Incidents, Response, Casebooks, Intel, Workflows, Admin
 * API reference: https://developer.cisco.com/docs/cisco-xdr/introduction/
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { XdrApi } from './services/xdrApi.js';
import { loadConfig } from './utils/config.js';

// ─────────────────────────────────────────────────────────────────────────────
//  API BASE URLS (from config - region-aware)
//  Different XDR API families use DIFFERENT base URLs.
// ─────────────────────────────────────────────────────────────────────────────
const config = loadConfig();
const VIS = config.platformBaseUrl!;      // IROH: Inspect, Enrich, Response, Casebook, Profile, Integrations
const INTEL = config.privateIntelBaseUrl!; // CTIA: indicators, judgments, sightings, feeds
const AUTO = config.automateBaseUrl!;      // Automation: workflows, instances
const CONURE = config.conureBaseUrl!;      // Conure v2: Incidents & Investigations search

const xdrApi = new XdrApi(config);

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
const ObservableInput = z.object({
  type: z.enum([
    'ip', 'ipv6', 'domain', 'url', 'sha256', 'md5', 'sha1',
    'email', 'mac_address', 'hostname', 'amp_computer_guid',
  ]),
  value: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
//  TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'cisco-xdr-mcp', version: '2.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ─────────────────────────────────────────────────────────────────────────────
//  RESOURCES (xdr:// URI scheme)
// ─────────────────────────────────────────────────────────────────────────────
const XDR_RESOURCE_BASE = 'xdr://';

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: `${XDR_RESOURCE_BASE}incidents/open`,
      name: 'Open Incidents',
      description: 'List of open XDR incidents (last 30 days)',
      mimeType: 'application/json',
    },
    {
      uri: `${XDR_RESOURCE_BASE}incidents/recent`,
      name: 'Recent Incidents',
      description: 'Recent incidents, all statuses (last 7 days)',
      mimeType: 'application/json',
    },
    {
      uri: `${XDR_RESOURCE_BASE}profile`,
      name: 'XDR Profile',
      description: 'Organization profile and scopes',
      mimeType: 'application/json',
    },
    {
      uri: `${XDR_RESOURCE_BASE}integrations`,
      name: 'XDR Integrations',
      description: 'Configured integration modules (health, module_instance_id)',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: `${XDR_RESOURCE_BASE}incident/{incident_id}`,
      name: 'Incident Details',
      description: 'Full incident details by ID (e.g. incident-2a5d7109-e5a6-44e1-891d-1fbbc92dcb87)',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (!uri.startsWith(XDR_RESOURCE_BASE)) {
    return { contents: [{ uri, text: JSON.stringify({ error: `Unknown resource scheme. Expected ${XDR_RESOURCE_BASE}` }) }] };
  }
  const path = uri.slice(XDR_RESOURCE_BASE.length);
  let text: string;

  try {
    if (path === 'incidents/open') {
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      const p = new URLSearchParams({ status: 'Open', limit: '100', from, to });
      const data = await xdrApi.get(`${CONURE}/v2/incident/search?${p}`);
      text = JSON.stringify(data, null, 2);
    } else if (path === 'incidents/recent') {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      const p = new URLSearchParams({ limit: '100', from, to });
      const data = await xdrApi.get(`${CONURE}/v2/incident/search?${p}`);
      text = JSON.stringify(data, null, 2);
    } else if (path === 'profile') {
      const data = await xdrApi.get(`${VIS}/iroh-profile/profile`);
      text = JSON.stringify(data, null, 2);
    } else if (path === 'integrations') {
      const data = await xdrApi.get(`${VIS}/iroh-int/integrations`);
      text = JSON.stringify(data, null, 2);
    } else if (path.startsWith('incident/')) {
      const incidentId = decodeURIComponent(path.slice('incident/'.length));
      const data = await xdrApi.get(`${VIS}/iroh-incident/incidents/${incidentId}`);
      text = JSON.stringify(data, null, 2);
    } else {
      text = JSON.stringify({ error: `Unknown resource: ${path}` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    text = JSON.stringify({ error: msg });
  }

  return { contents: [{ uri, mimeType: 'application/json', text }] };
});

// ─────────────────────────────────────────────────────────────────────────────
//  PROMPTS (reusable workflows)
// ─────────────────────────────────────────────────────────────────────────────
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'triage_open_incidents',
      description: 'Triage open XDR incidents by priority. Lists open incidents, summarizes by severity, suggests next steps.',
      arguments: [
        { name: 'limit', description: 'Max incidents to include (default 25)', required: false },
      ],
    },
    {
      name: 'investigate_ioc',
      description: 'Investigate an IOC (IP, domain, hash, etc.) across all XDR integrations.',
      arguments: [
        { name: 'type', description: 'Observable type: ip, domain, url, sha256, md5, sha1, email', required: true },
        { name: 'value', description: 'The observable value to investigate', required: true },
      ],
    },
    {
      name: 'incident_drill_down',
      description: 'Deep dive into a specific incident: details, observables, worklog, response suggestions.',
      arguments: [
        { name: 'incident_id', description: 'Incident ID (e.g. incident-2a5d7109-e5a6-44e1-891d-1fbbc92dcb87)', required: true },
      ],
    },
    {
      name: 'threat_intel_investigation',
      description: 'Process threat intel content (blog, email, report), extract IOCs, and investigate all.',
      arguments: [
        { name: 'content', description: 'Free-form text containing IOCs to extract and investigate', required: true },
      ],
    },
    {
      name: 'daily_briefing',
      description: 'Daily security briefing: recent incidents, summary by severity, open items.',
      arguments: [
        { name: 'days', description: 'Number of days to include (default 1)', required: false },
      ],
    },
    {
      name: 'response_playbook',
      description: 'Guide response for a confirmed incident: available actions, suggested playbook steps.',
      arguments: [
        { name: 'incident_id', description: 'Incident ID to respond to', required: true },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const limit = args.limit ?? '25';
  const days = args.days ?? '1';

  const prompts: Record<string, { messages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> }> = {
    triage_open_incidents: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Triage open XDR incidents. Use xdr_incidents_list with status='open' and limit=${limit}. Then:
1. Summarize each incident: title, severity, scores (global, TTP, asset), detection sources
2. Group by severity (Critical/High/Medium/Low)
3. For each incident, suggest: (a) whether to investigate further, (b) key observables to run through xdr_investigate, (c) whether to trigger a response playbook
4. Provide an overall triage priority order.`,
          }],
        },
      ],
    },
    investigate_ioc: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Investigate this IOC in XDR. Use xdr_investigate with observables: [{"type":"${args.type ?? 'ip'}", "value":"${args.value ?? ''}"}]. Include verdicts and pivot links. Then summarize: (1) Where was it seen (sightings), (2) Verdict (clean/malicious/suspicious/unknown), (3) Pivot links to open in Umbrella, Secure Endpoint, etc., (4) Recommended next steps.`,
          }],
        },
      ],
    },
    incident_drill_down: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Deep dive into incident ${args.incident_id ?? ''}. Call xdr_incident_get, then xdr_incident_observables, then xdr_incident_worklog. Summarize: (1) Incident overview (title, severity, status, description), (2) All observables (IPs, domains, hashes, etc.), (3) Worklog/audit trail, (4) Suggested response actions (use xdr_response_get_actions if needed).`,
          }],
        },
      ],
    },
    threat_intel_investigation: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Process this threat intel content. Use xdr_inspect_and_investigate with the content. Then: (1) List all IOCs extracted, (2) For each, summarize sightings and verdicts, (3) Highlight any malicious/suspicious findings, (4) Suggest creating a casebook or triggering response for confirmed threats. Content:\n\n${args.content ?? ''}`,
          }],
        },
      ],
    },
    daily_briefing: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Generate a ${days}-day security briefing. Use xdr_incidents_list with from/to for the last ${days} day(s), no status filter. Then: (1) Count by status (Open, New, Closed), (2) Count by severity, (3) List open/high-priority incidents needing attention, (4) Summarize trends.`,
          }],
        },
      ],
    },
    response_playbook: {
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: `Guide response for incident ${args.incident_id ?? ''}. Call xdr_incident_get and xdr_incident_observables. Then call xdr_response_get_actions for key observables. Summarize: (1) Available actions (block, isolate, quarantine, etc.), (2) Which observables to act on, (3) Step-by-step playbook (use xdr_response_trigger when user confirms).`,
          }],
        },
      ],
    },
  };

  const prompt = prompts[name];
  if (!prompt) {
    return {
      description: `Unknown prompt: ${name}`,
      messages: [{ role: 'assistant', content: [{ type: 'text', text: `Prompt "${name}" not found. Available: ${Object.keys(prompts).join(', ')}` }] }],
    };
  }
  return prompt;
});

// ─────────────────────────────────────────────────────────────────────────────
//  TOOLS
// ─────────────────────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 1 — INSPECT & INVESTIGATE (Core threat hunting pipeline)
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_inspect',
      description:
        'Parse free-form text to extract observable IOCs (IPs, domains, URLs, hashes, emails). ' +
        'Feed it threat intel blog posts, Talos advisories, log pastes, or any text. ' +
        'Returns structured observables ready for xdr_investigate. ' +
        'Maps to XDR Investigate > New Investigation text input.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Free-form text up to 2000 chars. Can be paste of blog post, alert, log line, etc.',
          },
        },
        required: ['content'],
      },
    },

    {
      name: 'xdr_investigate',
      description:
        'Full threat investigation across ALL configured integrations ' +
        '(Umbrella, SCA, Secure Endpoint, FMC, Meraki, Duo, Splunk, CrowdStrike, etc.). ' +
        'Returns sightings (where/when seen in your environment), verdicts (clean/malicious/' +
        'suspicious/unknown from Talos + integrated products), and pivot links to source products. ' +
        'This is the PRIMARY threat hunting tool — use it for any IOC you want to chase.',
      inputSchema: {
        type: 'object',
        properties: {
          observables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['ip','ipv6','domain','url','sha256','md5','sha1','email','mac_address','hostname'] },
                value: { type: 'string' },
              },
              required: ['type','value'],
            },
            description: 'Observables to investigate. Mix types freely.',
          },
          include_verdicts: { type: 'boolean', default: true, description: 'Include deliberate (disposition/verdict) results.' },
          include_pivot_links: { type: 'boolean', default: true, description: 'Include refer (pivot links to open in Umbrella, Secure Endpoint, etc.).' },
        },
        required: ['observables'],
      },
    },

    {
      name: 'xdr_inspect_and_investigate',
      description:
        'Two-step shortcut: parse text for IOCs then immediately investigate all found observables. ' +
        'Ideal for processing threat intel content. Paste a Talos blog post, a phishing email, ' +
        'or a OSINT report and get full enrichment in one call.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Free-form text containing embedded IOCs to extract and investigate.' },
        },
        required: ['content'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 2 — INCIDENTS (Triage, investigate, respond)
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_incidents_list',
      description:
        'List XDR incidents sorted by priority score (0-1000). Each incident includes: ' +
        'priority score (MITRE TTP risk + asset value), name, source product, status, ' +
        'MITRE tactics, and assigned analyst. Filter by status to focus on open incidents. ' +
        'Use from/to for date range (ISO 8601). Omit for last 30 days. Maps to XDR Incidents page.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new','open','closed'], description: 'Filter by status. Omit for all incidents.' },
          limit: { type: 'number', default: 25, description: '1-100 incidents.' },
          offset: { type: 'number', default: 0 },
          from: { type: 'string', description: 'Start date ISO 8601. Default: 30 days ago.' },
          to: { type: 'string', description: 'End date ISO 8601. Default: now.' },
        },
      },
    },

    {
      name: 'xdr_incident_get',
      description:
        'Get full incident details: attack graph observables, merged incidents, assets involved ' +
        '(with crown-jewel labels and asset values), MITRE TTP mapping, AI-generated summary, ' +
        'all detections by source, and response playbook status. ' +
        'Use this after xdr_incidents_list to drill into a specific incident.',
      inputSchema: {
        type: 'object',
        properties: { incident_id: { type: 'string', description: 'Incident ID from xdr_incidents_list.' } },
        required: ['incident_id'],
      },
    },

    {
      name: 'xdr_incident_update',
      description:
        'Update an incident: change status to open/closed, assign to an analyst, ' +
        'or add a resolution note when closing. Mirrors the GUI Status and Assign controls.',
      inputSchema: {
        type: 'object',
        properties: {
          incident_id: { type: 'string' },
          status: { type: 'string', enum: ['new','open','closed'], description: 'New incident lifecycle status.' },
          assignee_id: { type: 'string', description: 'User ID to assign incident to.' },
          resolution: { type: 'string', description: 'Resolution note required when setting status to closed.' },
        },
        required: ['incident_id'],
      },
    },

    {
      name: 'xdr_incident_worklog',
      description:
        'Retrieve the complete worklog/audit trail for an incident. Shows every action taken, ' +
        'automated workflow executions, analyst notes, and containment steps with timestamps. ' +
        'Used in PICERL Lessons Learned phase for post-incident review.',
      inputSchema: {
        type: 'object',
        properties: { incident_id: { type: 'string' } },
        required: ['incident_id'],
      },
    },

    {
      name: 'xdr_incident_worklog_add',
      description:
        'Add a note to an incident worklog. Use for documenting findings, analysis steps, ' +
        'and decisions during active incident response. All entries are timestamped and auditable.',
      inputSchema: {
        type: 'object',
        properties: {
          incident_id: { type: 'string' },
          note: { type: 'string', description: 'Note text to append to worklog.' },
        },
        required: ['incident_id','note'],
      },
    },

    {
      name: 'xdr_incident_observables',
      description:
        'List all observables associated with an incident (IPs, domains, file hashes, hostnames, ' +
        'users, processes, URLs). Returns disposition (malicious/suspicious/clean) for each. ' +
        'Use this to extract the full IOC list from an incident for hunting or blocking.',
      inputSchema: {
        type: 'object',
        properties: { incident_id: { type: 'string' } },
        required: ['incident_id'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 3 — RESPONSE ACTIONS (Contain, block, isolate)
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_response_get_actions',
      description:
        'Get all available response actions for observables across integrated products. ' +
        'Returns actionable capabilities such as: block domain (Umbrella), isolate endpoint ' +
        '(Secure Endpoint / CrowdStrike / Defender / SentinelOne / Cybereason), ' +
        'block file hash (EDR), block IP (FMC firewall), disable user (Duo / Entra), ' +
        'quarantine email (SMA). ' +
        'ALWAYS call this before xdr_response_trigger to get valid action_id and module_instance_id.',
      inputSchema: {
        type: 'object',
        properties: {
          observables: {
            type: 'array',
            items: {
              type: 'object',
              properties: { type: { type: 'string' }, value: { type: 'string' } },
              required: ['type','value'],
            },
          },
        },
        required: ['observables'],
      },
    },

    {
      name: 'xdr_response_trigger',
      description:
        'Execute a specific response action. Requires action_id, module_instance_id, ' +
        'and module_type_id from xdr_response_get_actions output. ' +
        'Examples: isolate a compromised endpoint, block a C2 domain in Umbrella, ' +
        'add a malicious hash to EDR block list, block attacker IP in FMC firewall. ' +
        'All actions are logged automatically to the incident worklog.',
      inputSchema: {
        type: 'object',
        properties: {
          observable_type: { type: 'string', description: 'e.g. domain, ip, sha256, amp_computer_guid' },
          observable_value: { type: 'string' },
          action_id: { type: 'string', description: 'From xdr_response_get_actions output.' },
          module_instance_id: { type: 'string', description: 'From xdr_response_get_actions output.' },
          module_type_id: { type: 'string', description: 'From xdr_response_get_actions output.' },
        },
        required: ['observable_type','observable_value','action_id','module_instance_id','module_type_id'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 4 — CASEBOOKS (Investigation tracking)
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_casebook_list',
      description:
        'List investigation casebooks. Casebooks track ongoing threat hunts: ' +
        'collect observables, notes, and findings across multiple sessions. ' +
        'Shared across the org — not private to individual users.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 25 },
          offset: { type: 'number', default: 0 },
        },
      },
    },

    {
      name: 'xdr_casebook_get',
      description: 'Get full casebook details including all collected observables and investigation notes.',
      inputSchema: {
        type: 'object',
        properties: { casebook_id: { type: 'string' } },
        required: ['casebook_id'],
      },
    },

    {
      name: 'xdr_casebook_create',
      description:
        'Create a new investigation casebook. Use at the start of a new threat hunt or ' +
        'when investigating a suspicious IOC that is not yet a formal incident. ' +
        'Optionally seed with initial observables and a working hypothesis.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: "Descriptive title e.g. 'Hunt: Suspicious C2 Domain 2026-03-17'" },
          description: { type: 'string', description: 'Initial hypothesis or investigation notes.' },
          observables: {
            type: 'array',
            items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } },
            description: 'Seed observables to include from the start.',
          },
          tlp: { type: 'string', enum: ['white','green','amber','red'], default: 'amber', description: 'TLP classification for sharing.' },
        },
        required: ['title'],
      },
    },

    {
      name: 'xdr_casebook_add_observables',
      description:
        'Add new observables to an existing casebook during ongoing investigation. ' +
        'Use as you uncover new IOCs — e.g. add C2 IPs and file hashes discovered ' +
        'while pivoting through an incident\'s attack graph.',
      inputSchema: {
        type: 'object',
        properties: {
          casebook_id: { type: 'string' },
          observables: {
            type: 'array',
            items: {
              type: 'object',
              properties: { type: { type: 'string' }, value: { type: 'string' } },
              required: ['type','value'],
            },
          },
        },
        required: ['casebook_id','observables'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 5 — THREAT INTELLIGENCE (Talos + private intel)
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_intel_indicators',
      description:
        'Search threat intelligence indicators. Indicators describe patterns of behavior ' +
        'indicating malicious activity. Covers both Cisco Talos public intel and your ' +
        'private intelligence store. Search by malware family, campaign name, or MITRE technique.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term: malware name, campaign, actor, MITRE technique ID.' },
          limit: { type: 'number', default: 25 },
          offset: { type: 'number', default: 0 },
        },
      },
    },

    {
      name: 'xdr_intel_judgments',
      description:
        'Get disposition judgments for a specific observable. A judgment records ' +
        'clean/malicious/suspicious/unknown/common disposition with an expiry date. ' +
        'Covers both global Talos verdicts and any private judgments your org has added.',
      inputSchema: {
        type: 'object',
        properties: {
          observable_type: { type: 'string', description: 'Observable type: ip, domain, sha256, url, etc.' },
          observable_value: { type: 'string' },
          limit: { type: 'number', default: 25 },
        },
        required: ['observable_type','observable_value'],
      },
    },

    {
      name: 'xdr_intel_feeds',
      description:
        'List private intelligence feeds (block lists, watch lists, allow lists). ' +
        'These feeds are pushed to integrated products: Umbrella uses domain/URL feeds, ' +
        'FMC uses IP block feeds. Use to check what is already blocked org-wide.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', default: 25 } },
      },
    },

    {
      name: 'xdr_intel_sightings',
      description:
        'Search for sightings of an observable in your environment. A sighting records ' +
        'when/where an IOC was observed: source product, timestamp, associated asset/user. ' +
        'Use for intelligence-driven threat hunts — check if a known-bad IOC is lurking ' +
        'undetected in your environment across SCA, Secure Endpoint, Umbrella, FMC, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          observable_type: { type: 'string' },
          observable_value: { type: 'string' },
          start_time: { type: 'string', description: 'ISO 8601 start time e.g. 2026-03-01T00:00:00Z.' },
          limit: { type: 'number', default: 50 },
        },
        required: ['observable_type','observable_value'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 6 — WORKFLOWS & AUTOMATION
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_workflow_list',
      description:
        'List available XDR automation workflows. Includes built-in PICERL playbook workflows: ' +
        "'XDR - Contain Incident Assets' (EDR quarantine), 'XDR - Contain Incident Domains' (Umbrella), " +
        "'XDR - Contain Incident IPs' (FMC), 'XDR - Contain Incident File Hashes' (EDR), " +
        "'XDR - Quarantine Email Messages' (SMA), 'XDR - Identify Vulnerabilities', " +
        "'XDR - Unquarantine Assets', plus any custom workflows you have built.",
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
          category: { type: 'string', description: 'Filter by category: response, investigate, notify, etc.' },
        },
      },
    },

    {
      name: 'xdr_workflow_get',
      description: 'Get full workflow definition including description, input schema, and trigger types.',
      inputSchema: {
        type: 'object',
        properties: { workflow_id: { type: 'string' } },
        required: ['workflow_id'],
      },
    },

    {
      name: 'xdr_workflow_start',
      description:
        'Execute an automation workflow. Supply the input required by the workflow ' +
        '(get from xdr_workflow_get). Use for PICERL containment actions like isolating ' +
        'compromised assets, blocking C2 domains, or running custom response playbooks.',
      inputSchema: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          input: { type: 'object', description: 'Input parameters for the workflow. Schema varies by workflow.' },
          comment: { type: 'string', description: 'Reason for execution — logged to worklog.' },
        },
        required: ['workflow_id'],
      },
    },

    {
      name: 'xdr_workflow_instance_list',
      description:
        'List past and currently running workflow executions with status (success/failed/running) ' +
        'and output summary. Filter to a specific workflow or view all recent executions.',
      inputSchema: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string', description: 'Filter to instances of a specific workflow. Omit for all.' },
          limit: { type: 'number', default: 25 },
        },
      },
    },

    {
      name: 'xdr_workflow_instance_get',
      description: 'Get detailed output and execution trace of a specific workflow run.',
      inputSchema: {
        type: 'object',
        properties: { instance_id: { type: 'string' } },
        required: ['instance_id'],
      },
    },

    {
      name: 'xdr_workflow_instance_cancel',
      description: 'Cancel a currently running workflow instance.',
      inputSchema: {
        type: 'object',
        properties: { instance_id: { type: 'string' } },
        required: ['instance_id'],
      },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  SECTION 7 — ADMIN & PLATFORM
    // ════════════════════════════════════════════════════════════════════════
    {
      name: 'xdr_integrations_list',
      description:
        'List all configured integration modules in your XDR org with health status. ' +
        'Returns module_instance_id values needed for xdr_response_trigger. ' +
        'Shows which of your integrations are healthy vs. erroring.',
      inputSchema: { type: 'object', properties: {} },
    },

    {
      name: 'xdr_profile_get',
      description: 'Get current XDR organization profile, API client scopes, and enabled features.',
      inputSchema: { type: 'object', properties: {} },
    },

  ],
}));

// ─────────────────────────────────────────────────────────────────────────────
//  TOOL CALL HANDLER
// ─────────────────────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 1: INSPECT & INVESTIGATE
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_inspect': {
        const { content } = z.object({ content: z.string().max(2000) }).parse(args);
        const result = await xdrApi.post(`${VIS}/iroh-inspect/inspect`, { content });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_investigate': {
        const { observables, include_verdicts, include_pivot_links } = z.object({
          observables: z.array(ObservableInput).min(1),
          include_verdicts: z.boolean().default(true),
          include_pivot_links: z.boolean().default(true),
        }).parse(args);

        const calls: Promise<[string, unknown]>[] = [
          xdrApi.post(`${VIS}/iroh-enrich/observe/observables`, observables).then((r) => ['sightings', r]),
        ];
        if (include_verdicts) {
          calls.push(xdrApi.post(`${VIS}/iroh-enrich/deliberate/observables`, observables).then((r) => ['verdicts', r]));
        }
        if (include_pivot_links) {
          calls.push(xdrApi.post(`${VIS}/iroh-enrich/refer/observables`, observables).then((r) => ['pivot_links', r]));
        }
        const results = await Promise.all(calls);
        const combined = Object.fromEntries(results);
        return { content: [{ type: 'text', text: JSON.stringify(combined, null, 2) }] };
      }

      case 'xdr_inspect_and_investigate': {
        const { content } = z.object({ content: z.string().max(2000) }).parse(args);
        const observables = (await xdrApi.post(`${VIS}/iroh-inspect/inspect`, { content })) as Array<{ type: string; value: string }>;
        if (!observables || observables.length === 0) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ observables_found: 0, message: 'No IOCs found in provided text.' }, null, 2) }],
          };
        }
        const [sightings, verdicts, pivot_links] = await Promise.all([
          xdrApi.post(`${VIS}/iroh-enrich/observe/observables`, observables),
          xdrApi.post(`${VIS}/iroh-enrich/deliberate/observables`, observables),
          xdrApi.post(`${VIS}/iroh-enrich/refer/observables`, observables),
        ]);
        return {
          content: [{ type: 'text', text: JSON.stringify({ observables_found: observables, sightings, verdicts, pivot_links }, null, 2) }],
        };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 2: INCIDENTS
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_incidents_list': {
        const { status, limit, offset, from, to } = z.object({
          status: z.enum(['new','open','closed']).optional(),
          limit: z.number().min(1).max(100).default(25),
          offset: z.number().default(0),
          from: z.string().optional(),
          to: z.string().optional(),
        }).parse(args ?? {});

        const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (status) p.append('status', status === 'open' ? 'Open' : status === 'new' ? 'New' : 'Closed');
        const now = new Date();
        const fromDate = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const toDate = to ?? now.toISOString();
        p.append('from', fromDate);
        p.append('to', toDate);
        const result = await xdrApi.get(`${CONURE}/v2/incident/search?${p}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_incident_get': {
        const { incident_id } = z.object({ incident_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${VIS}/iroh-incident/incidents/${incident_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_incident_update': {
        const { incident_id, status, assignee_id, resolution } = z.object({
          incident_id: z.string(),
          status: z.enum(['new','open','closed']).optional(),
          assignee_id: z.string().optional(),
          resolution: z.string().optional(),
        }).parse(args);

        const body: Record<string, unknown> = {};
        if (status) body.status = status;
        if (assignee_id) body.assignee_id = assignee_id;
        if (resolution) body.resolution = resolution;

        const result = await xdrApi.patch(`${VIS}/iroh-incident/incidents/${incident_id}`, body);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_incident_worklog': {
        const { incident_id } = z.object({ incident_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${VIS}/iroh-incident/incidents/${incident_id}/worklog`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_incident_worklog_add': {
        const { incident_id, note } = z.object({ incident_id: z.string(), note: z.string().min(1) }).parse(args);
        const result = await xdrApi.post(`${VIS}/iroh-incident/incidents/${incident_id}/worklog`, { message: note });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_incident_observables': {
        const { incident_id } = z.object({ incident_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${VIS}/iroh-incident/incidents/${incident_id}/observables`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 3: RESPONSE ACTIONS
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_response_get_actions': {
        const { observables } = z.object({ observables: z.array(ObservableInput).min(1) }).parse(args);
        const result = await xdrApi.post(`${VIS}/iroh-response/respond/observables`, { observables });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_response_trigger': {
        const { observable_type, observable_value, action_id, module_instance_id, module_type_id } = z.object({
          observable_type: z.string(),
          observable_value: z.string(),
          action_id: z.string(),
          module_instance_id: z.string(),
          module_type_id: z.string(),
        }).parse(args);

        const result = await xdrApi.post(`${VIS}/iroh-response/respond/trigger`, {
          observable: { type: observable_type, value: observable_value },
          action_id,
          module_instance_id,
          module_type_id,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 4: CASEBOOKS
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_casebook_list': {
        const { limit, offset } = z.object({ limit: z.number().default(25), offset: z.number().default(0) }).parse(args ?? {});
        const result = await xdrApi.get(`${VIS}/iroh-casebook/casebooks?limit=${limit}&offset=${offset}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_casebook_get': {
        const { casebook_id } = z.object({ casebook_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${VIS}/iroh-casebook/casebooks/${casebook_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_casebook_create': {
        const { title, description, observables, tlp } = z.object({
          title: z.string(),
          description: z.string().optional(),
          observables: z.array(ObservableInput).default([]),
          tlp: z.enum(['white','green','amber','red']).default('amber'),
        }).parse(args);

        const body: Record<string, unknown> = { title, tlp, type: 'casebook', schema_version: '1.0.17' };
        if (description) body.description = description;
        if (observables.length > 0) body.observables = observables;

        const result = await xdrApi.post(`${VIS}/iroh-casebook/casebooks`, body);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_casebook_add_observables': {
        const { casebook_id, observables } = z.object({
          casebook_id: z.string(),
          observables: z.array(ObservableInput).min(1),
        }).parse(args);

        const result = await xdrApi.post(`${VIS}/iroh-casebook/casebooks/${casebook_id}/observables`, { observables });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 5: THREAT INTELLIGENCE
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_intel_indicators': {
        const { query, limit, offset } = z.object({
          query: z.string().optional(),
          limit: z.number().default(25),
          offset: z.number().default(0),
        }).parse(args ?? {});

        const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (query) p.append('query', query);
        const result = await xdrApi.get(`${INTEL}/indicator/search?${p}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_intel_judgments': {
        const { observable_type, observable_value, limit } = z.object({
          observable_type: z.string(),
          observable_value: z.string(),
          limit: z.number().default(25),
        }).parse(args);

        const result = await xdrApi.get(
          `${INTEL}/judgment/search?observable_type=${observable_type}&observable_value=${encodeURIComponent(observable_value)}&limit=${limit}`
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_intel_feeds': {
        const { limit } = z.object({ limit: z.number().default(25) }).parse(args ?? {});
        const result = await xdrApi.get(`${INTEL}/feed/search?limit=${limit}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_intel_sightings': {
        const { observable_type, observable_value, start_time, limit } = z.object({
          observable_type: z.string(),
          observable_value: z.string(),
          start_time: z.string().optional(),
          limit: z.number().default(50),
        }).parse(args);

        const p = new URLSearchParams({ observable_type, observable_value, limit: String(limit) });
        if (start_time) p.append('observed_time.start_time', start_time);
        const result = await xdrApi.get(`${INTEL}/sighting/search?${p}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 6: WORKFLOWS & AUTOMATION
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_workflow_list': {
        const { limit, offset, category } = z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
          category: z.string().optional(),
        }).parse(args ?? {});

        const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (category) p.append('category', category);
        const result = await xdrApi.get(`${AUTO}/v1/workflows?${p}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_workflow_get': {
        const { workflow_id } = z.object({ workflow_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${AUTO}/v1/workflows/${workflow_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_workflow_start': {
        const { workflow_id, input, comment } = z.object({
          workflow_id: z.string(),
          input: z.record(z.unknown()).default({}),
          comment: z.string().optional(),
        }).parse(args);

        const body: Record<string, unknown> = { input };
        if (comment) body.comment = comment;
        const result = await xdrApi.post(`${AUTO}/v1/workflows/${workflow_id}/start`, body);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_workflow_instance_list': {
        const { workflow_id, limit } = z.object({
          workflow_id: z.string().optional(),
          limit: z.number().default(25),
        }).parse(args ?? {});

        const p = new URLSearchParams({ limit: String(limit) });
        if (workflow_id) p.append('workflow_id', workflow_id);
        const result = await xdrApi.get(`${AUTO}/v1/instances?${p}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_workflow_instance_get': {
        const { instance_id } = z.object({ instance_id: z.string() }).parse(args);
        const result = await xdrApi.get(`${AUTO}/v1/instances/${instance_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_workflow_instance_cancel': {
        const { instance_id } = z.object({ instance_id: z.string() }).parse(args);
        const result = await xdrApi.post(`${AUTO}/v1/instances/${instance_id}/cancel`, {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // ──────────────────────────────────────────────────────────────────────
      //  SECTION 7: ADMIN & PLATFORM
      // ──────────────────────────────────────────────────────────────────────

      case 'xdr_integrations_list': {
        const result = await xdrApi.get(`${VIS}/iroh-int/integrations`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'xdr_profile_get': {
        const result = await xdrApi.get(`${VIS}/iroh-profile/profile`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
export async function run(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cisco XDR MCP Server v2.0.0 running — 27 tools, 4 resources, 1 template, 6 prompts');
}
