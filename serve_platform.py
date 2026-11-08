"""Serve the complete reader platform on an available local port."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading,webbrowser
def main():
    handler=partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parent))
    server=ThreadingHTTPServer(("127.0.0.1",0),handler)
    address=f"http://127.0.0.1:{server.server_address[1]}/index.html"
    print("OHP reader platform:",address,flush=True)
    print("Keep this window open while using the platform. Press Ctrl+C to stop.",flush=True)
    threading.Timer(.7,lambda:webbrowser.open(address)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=="__main__":main()
