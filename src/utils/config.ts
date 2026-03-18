/*
 * Cisco XDR MCP Server - Configuration
 * Credentials loaded from .env - NEVER pass in mcp.json
 */

export type XdrRegion = 'us' | 'eu' | 'apjc';

export interface XdrConfig {
  /** OAuth2 Client ID from XDR API Client configuration */
  clientId: string;
  /** OAuth2 Client Password/Secret from XDR API Client configuration */
  clientPassword: string;
  /** Region: us (North America), eu (Europe), apjc (Asia Pacific/Japan/China) */
  region: XdrRegion;
  /** Optional: Override OAuth token URL (for custom environments) */
  oauthTokenUrl?: string;
  /** Optional: Override Automation API base URL */
  automateBaseUrl?: string;
  /** Optional: Override Platform (IROH) base URL */
  platformBaseUrl?: string;
  /** Optional: Override Private Intelligence base URL */
  privateIntelBaseUrl?: string;
  /** Optional: Override Conure (Incidents & Investigations) base URL */
  conureBaseUrl?: string;
}

const REGION_URLS = {
  us: {
    oauth: 'https://visibility.amp.cisco.com/iroh/oauth2/token',
    automate: 'https://automate.us.security.cisco.com/api',
    platform: 'https://visibility.amp.cisco.com/iroh',
    privateIntel: 'https://private.intel.amp.cisco.com/ctia',
    conure: 'https://conure.us.security.cisco.com',
  },
  eu: {
    oauth: 'https://visibility.eu.amp.cisco.com/iroh/oauth2/token',
    automate: 'https://automate.eu.security.cisco.com/api',
    platform: 'https://visibility.eu.amp.cisco.com/iroh',
    privateIntel: 'https://private.intel.eu.amp.cisco.com/ctia',
    conure: 'https://conure.eu.security.cisco.com',
  },
  apjc: {
    oauth: 'https://visibility.apjc.amp.cisco.com/iroh/oauth2/token',
    automate: 'https://automate.apjc.security.cisco.com/api',
    platform: 'https://visibility.apjc.amp.cisco.com/iroh',
    privateIntel: 'https://private.intel.apjc.amp.cisco.com/ctia',
    conure: 'https://conure.apjc.security.cisco.com',
  },
} as const;

export function loadConfig(): XdrConfig {
  const clientId = process.env.XDR_CLIENT_ID;
  const clientPassword = process.env.XDR_CLIENT_PASSWORD;
  const region = (process.env.XDR_REGION || 'us').toLowerCase() as XdrRegion;

  if (!clientId) {
    throw new Error(
      'XDR_CLIENT_ID environment variable is required. Create an API Client in XDR portal and add credentials to .env'
    );
  }
  if (!clientPassword) {
    throw new Error(
      'XDR_CLIENT_PASSWORD environment variable is required. Add to .env file.'
    );
  }
  if (!['us', 'eu', 'apjc'].includes(region)) {
    throw new Error(
      'XDR_REGION must be one of: us, eu, apjc. Default is us.'
    );
  }

  return {
    clientId,
    clientPassword,
    region,
    oauthTokenUrl: process.env.XDR_OAUTH_TOKEN_URL || REGION_URLS[region].oauth,
    automateBaseUrl: process.env.XDR_AUTOMATE_BASE_URL || REGION_URLS[region].automate,
    platformBaseUrl: process.env.XDR_PLATFORM_BASE_URL || REGION_URLS[region].platform,
    privateIntelBaseUrl: process.env.XDR_PRIVATE_INTEL_BASE_URL || REGION_URLS[region].privateIntel,
    conureBaseUrl: process.env.XDR_CONURE_BASE_URL || REGION_URLS[region].conure,
  };
}
