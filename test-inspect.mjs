import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'build', 'index.js');

const proc = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env }
});

const rl = createInterface({ input: proc.stdin, output: proc.stdout });

// Send MCP initialize + list tools + call xdr_inspect
const init = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\n';

proc.stdin.write(init);

// After init, send tools/list then call xdr_inspect
setTimeout(() => {
  const listTools = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n';
  proc.stdin.write(listTools);
}, 500);

setTimeout(() => {
  const callInspect = JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'xdr_inspect',
      arguments: { content: 'Check this IP 1.2.3.4 and domain example.com for threats' }
    }
  }) + '\n';
  proc.stdin.write(callInspect);
}, 1000);

setTimeout(() => proc.kill(), 5000);
