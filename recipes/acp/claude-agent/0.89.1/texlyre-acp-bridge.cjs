#!/usr/bin/env node
// texlyre-acp-bridge: runs an ACP agent on stdio and sits between it and
// TeXlyre (reached through a line-mode WebSocket proxy such as websocat).
//
// TeXlyre keeps project files in the browser, so the agent cannot reach them
// on disk. The bridge serves an MCP endpoint over HTTP on a random loopback
// port, protected by a per-process bearer token, and tunnels every MCP request
// to TeXlyre over the existing ACP connection as a `_texlyre/mcp` request.
// It rewrites `session/new` and `session/load` to point the agent at that
// endpoint and at a real working directory, and reports the directory back on
// the `session/new` result as `_meta.texlyre.cwd`. Everything else passes
// through untouched.
//
// Usage: node texlyre-acp-bridge.cjs <agent-command> [args...]
// Env:   TEXLYRE_ACP_WORKSPACE  agent working directory (default ./workspace)
'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createInterface } = require('node:readline');

const MCP_METHOD = '_texlyre/mcp';
const MCP_ID_PREFIX = 'texlyre-mcp:';
const MCP_SERVER_NAME = 'texlyre';
const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MCP_TIMEOUT_MS = 5 * 60 * 1000;

const log = (...parts) => console.error('[texlyre-acp-bridge]', ...parts);

const [command, ...commandArgs] = process.argv.slice(2);
if (!command) {
	log('usage: texlyre-acp-bridge.cjs <agent-command> [args...]');
	process.exit(2);
}

const workspace = path.resolve(
	process.env.TEXLYRE_ACP_WORKSPACE || 'workspace',
);
fs.mkdirSync(workspace, { recursive: true });

const token = crypto.randomBytes(32).toString('hex');
const expectedAuth = Buffer.from(`Bearer ${token}`);

const pendingMcp = new Map();
const pendingSessionNew = new Set();
let nextMcpId = 1;
let mcpUrl = '';

const parse = (line) => {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
};

const toClient = (message) => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

// --- MCP over HTTP ---------------------------------------------------------

const tunnel = (message) =>
	new Promise((resolve, reject) => {
		const id = `${MCP_ID_PREFIX}${nextMcpId++}`;
		const timer = setTimeout(() => {
			pendingMcp.delete(id);
			reject(new Error('TeXlyre did not answer in time'));
		}, MCP_TIMEOUT_MS);
		pendingMcp.set(id, { resolve, reject, timer });
		toClient({ jsonrpc: '2.0', id, method: MCP_METHOD, params: { message } });
	});

const settleMcp = (message) => {
	const pending = pendingMcp.get(message.id);
	if (!pending) return;
	pendingMcp.delete(message.id);
	clearTimeout(pending.timer);
	if (message.error) pending.reject(new Error(message.error.message));
	else pending.resolve(message.result?.message ?? null);
};

const reply = (res, status, body, headers = {}) => {
	res.writeHead(status, {
		...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		...headers,
	});
	res.end(body === undefined ? undefined : JSON.stringify(body));
};

const isAuthorized = (req) => {
	const given = Buffer.from(req.headers.authorization || '');
	return (
		given.length === expectedAuth.length &&
		crypto.timingSafeEqual(given, expectedAuth)
	);
};

const readBody = (req) =>
	new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(Object.assign(new Error('body too large'), { status: 413 }));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});

const handleHttp = async (req, res, port) => {
	const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
	// Refuse DNS-rebinding and any browser-originated request outright.
	if (!allowedHosts.includes(req.headers.host) || req.headers.origin) {
		return reply(res, 403);
	}
	if (new URL(req.url, 'http://localhost').pathname !== MCP_PATH) {
		return reply(res, 404);
	}
	if (!isAuthorized(req)) return reply(res, 401);
	if (req.method !== 'POST') return reply(res, 405, undefined, { Allow: 'POST' });

	let message;
	try {
		message = JSON.parse(await readBody(req));
	} catch (error) {
		if (error.status === 413) return reply(res, 413);
		return reply(res, 400, {
			jsonrpc: '2.0',
			id: null,
			error: { code: -32700, message: 'Parse error' },
		});
	}

	if (!message || typeof message !== 'object' || Array.isArray(message)) {
		return reply(res, 400, {
			jsonrpc: '2.0',
			id: null,
			error: { code: -32600, message: 'Batches are not supported' },
		});
	}
	// Notifications and client responses need no answer from TeXlyre.
	if (!message.method || message.id === undefined) return reply(res, 202);

	try {
		const response = await tunnel(message);
		if (!response) return reply(res, 202);
		return reply(res, 200, response);
	} catch (error) {
		return reply(res, 200, {
			jsonrpc: '2.0',
			id: message.id,
			error: { code: -32603, message: error.message },
		});
	}
};

// --- ACP stream rewriting --------------------------------------------------

const mcpServerEntry = () => ({
	type: 'http',
	name: MCP_SERVER_NAME,
	url: mcpUrl,
	headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
});

const fromClient = (line, agent) => {
	const message = parse(line);

	if (
		message &&
		!message.method &&
		typeof message.id === 'string' &&
		message.id.startsWith(MCP_ID_PREFIX)
	) {
		settleMcp(message);
		return;
	}

	if (
		message?.params &&
		(message.method === 'session/new' || message.method === 'session/load')
	) {
		const servers = Array.isArray(message.params.mcpServers)
			? message.params.mcpServers.filter(
					(server) => server?.name !== MCP_SERVER_NAME,
				)
			: [];
		message.params.cwd = workspace;
		message.params.mcpServers = [...servers, mcpServerEntry()];
		if (message.method === 'session/new' && message.id !== undefined) {
			pendingSessionNew.add(message.id);
		}
		agent.stdin.write(`${JSON.stringify(message)}\n`);
		return;
	}

	agent.stdin.write(`${line}\n`);
};

const fromAgent = (line) => {
	const message = parse(line);

	if (
		message &&
		!message.method &&
		pendingSessionNew.has(message.id) &&
		message.result
	) {
		pendingSessionNew.delete(message.id);
		const meta = message.result._meta || {};
		message.result._meta = {
			...meta,
			texlyre: { ...(meta.texlyre || {}), cwd: workspace },
		};
		toClient(message);
		return;
	}
	if (message && !message.method) pendingSessionNew.delete(message.id);

	process.stdout.write(`${line}\n`);
};

// --- lifecycle -------------------------------------------------------------

const main = async () => {
	const server = http.createServer((req, res) => {
		handleHttp(req, res, server.address().port).catch((error) => {
			log('request failed:', error.message);
			if (!res.headersSent) reply(res, 500);
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	mcpUrl = `http://127.0.0.1:${server.address().port}${MCP_PATH}`;

	const agent = spawn(command, commandArgs, {
		cwd: workspace,
		stdio: ['pipe', 'pipe', 'inherit'],
		shell: process.platform === 'win32',
	});

	const shutdown = (code) => {
		server.close();
		for (const pending of pendingMcp.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error('Bridge shutting down'));
		}
		process.exit(code);
	};

	agent.on('error', (error) => {
		log(`could not start ${command}:`, error.message);
		shutdown(1);
	});
	agent.on('exit', (code, signal) => {
		log(`agent exited (${signal || code})`);
		shutdown(code ?? 1);
	});
	agent.stdin.on('error', (error) => log('agent stdin:', error.message));
	// The proxy closes our stdout when TeXlyre disconnects; stop the agent
	// instead of crashing on the next write.
	process.stdout.on('error', (error) => {
		if (error.code !== 'EPIPE') log('stdout:', error.message);
		agent.kill();
	});

	createInterface({ input: agent.stdout, crlfDelay: Infinity }).on(
		'line',
		fromAgent,
	);

	const client = createInterface({ input: process.stdin, crlfDelay: Infinity });
	client.on('line', (line) => {
		if (line.trim()) fromClient(line, agent);
	});
	client.on('close', () => {
		agent.stdin.end();
		setTimeout(() => agent.kill(), 3000).unref();
	});

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => agent.kill(signal));
	}

	log(`agent ${command} in ${workspace}; MCP on ${mcpUrl}`);
};

main().catch((error) => {
	log(error.stack || error.message);
	process.exit(1);
});
