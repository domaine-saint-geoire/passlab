"""Serveur HTTPS local pour tester PassLab sur le téléphone (même Wi-Fi que le PC).

La caméra exige HTTPS : le script génère un certificat auto-signé (openssl de Git).
Sur le téléphone, le navigateur affichera un avertissement : « Avancé » > « Continuer ».
"""
import http.server, os, shutil, socket, ssl, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.join(ROOT, ".cert")
CERT, KEY = os.path.join(CERT_DIR, "cert.pem"), os.path.join(CERT_DIR, "key.pem")
PORT = 8443


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def find_openssl():
    for cand in (shutil.which("openssl"), r"C:\Program Files\Git\mingw64\bin\openssl.exe", r"C:\Program Files\Git\usr\bin\openssl.exe"):
        if cand and os.path.exists(cand):
            return cand
    sys.exit("openssl introuvable (installe Git for Windows).")


ip = lan_ip()
if not (os.path.exists(CERT) and os.path.exists(KEY)):
    os.makedirs(CERT_DIR, exist_ok=True)
    subprocess.run([
        find_openssl(), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
        "-keyout", KEY, "-out", CERT, "-subj", "/CN=passlab.local",
        "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost",
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

os.chdir(ROOT)
handler = http.server.SimpleHTTPRequestHandler
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"\n  PassLab disponible sur le téléphone : https://{ip}:{PORT}/\n  (Ctrl+C pour arrêter)\n")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
