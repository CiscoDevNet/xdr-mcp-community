# Cisco XDR MCP Server

MCP (Model Context Protocol) server that exposes Cisco XDR APIs as tools for AI assistants. Connects to the XDR portal (e.g. https://xdr.us.security.cisco.com/) with **27 tools** across Inspect, Investigate, Incidents, Response Actions, Casebooks, Threat Intel, Workflows, and Admin.

## Features

- **Inspect & Investigate**: Parse text for IOCs, full enrichment (sightings, verdicts, pivot links)
- **Incidents**: List, get, update, worklog, extract observables
- **Response Actions**: Discover and trigger (block, isolate, quarantine)
- **Casebooks**: Create and manage investigation casebooks
- **Threat Intel**: Indicators, judgments, feeds, sightings
- **Workflows**: List, run, monitor automation workflows
- **Admin**: Integrations list, profile

> **See [INSTALL.md](INSTALL.md)** for detailed installation, API reference, change log, and troubleshooting.

## Credential Handling (Important)

**Never put credentials in `mcp.json`.** All authentication is loaded from environment variables.

### Recommended: Use `.env` file

1. Copy `.env.example` to `.env`
2. Add your XDR API Client credentials:

```bash
cp .env.example .env
# Edit .env with your XDR_CLIENT_ID and XDR_CLIENT_PASSWORD
```

3. Configure Cursor/Claude to run the server with env loaded. For stdio transport, the MCP client typically inherits the shell environment. Ensure `.env` is loaded before starting (e.g. via `dotenv` in your shell or IDE).

### Creating API Client Credentials

1. Log in to [Cisco XDR](https://xdr.us.security.cisco.com/) (or your region)
2. Go to **Administration** > **API Clients**
3. Create a new API Client with appropriate scopes (e.g. `enrich:read`, `inspect:read`, `casebook`, `private-intel:read`, etc.)
4. Copy the Client ID and Client Password into `.env`

See: [Cisco XDR API Clients](https://docs.xdr.security.cisco.com/Content/Administration/api-clients.htm)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XDR_CLIENT_ID` | Yes | OAuth2 Client ID |
| `XDR_CLIENT_PASSWORD` | Yes | OAuth2 Client Password |
| `XDR_REGION` | No | `us`, `eu`, or `apjc` (default: `us`) |

## Installation

```bash
cd xdr-mcp
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
npm start
```

## Docker

```bash
# Build
docker build -t cisco-xdr-mcp .

# Run (pass credentials via env)
docker run -it --rm \
  -e XDR_CLIENT_ID=your_client_id \
  -e XDR_CLIENT_PASSWORD=your_client_password \
  -e XDR_REGION=us \
  cisco-xdr-mcp
```

For MCP clients that use stdio, you typically run the container and attach stdio. Example `mcp.json` (no credentials):

```json
{
  "mcpServers": {
    "cisco-xdr": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "XDR_CLIENT_ID",
        "-e", "XDR_CLIENT_PASSWORD",
        "-e", "XDR_REGION=us",
        "cisco-xdr-mcp"
      ],
      "env": {
        "XDR_CLIENT_ID": "${XDR_CLIENT_ID}",
        "XDR_CLIENT_PASSWORD": "${XDR_CLIENT_PASSWORD}"
      }
    }
  }
}
```

Note: Use your environment or secret manager to provide `XDR_CLIENT_ID` and `XDR_CLIENT_PASSWORD`; the exact syntax depends on your MCP client.

## MCP Configuration (mcp.json)

Example for Cursor - use env vars, never hardcode secrets:

```json
{
  "mcpServers": {
    "cisco-xdr": {
      "command": "node",
      "args": ["/path/to/xdr-mcp/build/index.js"],
      "env": {
        "XDR_CLIENT_ID": "from_env_or_secret",
        "XDR_CLIENT_PASSWORD": "from_env_or_secret",
        "XDR_REGION": "us"
      }
    }
  }
}
```

Ensure `XDR_CLIENT_ID` and `XDR_CLIENT_PASSWORD` are sourced from your shell environment or a secrets manager, not stored in the JSON file.

## API Documentation

- [Cisco XDR APIs](https://developer.cisco.com/docs/cisco-xdr/)
- [Authentication](https://developer.cisco.com/docs/cisco-xdr/authentication/)
- [Getting Started](https://developer.cisco.com/docs/cisco-xdr/getting-started/)

## Repository Structure

- **[INSTALL.md](INSTALL.md)** – Installation, API reference, change log, troubleshooting (go-to doc)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) – Standards for interaction
- [CONTRIBUTING.md](CONTRIBUTING.md) – How to contribute
- [SECURITY.md](SECURITY.md) – Security policies and reporting
- [AGENTS.md](AGENTS.md) – Guidance for AI coding agents

This project follows the [CiscoDevNet devnet-template](https://github.com/CiscoDevNet/devnet-template).

## License

Apache-2.0. See [LICENSE](LICENSE).
