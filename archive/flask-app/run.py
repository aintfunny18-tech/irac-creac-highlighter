"""
Entry point for the Legal Writing Structure Coach.

Scans ports 5050-5060 for an available port, starts the Flask server,
and opens the user's default browser automatically.
"""

import socket
import sys
import threading
import webbrowser

# ---------------------------------------------------------------------------
# Port detection
# ---------------------------------------------------------------------------
def find_free_port(start: int = 5050, end: int = 5060) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    print(
        f"ERROR: Could not find an available port in range {start}-{end}. "
        "Please free up a port and try again.",
        file=sys.stderr,
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = find_free_port()
    url = f'http://localhost:{port}'

    print(f"Starting Legal Writing Structure Coach on {url}")
    print("Press Ctrl+C to stop.\n")

    # Open browser after a short delay so Flask has time to start
    threading.Timer(1.5, webbrowser.open, args=[url]).start()

    from app import app
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)
