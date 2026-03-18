/*
 * Cisco XDR API Client
 * Unified client for Platform (IROH), Private Intel, and Automation APIs.
 * Supports GET, POST, PATCH with Bearer token auth.
 */

import fetch from 'node-fetch';
import type { XdrConfig } from '../utils/config.js';
import { XdrAuthService } from './xdrAuth.js';

export class XdrApi {
  private auth: XdrAuthService;

  constructor(config: XdrConfig) {
    this.auth = new XdrAuthService(config);
  }

  async get<T = unknown>(url: string): Promise<T> {
    const headers = await this.auth.getAuthHeaders();
    const response = await fetch(url, { method: 'GET', headers });
    return this.handleResponse<T>(response);
  }

  async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    const headers = await this.auth.getAuthHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async patch<T = unknown>(url: string, body: unknown): Promise<T> {
    const headers = await this.auth.getAuthHeaders();
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`XDR API PATCH ${url} failed [${response.status}]: ${errorText}`);
    }

    // 204 No Content is valid for PATCH (e.g. incident update)
    if (response.status === 204) return { success: true } as T;

    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  private async handleResponse<T>(response: Awaited<ReturnType<typeof fetch>>): Promise<T> {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`XDR API error ${response.status}: ${text}`);
    }
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
  }
}
