# WSL2 to Windows: why mirrored mode is needed

Applies only if the agent runs on **WSL2** and Chrome runs on **Windows** (the
most common case when using Claude Code from WSL against the host's native
Chrome). If Chrome and the agent run on the same OS, none of this applies.

## The problem

Chrome opens the CDP port **only on Windows' `127.0.0.1`**:

1. Since Chrome 111, the `--remote-debugging-address` flag is **ignored**.
   Even if you pass `0.0.0.0`, `Get-NetTCPConnection` still shows
   `LocalAddress 127.0.0.1`. There is no way to expose it on another
   interface via flags.
2. In WSL2's **default networking mode (NAT)**, Linux's `127.0.0.1` is a
   different network namespace from Windows'. The tools in `scripts/` run on
   Linux and talk to `127.0.0.1:9222`, which under NAT is **not** the same
   host as the Chrome running on Windows.

The Windows firewall is usually **not** the problem (you can confirm this
with a loose TCP listener on another port: inbound traffic from the WSL vNIC
gets through fine).

## The fix: mirrored mode

Put WSL2 and Windows on the **same network** with mirrored mode, in
`C:\Users\<user>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true

[experimental]
hostAddressLoopback=true
```

**Gotcha:** `hostAddressLoopback` goes under `[experimental]`. If you put it
under `[wsl2]`, WSL warns `Unknown key 'wsl2.hostAddressLoopback'`, it is just
a warning, ignore that line and the rest still applies (it does not block
mirrored mode).

It only takes effect after `wsl --shutdown` (shuts down all of WSL and kills
the agent's session). Requires **Windows 11 22H2** or later.

### Checking which mode you are in

```bash
ip route | grep default
```
- Gateway `172.x.x.1` (or similar, a WSL private network) means you are still
  in **NAT**, the shutdown was not applied or mirrored mode is not supported.
- Gateway equal to your real router's address (e.g. `192.168.1.1`) means
  **mirrored mode is active**. From here on, `127.0.0.1:9222` from Linux
  reaches Windows' Chrome without touching anything in the project.

With mirrored mode active, `curl http://127.0.0.1:9222/json/version` from
WSL should return the browser's JSON.

## `CDP_HOST`

The scripts support `CDP_HOST=host:port` to point at another destination,
but it is **not enough on its own** under NAT: the `/json` endpoints return
`webSocketDebuggerUrl` with `127.0.0.1` **embedded inside the JSON**, and
that host is used as-is when opening the WebSocket, rewriting only the
initial HTTP request's host does not fix the WebSocket. That is why mirrored
mode is the correct fix, not an environment variable.

## Alternative considered and dropped

A TCP bridge on Windows was evaluated (relaying the WSL vNIC to
`127.0.0.1:9222`) to avoid `wsl --shutdown`. It was dropped because it would
have required patching the `webSocketDebuggerUrl` values returned by the
scripts (the same embedded-host problem above), and mirrored mode solves this
without touching any script.

## Known caveat

Mirrored mode **can conflict with corporate VPNs** (some reconfigure routing
in a way that breaks the mirror). If your machine uses a corporate VPN, check
`ip route` after connecting to it.
