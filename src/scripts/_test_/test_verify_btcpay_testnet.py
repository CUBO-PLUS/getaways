import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "verify-btcpay-testnet.sh"
COMPOSE = {
    "services": {
        "bitcoind": {"environment": {"BITCOIN_NETWORK": "testnet", "BITCOIN_EXTRA_ARGS": "-prune=5000"}},
        "nbxplorer": {"environment": {"NBXPLORER_BTCRPCURL": "http://bitcoind:43782/"}},
        "btcpay": {"ports": [{"host_ip": "127.0.0.1", "published": "PORT"}], "environment": {"BTCPAY_BTCEXPLORERURL": "http://nbxplorer:32838/"}},
        "postgres": {"volumes": [{"target": "/var/lib/postgresql"}]},
    },
    "volumes": {name: {} for name in ("a", "b", "c", "d", "e")},
}


class VerifyBtcpayTestnet(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.log = self.root / "calls.jsonl"
        self.state = self.root / "exec-count"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
a = sys.argv[1:]
with open(os.environ["DOCKER_LOG"], "a") as f: f.write(json.dumps(a) + "\\n")
mode = os.environ.get("DOCKER_MODE", "clean")
if len(a) >= 9 and a[:6] == ["compose", "-p", os.environ["BTCPAY_VERIFY_PROJECT"], "-f", a[4], "--profile"] and a[6:9] == ["btcpay", "config", "--format"]:
    config = json.loads(os.environ["COMPOSE_JSON"])
    config["services"]["btcpay"]["ports"][0]["published"] = os.environ["BTCPAY_PORT"]
    print(json.dumps(config))
elif a[:2] == ["ps", "--filter"]:
    print("foreign-container" if mode == "port-collision" else "existing-container" if mode == "reuse" else "")
elif a[:2] == ["inspect", "foreign-container"]:
    print(json.dumps([{"Config":{"Labels":{"com.docker.compose.project":"other-project","com.docker.compose.service":"web"}}}]))
elif a[:2] == ["inspect", "existing-container"]:
    print(json.dumps([{"Config":{"Labels":{"com.docker.compose.project":os.environ["BTCPAY_VERIFY_PROJECT"],"com.docker.compose.service":"btcpay"}}}]))
elif a[:3] == ["network", "ls", "-q"]:
    print("foreign-network" if mode == "subnet-collision" else "existing-network" if mode == "reuse" else "")
elif a[:2] == ["network", "inspect"]:
    name = os.environ["BTCPAY_VERIFY_PROJECT"] + "_btcpay" if mode == "reuse" else "foreign"
    print(json.dumps([{"Name":name,"IPAM":{"Config":[{"Subnet":"172.31.0.0/24"}]}}]))
elif a[0] == "compose" and a[-1:] == ["up"]:
    print("unexpected invocation")
elif a[0] == "compose" and "up" in a:
    pass
elif a[0] == "compose" and a[-2:] == ["-q", "bitcoind"]:
    print("core-container")
elif a[:2] == ["exec", "core-container"]:
    count = int(pathlib.Path(os.environ["EXEC_COUNT"]).read_text() or "0") if pathlib.Path(os.environ["EXEC_COUNT"]).exists() else 0
    pathlib.Path(os.environ["EXEC_COUNT"]).write_text(str(count + 1))
    if count == 0: sys.exit(1)
    print(json.dumps({"chain":"test", "pruned":True, "prune_target_size":5242880000, "blocks":1, "headers":1, "pruneheight":0, "initialblockdownload":True}))
elif a[0] == "run":
    pass
else:
    print("unhandled docker call: " + repr(a), file=sys.stderr); sys.exit(9)
''')
        docker.chmod(0o755)

    def run_verifier(self, mode="clean", project="selected-btcpay", port=None):
        start_server = port is None
        if port is None:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]

        class Redirect(http.server.BaseHTTPRequestHandler):
            def do_GET(inner):
                inner.send_response(302)
                inner.end_headers()

            def log_message(inner, *_args):
                pass

        if start_server:
            server = http.server.HTTPServer(("127.0.0.1", port), Redirect)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(thread.join, 2)
            self.addCleanup(server.shutdown)
        config = dict(COMPOSE)
        env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "DOCKER_LOG": str(self.log),
            "EXEC_COUNT": str(self.state),
            "DOCKER_MODE": mode,
            "COMPOSE_JSON": json.dumps(config),
            "BTCPAY_VERIFY_PROJECT": project,
            "BTCPAY_PORT": str(port),
        }
        return subprocess.run(["sh", str(SCRIPT)], env=env, text=True, capture_output=True, timeout=20), port

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_reuses_selected_project_and_retries_core_rpc_until_ready(self):
        result, _ = self.run_verifier(mode="reuse")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        ups = [call for call in calls if call[0] == "compose" and "up" in call]
        self.assertEqual(len(ups), 1)
        self.assertTrue(all(call[2] == "selected-btcpay" for call in ups))
        compose_calls = [call for call in calls if call[0] == "compose"]
        self.assertTrue(all(call[2] == "selected-btcpay" for call in compose_calls))
        self.assertEqual(sum(call[:2] == ["exec", "core-container"] for call in calls), 2)

    def test_rejects_foreign_port_and_subnet_collisions_before_compose_up(self):
        for mode in ("port-collision", "subnet-collision"):
            with self.subTest(mode=mode):
                self.log.unlink(missing_ok=True)
                result, _ = self.run_verifier(mode=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call[0] == "compose" and "up" in call for call in self.calls()))


if __name__ == "__main__":
    unittest.main()
