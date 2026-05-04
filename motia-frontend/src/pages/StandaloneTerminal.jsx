import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const TERMINAL_PORT = import.meta.env.VITE_TERMINAL_PORT || 3011

export default function StandaloneTerminal() {
  const pathParts = window.location.pathname.split('/')
  const taskId = pathParts[pathParts.length - 1]
  const params = new URLSearchParams(window.location.search)
  const workspace = params.get('workspace') || ''
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)

  useEffect(() => {
    document.title = `Terminal - ${taskId}`

    // Force body/html to fill viewport
    document.documentElement.style.margin = '0'
    document.documentElement.style.height = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.margin = '0'
    document.body.style.height = '100%'
    document.body.style.overflow = 'hidden'
    document.body.style.background = '#1a1a2e'

    if (!taskId || !terminalRef.current) return

    const theme = {
      background: '#1a1a2e',
      foreground: '#eaeaea',
      cursor: '#00ff88',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(0, 255, 136, 0.3)',
      black: '#000000', red: '#ff5555', green: '#50fa7b',
      yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6',
      cyan: '#8be9fd', white: '#bfbfbf',
      brightBlack: '#4d4d4d', brightRed: '#ff6e67',
      brightGreen: '#5af78e', brightYellow: '#f4f99d',
      brightBlue: '#caa9fa', brightMagenta: '#ff92d0',
      brightCyan: '#9aedfe', brightWhite: '#e6e6e6',
    }

    const terminal = new Terminal({
      theme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      scrollback: 10000,
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon
    terminal.open(terminalRef.current)
    fitAddon.fit()

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const qp = new URLSearchParams({ taskId })
    if (workspace) qp.set('workspace', workspace)
    const wsUrl = `${protocol}//localhost:${TERMINAL_PORT}/terminal?${qp.toString()}`

    const ws = new WebSocket(wsUrl)
    ws.onopen = () => terminal.focus()
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'pong' || msg.type === 'connected') return
        } catch (e) {}
      }
      terminal.write(event.data)
    }

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    terminal.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)
    terminalRef.current.addEventListener('click', () => terminal.focus())
    setTimeout(() => terminal.focus(), 300)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      terminal.dispose()
      document.body.style.background = ''
    }
  }, [taskId, workspace])

  // Re-fit after mount
  useEffect(() => {
    if (!fitAddonRef.current) return
    const t = setTimeout(() => fitAddonRef.current.fit(), 200)
    const t2 = setTimeout(() => fitAddonRef.current.fit(), 500)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [])

  return (
    <div
      ref={terminalRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#1a1a2e',
      }}
    />
  )
}
