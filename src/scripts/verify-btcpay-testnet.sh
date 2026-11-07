#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project=${BTCPAY_VERIFY_PROJECT:-${BTCPAY_COMPOSE_PROJECT:-gateways-btcpay-testnet}}
port=${BTCPAY_PORT:-3002}
case "$project" in
  ''|*[!a-zA-Z0-9_-]*) printf '%s\n' "Invalid Compose project name: $project" >&2; exit 2 ;;
esac
case "$port" in
  ''|*[!0-9]*) printf '%s\n' "BTCPAY_PORT must be a numeric host port" >&2; exit 2 ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  printf '%s\n' "BTCPAY_PORT must be between 1 and 65535" >&2
  exit 2
fi

docker compose -p "$project" -f "$root/compose.btcpay.testnet.yaml" --profile btcpay config --format json |
  python3 -c 'import json,sys; c=json.load(sys.stdin); s=c["services"]; assert set(s)=={"bitcoind","nbxplorer","btcpay","postgres"}; assert len(c["volumes"])==5; assert s["btcpay"]["ports"][0]["host_ip"]=="127.0.0.1"; assert s["btcpay"]["ports"][0]["published"]==sys.argv[1]; assert all(not x.get("ports") for n,x in s.items() if n!="btcpay"); assert s["bitcoind"]["environment"]["BITCOIN_NETWORK"]=="testnet"; assert "prune=5000" in s["bitcoind"]["environment"]["BITCOIN_EXTRA_ARGS"]; assert s["nbxplorer"]["environment"]["NBXPLORER_BTCRPCURL"]=="http://bitcoind:43782/"; assert s["btcpay"]["environment"]["BTCPAY_BTCEXPLORERURL"]=="http://nbxplorer:32838/"; assert s["postgres"]["volumes"][0]["target"]=="/var/lib/postgresql"; print("Compose: PASS services=4 volumes=5 loopback="+sys.argv[1]+" RPC/internal ports unpublished network=testnet pruning=5000 postgres-mount=/var/lib/postgresql")' "$port"

# Detect host-port and fixed-subnet collisions before Compose can create anything.
python3 - "$project" "$port" <<'PY'
import ipaddress, json, subprocess, sys
project, port = sys.argv[1:]
def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()

for container_id in docker("ps", "--filter", f"publish={port}", "--format", "{{.ID}}").splitlines():
    item = json.loads(docker("inspect", container_id))[0]
    labels = item.get("Config", {}).get("Labels", {})
    if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != "btcpay":
        raise SystemExit(f"Port {port} is already published by container {container_id} outside selected project/service {project}/btcpay; refusing before compose up.")

expected_network = f"{project}_btcpay"
target = ipaddress.ip_network("172.31.0.0/24")
network_ids = docker("network", "ls", "-q").splitlines()
if network_ids:
    for network in json.loads(docker("network", "inspect", *network_ids)):
        name = network.get("Name", "")
        for config in network.get("IPAM", {}).get("Config", []):
            subnet = config.get("Subnet")
            if not subnet or not ipaddress.ip_network(subnet, strict=False).overlaps(target):
                continue
            if name != expected_network or ipaddress.ip_network(subnet, strict=False) != target:
                raise SystemExit(f"Docker network {name!r} uses overlapping subnet {subnet}; selected project requires {expected_network} on {target}. Refusing before compose up.")
print(f"Collision check: PASS project={project} port={port} subnet={target}")
PY

docker compose -p "$project" -f "$root/compose.btcpay.testnet.yaml" --profile btcpay up -d

bitcoin_id=$(docker compose -p "$project" -f "$root/compose.btcpay.testnet.yaml" --profile btcpay ps -q bitcoind)
python3 - "$bitcoin_id" <<'PY'
import json, subprocess, sys, time
container_id = sys.argv[1]
if not container_id:
    raise SystemExit("Core container is not running in the selected Compose project")
last_error = None
for attempt in range(30):
    try:
        result = subprocess.run(["docker", "exec", container_id, "bitcoin-cli", "-datadir=/data", "getblockchaininfo"],
                                text=True, capture_output=True, timeout=5, check=True)
        info = json.loads(result.stdout)
        break
    except (subprocess.SubprocessError, ValueError) as error:
        last_error = error
        if attempt < 29:
            time.sleep(2)
else:
    raise SystemExit(f"Core RPC did not become ready after 30 bounded attempts: {last_error}")
print("Core: chain={chain} pruned={pruned} prune_target_size={prune_target_size} blocks={blocks} headers={headers} pruneheight={pruneheight} initialblockdownload={initialblockdownload}".format(**{k: info.get(k) for k in ("chain", "pruned", "prune_target_size", "blocks", "headers", "pruneheight", "initialblockdownload")}))
assert info["chain"] == "test", "unexpected Bitcoin chain"
assert info["pruned"] is True, "Core is not pruned"
assert info["prune_target_size"] == 5242880000, "unexpected prune target"
PY

# A disposable HTTP client joins only this generated project network. It reads
# NBXplorer's generated cookie without printing it; authentication stays on.
docker run --rm --network "${project}_btcpay" \
  -v "${project}_nbxplorer_datadir:/nbxplorer:ro" python:3.13-alpine \
  python -c 'import base64,json,pathlib,time,urllib.error,urllib.request; end=time.time()+90; p=None
while time.time()<end:
 try:
  p=next(pathlib.Path("/nbxplorer").rglob(".cookie")); auth=base64.b64encode(p.read_bytes().strip()).decode(); r=urllib.request.urlopen(urllib.request.Request("http://nbxplorer:32838/v1/cryptos/btc/status",headers={"Authorization":"Basic "+auth}),timeout=5); payload=json.load(r); status=payload.get("bitcoinStatus")
  if status is None: time.sleep(2); continue
  print("NBXplorer: HTTP 200 network={} blocks={} headers={} isSynched={}".format(payload["networkType"],status["blocks"],status["headers"],payload["isFullySynched"])); assert payload["networkType"] == "Testnet"; break
 except (StopIteration,urllib.error.URLError,TimeoutError): time.sleep(2)
else: raise SystemExit("NBXplorer API did not become reachable")'

python3 - "$port" <<'PY'
import sys, time, urllib.error, urllib.request
url = f"http://127.0.0.1:{sys.argv[1]}/"
for _ in range(45):
    try:
        response = urllib.request.urlopen(url, timeout=5)
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            print(f"BTCPay: HTTP {e.code} (redirect; service reachable)")
            break
        raise
    except urllib.error.URLError:
        time.sleep(2)
    else:
        print(f"BTCPay: HTTP {response.status}")
        assert 200 <= response.status < 300
        break
else:
    raise SystemExit("BTCPay HTTP did not become reachable")
PY

printf '%s\n' "Stack remains running in selected Compose project '$project'; stop only it with: docker compose -p $project -f $root/compose.btcpay.testnet.yaml --profile btcpay down"
