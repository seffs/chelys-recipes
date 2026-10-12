# TeXlyre ACP bridge

Canonical source of `texlyre-acp-bridge.cjs`, the stdio bridge that ACP agent
recipes run between `websocat` and the agent. Recipes cannot reference files
outside their own version directory, so each agent recipe ships a copy in its
`extraFiles`; `npm run validate` fails when a copy differs from this one, and
`npm run sync:acp-bridge` refreshes every copy.

```
TeXlyre ⇄ WebSocket ⇄ websocat ⇄ stdio ⇄ texlyre-acp-bridge ⇄ stdio ⇄ agent
                                                 ⇅ HTTP (loopback MCP)
```

The bridge:

- starts the agent command it is given, in `./workspace` (or
  `TEXLYRE_ACP_WORKSPACE`), one process per connection;
- serves MCP over HTTP on a random loopback port, protected by a per-process
  bearer token, and refuses requests with a browser `Origin` or a non-loopback
  `Host`;
- tunnels each MCP request to TeXlyre over the ACP connection as a
  `_texlyre/mcp` request and returns TeXlyre's answer;
- rewrites `session/new` and `session/load` to add that MCP server and the real
  working directory, and reports the directory on the `session/new` result as
  `_meta.texlyre.cwd`.

Everything else passes through unchanged. It needs Node.js 18 or later and has
no dependencies.

## Usage in a recipe

```json
{
  "extraFiles": ["texlyre-acp-bridge.cjs"],
  "modes": [
    {
      "kind": "system",
      "runCommand": {
        "command": "websocat",
        "args": [
          "--text", "--exit-on-eof", "ws-l:127.0.0.1:${wsPort}",
          "exec:node", "--exec-args", "texlyre-acp-bridge.cjs", "<agent-command>"
        ]
      }
    }
  ]
}
```

`--exec-args` must stay last; everything after it is passed to `node`.
