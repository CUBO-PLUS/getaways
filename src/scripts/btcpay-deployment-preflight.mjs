#!/usr/bin/env node
import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";

const exec = promisify(execFile);
const TTL_MS = 10 * 60 * 1000;
const root = new URL("../", import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
  value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
const project = args.project ?? process.env.BTCPAY_COMPOSE_PROJECT ?? "gateways-btcpay-testnet";
const apiUrlValue = args["api-url"] ?? process.env.BTCPAY_API_URL;
const probeUrlValue = args["probe-url"] ?? (apiUrlValue && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(apiUrlValue) ? apiUrlValue : undefined);
const storeId = args["store-id"] ?? process.env.BTCPAY_STORE_ID;
const appProject = args["app-project"] ?? "gateways-dev";
const appService = args["app-service"] ?? "app";
const appNetwork = args["app-network"] ?? "gateways-dev_default";
const proofPath = resolve(args["proof-path"] ?? process.env.BTCPAY_DEPLOYMENT_PROOF_PATH ?? ".local/btcpay-deployment-proof.json");
const key = process.env.BTCPAY_DEPLOYMENT_PROOF_KEY;
const apiKey = process.env.BTCPAY_API_KEY;
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(project) || !apiUrlValue || !storeId || !key || !apiKey || !/^[a-f0-9]{64}$/i.test(key)) {
  throw new Error("Require valid project, BTCPAY_API_URL, BTCPAY_STORE_ID, BTCPAY_API_KEY and 32-byte hex BTCPAY_DEPLOYMENT_PROOF_KEY.");
}
const apiUrl = new URL(apiUrlValue);
const dockerMode = apiUrl.origin === "http://btcpay:49392";
const hostMode = /^https?:$/.test(apiUrl.protocol) && ["127.0.0.1", "localhost"].includes(apiUrl.hostname);
const remoteMode = apiUrl.protocol === "https:" && !isIP(apiUrl.hostname) && apiUrl.hostname.includes(".") &&
  apiUrl.hostname !== "localhost" && !apiUrl.hostname.endsWith(".localhost");
if ((!dockerMode && !hostMode && !remoteMode) || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash || apiUrl.pathname !== "/") {
  throw new Error("--api-url must be a loopback origin, exactly http://btcpay:49392, or a remote HTTPS hostname.");
}
if (remoteMode && probeUrlValue) throw new Error("Remote HTTPS mode does not use a separate --probe-url.");
const probeUrl = remoteMode ? apiUrl : new URL(probeUrlValue ?? "http://127.0.0.1:3002");
if (!remoteMode && (!/^https?:$/.test(probeUrl.protocol) || !["127.0.0.1", "localhost"].includes(probeUrl.hostname) ||
  probeUrl.username || probeUrl.password || probeUrl.search || probeUrl.hash || probeUrl.pathname !== "/" ||
  (hostMode && probeUrl.origin !== apiUrl.origin))) {
  throw new Error("--probe-url must be the independently inspected loopback API origin; host mode requires it to equal --api-url.");
}
const apiOrigin = probeUrl.origin;
const composeFile = resolve(root, "compose.btcpay.testnet.yaml");
const headers = { Authorization: `token ${apiKey}`, Accept: "application/json" };

async function get(path) {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers, redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!response.ok) {
    const permission = path.includes("/wallet/preview") && response.status === 403
      ? " Require btcpay.store.canviewwallet scoped to this store (read-only; no spending permissions)." : "";
    throw new Error(`BTCPay preflight HTTP ${response.status}.${permission}`);
  }
  return response.json();
}

async function writeProof(payload) {
  const signature = createHmac("sha256", Buffer.from(key, "hex")).update(JSON.stringify(payload)).digest("hex");
  await mkdir(dirname(proofPath), { recursive: true, mode: 0o700 });
  const tempPath = `${proofPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, `${JSON.stringify({ ...payload, signature }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await chmod(tempPath, 0o600);
  await rename(tempPath, proofPath);
  console.log(`BTCPay deployment verified; private proof written to ${proofPath} (expires in 10 minutes).`);
}

function requireReady(info, methods) {
  if (info.version !== "2.4.7" || info.fullySynched !== true || !info.supportedPaymentMethods?.includes("BTC-CHAIN") ||
    !info.syncStatus?.some((status) => status.paymentMethodId === "BTC-CHAIN" && status.available === true)) {
    throw new Error("BTCPay version, overall sync, or BTC-CHAIN sync is not verified.");
  }
  if (!Array.isArray(methods) || !methods.some((method) => method.paymentMethodId === "BTC-CHAIN" && method.enabled === true)) {
    throw new Error("Configured store does not have enabled BTC-CHAIN.");
  }
}

async function run(...command) {
  return (await exec(command[0], command.slice(1), { maxBuffer: 1024 * 1024 })).stdout.trim();
}
async function serviceId(service) {
  const id = await run("docker", "compose", "-p", project, "-f", composeFile, "--profile", "btcpay", "ps", "-q", service);
  if (!id) throw new Error(`Required Compose service is not running: ${service}`);
  return id;
}
async function inspect(id, service, expectedImage) {
  const [item] = JSON.parse(await run("docker", "inspect", id));
  const labels = item?.Config?.Labels ?? {};
  if (!item?.State?.Running || item.Config.Image !== expectedImage ||
    labels["com.docker.compose.project"] !== project || labels["com.docker.compose.service"] !== service) {
    throw new Error(`Docker identity check failed for ${service}.`);
  }
  return item;
}

if (remoteMode) {
  const walletAddress = process.env.BTCPAY_EXPECTED_WALLET_ADDRESS;
  if (!walletAddress || !/^tb1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(walletAddress)) {
    throw new Error("Remote mode requires BTCPAY_EXPECTED_WALLET_ADDRESS: the independently verified first native SegWit testnet receiving address (0/0).");
  }
  const info = await get("/api/v1/server/info");
  const methods = await get(`/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods?onlyEnabled=true`);
  const preview = await get(`/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/BTC-CHAIN/wallet/preview?offset=0&count=1`);
  const first = preview.addresses?.find((address) => address.index === 0 && address.keyPath === "0/0");
  if (first?.address !== walletAddress) {
    throw new Error("Remote store wallet/network does not match the independently verified testnet receiving address at 0/0.");
  }
  requireReady(info, methods);
  const now = Date.now();
  await writeProof({
    version: 1, apiUrl: apiUrl.origin, apiMode: "remote-https", storeId, network: "testnet",
    btcpayVersion: info.version, btcpayFullySynched: true, walletAddress, walletKeyPath: "0/0",
    checkedAt: now, expiresAt: now + TTL_MS,
  });
} else {
  const btcpayId = await serviceId("btcpay");
  const coreId = await serviceId("bitcoind");
  const nbxId = await serviceId("nbxplorer");
  const btcpayDocker = await inspect(btcpayId, "btcpay", "btcpayserver/btcpayserver:2.4.7");
  const coreDocker = await inspect(coreId, "bitcoind", "btcpayserver/bitcoin:32.1");
  const nbxDocker = await inspect(nbxId, "nbxplorer", "nicolasdorier/nbxplorer:2.6.21");
  const env = Object.fromEntries((btcpayDocker.Config.Env ?? []).map((entry) => {
    const index = entry.indexOf("=");
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  const coreEnv = Object.fromEntries((coreDocker.Config.Env ?? []).map((entry) => {
    const index = entry.indexOf("=");
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  if (env.BTCPAY_NETWORK !== "testnet" || env.BTCPAY_BTCEXPLORERURL !== "http://nbxplorer:32838/" ||
    coreEnv.BITCOIN_NETWORK !== "testnet") throw new Error("BTCPay/Core testnet configuration or explorer binding is invalid.");
  const nbxEnv = Object.fromEntries((nbxDocker.Config.Env ?? []).map((entry) => {
    const index = entry.indexOf("=");
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  if (nbxEnv.NBXPLORER_NETWORK !== "testnet" || nbxEnv.NBXPLORER_BTCRPCURL !== "http://bitcoind:43782/" ||
    nbxEnv.NBXPLORER_BTCNODEENDPOINT !== "bitcoind:39388") throw new Error("NBXplorer is not configured for the selected Core RPC/P2P services.");
  const btcpayNetworks = btcpayDocker.NetworkSettings?.Networks ?? {};
  const coreNetworks = coreDocker.NetworkSettings?.Networks ?? {};
  const nbxNetworks = nbxDocker.NetworkSettings?.Networks ?? {};
  const sharesNetworkAlias = (left, right, network, alias) =>
    Boolean(left[network] && right[network] && (right[network].Aliases ?? []).includes(alias));
  if (!Object.keys(nbxNetworks).some((network) => sharesNetworkAlias(nbxNetworks, coreNetworks, network, "bitcoind")) ||
    !Object.keys(btcpayNetworks).some((network) => sharesNetworkAlias(btcpayNetworks, nbxNetworks, network, "nbxplorer"))) {
    throw new Error("Docker network aliases do not bind BTCPay → NBXplorer → the selected Bitcoin Core container.");
  }
  const bindings = btcpayDocker.NetworkSettings?.Ports?.["49392/tcp"] ?? [];
  const expectedHostPort = probeUrl.port || (probeUrl.protocol === "https:" ? "443" : "80");
  if (!bindings.some((binding) => binding.HostIp === "127.0.0.1" && binding.HostPort === expectedHostPort)) {
    throw new Error("Probe origin does not map to the selected Compose service's exact loopback publication.");
  }

  let appProof = { appContainerId: null, appService: null, appNetwork: null, btcpayNetworkAlias: null };
  if (dockerMode) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(appProject) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(appService) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(appNetwork)) throw new Error("Invalid selected app Compose project/service/network.");
    const ids = (await run("docker", "ps", "--filter", `label=com.docker.compose.project=${appProject}`,
      "--filter", `label=com.docker.compose.service=${appService}`, "--format", "{{.ID}}")).split(/\s+/).filter(Boolean);
    if (ids.length !== 1) throw new Error("Expected exactly one running selected app Compose service.");
    const [appDocker] = JSON.parse(await run("docker", "inspect", ids[0]));
    const labels = appDocker?.Config?.Labels ?? {};
    const appNetworks = appDocker?.NetworkSettings?.Networks ?? {};
    const btcpayNetwork = btcpayNetworks[appNetwork];
    if (!appDocker?.State?.Running || labels["com.docker.compose.project"] !== appProject ||
      labels["com.docker.compose.service"] !== appService || !appNetworks[appNetwork] || !btcpayNetwork ||
      !(btcpayNetwork.Aliases ?? []).includes("btcpay")) {
      throw new Error("App service and selected BTCPay service do not share the exact network with the btcpay alias.");
    }
    appProof = { appContainerId: appDocker.Id, appService: `${appProject}/${appService}`, appNetwork, btcpayNetworkAlias: "btcpay" };
  }

  const core = JSON.parse(await run("docker", "exec", coreId, "bitcoin-cli", "-datadir=/data", "getblockchaininfo"));
  if (core.chain !== "test" || core.initialblockdownload !== false || !Number.isSafeInteger(core.blocks) || core.blocks < 1) {
    throw new Error("Bitcoin Core is not on testnet or has not completed initial synchronization.");
  }
  const info = await get("/api/v1/server/info");
  const methods = await get(`/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods?onlyEnabled=true`);
  requireReady(info, methods);

  const now = Date.now();
  await writeProof({
    version: 1,
    apiUrl: apiUrl.origin,
    probeUrl: apiOrigin,
    apiMode: dockerMode ? "docker-service" : "host-loopback",
    storeId,
    network: "testnet",
    composeProject: project,
    btcpayContainerId: btcpayDocker.Id,
    btcpayImage: "btcpayserver/btcpayserver:2.4.7",
    btcpayVersion: info.version,
    btcpayFullySynched: true,
    coreContainerId: coreDocker.Id,
    coreImage: "btcpayserver/bitcoin:32.1",
    coreChain: core.chain,
    coreInitialBlockDownload: false,
    ...appProof,
    checkedAt: now,
    expiresAt: now + TTL_MS,
  });
}
