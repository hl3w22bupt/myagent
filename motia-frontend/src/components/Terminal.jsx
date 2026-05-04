import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { RotateCcw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const TERMINAL_PORT = import.meta.env.VITE_TERMINAL_PORT || 3011;

export function TerminalModal({ taskId, workspace, isOpen, onClose }) {
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const connect = useCallback(() => {
    if (!taskId || !isOpen) return;

    setStatus('connecting');
    setErrorMessage('');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ taskId });
    if (workspace) params.set('workspace', workspace);
    const wsUrl = `${protocol}//localhost:${TERMINAL_PORT}/terminal?${params.toString()}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🖥️ Terminal connected');
        setStatus('connected');
        setIsConnected(true);
        terminalInstanceRef.current?.focus();
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pong') return;
            if (msg.type === 'connected') return;
          } catch (e) {
            // Not JSON - treat as terminal output
          }
        }
        terminalInstanceRef.current?.write(event.data);
      };

      ws.onclose = (event) => {
        console.log('🖥️ Terminal disconnected:', event.code, event.reason);
        setIsConnected(false);
        setStatus('closed');
        if (event.reason) {
          setErrorMessage(event.reason);
        }
        terminalInstanceRef.current?.writeln('\r\n\x1b[31m✗ Disconnected\x1b[0m');
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMessage('Connection failed');
      };
    } catch (e) {
      setStatus('error');
      setErrorMessage(e.message);
    }
  }, [taskId, isOpen, workspace]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => connect(), 500);
  }, [connect, disconnect]);

  // Initialize terminal
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;
    if (terminalInstanceRef.current) return; // Already initialized

    const theme = {
      background: '#1a1a2e',
      foreground: '#eaeaea',
      cursor: '#00ff88',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(0, 255, 136, 0.3)',
      black: '#000000',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#bfbfbf',
      brightBlack: '#4d4d4d',
      brightRed: '#ff6e67',
      brightGreen: '#5af78e',
      brightYellow: '#f4f99d',
      brightBlue: '#caa9fa',
      brightMagenta: '#ff92d0',
      brightCyan: '#9aedfe',
      brightWhite: '#e6e6e6',
    };

    const terminal = new Terminal({
      theme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      scrollback: 10000,
      cols: 100,
      rows: 30,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    fitAddonRef.current = fitAddon;
    terminalInstanceRef.current = terminal;

    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Terminal input → WebSocket
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Terminal resize
    terminal.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Welcome message
    terminal.writeln('\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m');
    terminal.writeln('\x1b[36m║\x1b[0m           \x1b[1;37mMyAgent Web Terminal\x1b[0m                   \x1b[36m║\x1b[0m');
    terminal.writeln('\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m');
    terminal.writeln('');
    terminal.writeln(`  Task: \x1b[33m${taskId}\x1b[0m`);
    if (workspace) {
      terminal.writeln(`  Workspace: \x1b[33m${workspace}\x1b[0m`);
    }
    terminal.writeln('');

    connect();

    // Window resize → fit terminal
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Click → focus terminal
    const container = terminalContainerRef.current;
    const focusTerminal = () => terminal.focus();
    container?.addEventListener('click', focusTerminal);

    setTimeout(() => terminal.focus(), 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      container?.removeEventListener('click', focusTerminal);
      disconnect();
      terminal.dispose();
      terminalInstanceRef.current = null;
    };
  }, [isOpen]); // only on open/close

  // Re-fit on content changes
  useEffect(() => {
    if (!fitAddonRef.current) return;
    const t = setTimeout(() => fitAddonRef.current.fit(), 50);
    return () => clearTimeout(t);
  }, [workspace]);

  // Connection status effect for the top bar
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(''), 5000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  if (!isOpen) return null;

  const modalClass = 'fixed inset-4 z-50 rounded-lg shadow-2xl flex flex-col overflow-hidden';

  const statusColor = isConnected ? 'bg-green-500'
    : status === 'connecting' ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <div className={modalClass} style={{ background: '#1a1a2e' }}>
      {/* Top status line (2px) */}
      <div className={`h-0.5 flex-shrink-0 transition-colors duration-300 ${statusColor}`} />

      {/* Terminal */}
      <div ref={terminalContainerRef} className="flex-1 relative overflow-hidden">
        <div ref={terminalRef} className="absolute inset-0" />

        {/* Controls — reconnect button only */}
        <div className="absolute top-1 right-1 z-10 flex items-center gap-px">
          {!isConnected && status !== 'connecting' && (
            <button onClick={reconnect} title="Reconnect"
              className="w-4 h-4 inline-flex items-center justify-center rounded hover:bg-white/10 text-gray-500">
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Error toast */}
        {errorMessage && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded bg-red-900/80 border border-red-700 shadow-lg">
            <span className="text-red-200 text-xs whitespace-nowrap">{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TerminalModal;
