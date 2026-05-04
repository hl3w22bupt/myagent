#!/usr/bin/env node

/**
 * Web Terminal Server (macOS PTY via `script` command + Node.js native)
 *
 * Routes:
 *   GET /terminal?taskId=<taskId>&workspace=<path> — WebSocket endpoint for terminal connection
 *   GET /health                                      — health check
 *   GET /static/*                                    — static files (xterm.css)
 *
 * Port: 3011 (configurable via TERMINAL_PORT env var)
 *
 * Security:
 *   - Validates workspace paths against whitelist
 *   - 30-minute inactivity timeout
 *   - Max 10 concurrent sessions
 */

const http = require('http');
const { join, normalize, basename } = require('path');
const { existsSync, readFileSync } = require('fs');
const { homedir } = require('os');
const { spawn } = require('child_process');

// Try to load ws
let WebSocketServer;
try {
  WebSocketServer = require('ws').Server;
} catch (e) {
  console.error('❌ ws not installed. Run: npm install ws');
  process.exit(1);
}

const PORT = process.env.TERMINAL_PORT || 3011;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 10;

// Active sessions: { taskId: { child, ws, lastActivity } }
const sessions = new Map();

// MIME types
const mimeTypes = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Validate workspace path (reuse from workspace-api.step.ts)
 */
function validatePath(workspace) {
  const expanded = workspace.startsWith('~/')
    ? join(homedir(), workspace.slice(2))
    : workspace === '~' ? homedir() : workspace;

  const allowedPrefixes = [
    '/tmp/myagent-workspace',
    '/tmp/',
    '/Users/leo/workspace',
    join(homedir(), '.myrd'),
    join(homedir(), '.mrd'),
  ];

  const normalized = normalize(expanded);
  return allowedPrefixes.some(prefix => normalized.startsWith(prefix));
}

/**
 * Get task info from query parameters
 */
async function getTaskWorkspace(taskId, workspaceFromQuery) {
  const workspace = workspaceFromQuery || `/tmp/myagent-workspace/${taskId}`;
  return { workspace, exists: existsSync(workspace) };
}

/**
 * Create PTY process using Python's pty module
 * (Reliable cross-platform approach that works with piped stdin)
 */
function createPtyProcess(workspace, taskId) {
  const shell = process.env.SHELL || '/bin/zsh';

  // Set up environment
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    SHELL: shell,
    TASK_ID: taskId,
    PS1: '%F{cyan}myagent%f:%F{blue}%1~%f$ ',
  };

  // Clean up some problematic env vars
  delete env.NODE_OPTIONS;

  // Ensure workspace exists
  if (!existsSync(workspace)) {
    require('fs').mkdirSync(workspace, { recursive: true });
  }

  // Python PTY helper script
  // Creates a real pseudo-terminal using pty.fork() and relays data
  const pythonScript = `
import pty, os, signal, sys, select, errno

def main():
    shell = os.environ.get('SHELL', '/bin/zsh')

    pid, fd = pty.fork()
    if pid == 0:
        # Child process: run the shell in the PTY
        os.execvp(shell, [shell])
    else:
        # Parent process: relay between PTY and stdin/stdout
        try:
            while True:
                r, _, _ = select.select([sys.stdin, fd], [], [])
                if fd in r:
                    try:
                        data = os.read(fd, 4096)
                    except OSError as e:
                        if e.errno == errno.EIO:
                            break
                        raise
                    if not data:
                        break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                if sys.stdin in r:
                    try:
                        data = os.read(sys.stdin.fileno(), 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    os.write(fd, data)
        except (EOFError, KeyboardInterrupt):
            pass
        finally:
            os.close(fd)
            os.waitpid(pid, 0)

if __name__ == '__main__':
    main()
`;

  // Try python3 first, fall back to python
  const python = 'python3';

  const child = spawn(python, ['-c', pythonScript.trim()], {
    cwd: workspace,
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return child;
}

/**
 * Clean up a session
 */
function cleanupSession(taskId) {
  const session = sessions.get(taskId);
  if (session) {
    try {
      session.child.stdin.end();
      session.child.kill('SIGTERM');
      setTimeout(() => {
        try { session.child.kill('SIGKILL'); } catch (e) {}
      }, 2000);
    } catch (e) {}
    try {
      session.ws.close();
    } catch (e) {}
    sessions.delete(taskId);
    console.log(`🧹 Cleaned up terminal session for task: ${taskId}`);
  }
}

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // Health check
    if (pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        port: PORT,
        service: 'terminal-server',
        activeSessions: sessions.size,
        maxSessions: MAX_SESSIONS,
      });
      return;
    }

    // Static files (xterm.css)
    if (pathname.startsWith('/static/')) {
      const filePath = pathname.replace(/^\/static\//, '');

      if (filePath === 'xterm.css') {
        const xtermCssPath = join(__dirname, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css');
        if (existsSync(xtermCssPath)) {
          const content = readFileSync(xtermCssPath, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/css',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(content);
          return;
        }
      }

      sendJson(res, 404, { error: 'Static file not found' });
      return;
    }

    // List sessions (admin)
    if (pathname === '/sessions') {
      sendJson(res, 200, {
        sessions: Array.from(sessions.keys()).map(taskId => ({
          taskId,
          lastActivity: sessions.get(taskId)?.lastActivity,
        })),
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

/**
 * WebSocket server
 */
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (ws, request) => {
  try {
    const parsedUrl = new URL(request.url, `http://localhost:${PORT}`);
    const taskId = parsedUrl.searchParams.get('taskId');
    const workspaceFromQuery = parsedUrl.searchParams.get('workspace');

    if (!taskId) {
      ws.close(4000, 'Missing taskId parameter');
      return;
    }

    // Check max sessions
    if (sessions.size >= MAX_SESSIONS) {
      ws.close(4001, 'Maximum sessions reached. Please try again later.');
      return;
    }

    // Get workspace
    const { workspace } = await getTaskWorkspace(taskId, workspaceFromQuery);

    // Validate path
    if (!validatePath(workspace)) {
      ws.close(4003, 'Invalid workspace path');
      return;
    }

    console.log(`🖥️  New terminal session for task: ${taskId}`);
    console.log(`   Workspace: ${workspace}`);

    // Create PTY-like process
    const child = createPtyProcess(workspace, taskId);

    // Store session
    const session = {
      child,
      ws,
      lastActivity: Date.now(),
      termBuffer: '',
    };
    sessions.set(taskId, session);

    // Pipe child stdout/stderr to WebSocket
    const pipeOutput = (data) => {
      session.lastActivity = Date.now();
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          ws.send(data.toString());
        } catch (e) {
          console.error('WebSocket send error:', e);
        }
      }
    };

    child.stdout.on('data', pipeOutput);
    child.stderr.on('data', pipeOutput);

    // Child process exit
    child.on('exit', (code, signal) => {
      console.log(`🖥️  Process exited for task ${taskId}: code=${code}, signal=${signal}`);
      cleanupSession(taskId);
    });

    child.on('error', (err) => {
      console.error(`🖥️  Process error for task ${taskId}:`, err.message);
      try {
        ws.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
      } catch (e) {}
      cleanupSession(taskId);
    });

    // WebSocket message (input from frontend)
    ws.on('message', (message) => {
      session.lastActivity = Date.now();
      try {
        const str = message.toString();
        const data = JSON.parse(str);

        if (data.type === 'input') {
          child.stdin.write(data.data);
        } else if (data.type === 'resize') {
          // `script` doesn't support dynamic resize, silently ignore
        } else if (data.type === 'ping') {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        }
      } catch (e) {
        // Not JSON - treat as raw input
        if (child.stdin.writable) {
          child.stdin.write(message.toString());
        }
      }
    });

    // WebSocket close
    ws.on('close', () => {
      console.log(`🖥️  WebSocket closed for task: ${taskId}`);
      cleanupSession(taskId);
    });

    // WebSocket error
    ws.on('error', (err) => {
      console.error(`🖥️  WebSocket error for task ${taskId}:`, err);
      cleanupSession(taskId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      taskId,
      workspace,
    }));

  } catch (err) {
    console.error('WebSocket connection error:', err);
    try {
      ws.close(5000, 'Internal server error');
    } catch (e) {}
  }
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Clean up idle sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [taskId, session] of sessions.entries()) {
    if (now - session.lastActivity > IDLE_TIMEOUT) {
      console.log(`🖥️  Session timeout for task: ${taskId}`);
      try {
        session.ws.close(4002, 'Session timeout - 30 minutes of inactivity');
      } catch (e) {}
      cleanupSession(taskId);
    }
  }
}, 60 * 1000);

// Clean up all sessions on exit
process.on('SIGINT', () => {
  console.log('\n🖥️  Shutting down terminal server...');
  for (const taskId of sessions.keys()) {
    cleanupSession(taskId);
  }
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`\n🖥️  Terminal server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}/terminal?taskId=<taskId>&workspace=<path>`);
  console.log(`   Active sessions: ${sessions.size}/${MAX_SESSIONS}`);
  console.log(`   Idle timeout: ${IDLE_TIMEOUT / 60 / 1000} minutes\n`);
});
