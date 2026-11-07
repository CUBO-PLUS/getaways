import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isIP } from "node:net";

const MAX_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 30_000;

export type BtcpayLocalDeploymentProof = {
  version: 1;
  apiUrl: string;
  probeUrl?: string;
  apiMode?: "host-loopback" | "docker-service";
  storeId: string;
  network: "testnet";
  composeProject: string;
  btcpayContainerId: string;
  btcpayImage: "btcpayserver/btcpayserver:2.4.7";
  btcpayVersion: "2.4.7";
  btcpayFullySynched: true;
  coreContainerId: string;
  coreImage: "btcpayserver/bitcoin:32.1";
  coreChain: "test";
  coreInitialBlockDownload: false;
  appContainerId?: string | null;
  appService?: string | null;
  appNetwork?: string | null;
  btcpayNetworkAlias?: string | null;
  checkedAt: number;
  expiresAt: number;
  signature: string;
};

export type BtcpayRemoteDeploymentProof = {
  version: 1;
  apiMode: "remote-https";
  apiUrl: string;
  storeId: string;
  network: "testnet";
  btcpayVersion: "2.4.7";
  btcpayFullySynched: true;
  walletAddress: string;
  walletKeyPath: "0/0";
  checkedAt: number;
  expiresAt: number;
  signature: string;
};

export type BtcpayDeploymentProof = BtcpayLocalDeploymentProof | BtcpayRemoteDeploymentProof;

export function normalizeBtcpayApiUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function canonicalProof(proof: BtcpayDeploymentProof): string {
  if (proof.apiMode === "remote-https") {
    return JSON.stringify({
      version: proof.version,
      apiUrl: proof.apiUrl,
      apiMode: proof.apiMode,
      storeId: proof.storeId,
      network: proof.network,
      btcpayVersion: proof.btcpayVersion,
      btcpayFullySynched: proof.btcpayFullySynched,
      walletAddress: proof.walletAddress,
      walletKeyPath: proof.walletKeyPath,
      checkedAt: proof.checkedAt,
      expiresAt: proof.expiresAt,
    });
  }
  return JSON.stringify({
    version: proof.version,
    apiUrl: proof.apiUrl,
    probeUrl: proof.probeUrl ?? proof.apiUrl,
    apiMode: proof.apiMode ?? "host-loopback",
    storeId: proof.storeId,
    network: proof.network,
    composeProject: proof.composeProject,
    btcpayContainerId: proof.btcpayContainerId,
    btcpayImage: proof.btcpayImage,
    btcpayVersion: proof.btcpayVersion,
    btcpayFullySynched: proof.btcpayFullySynched,
    coreContainerId: proof.coreContainerId,
    coreImage: proof.coreImage,
    coreChain: proof.coreChain,
    coreInitialBlockDownload: proof.coreInitialBlockDownload,
    appContainerId: proof.appContainerId ?? null,
    appService: proof.appService ?? null,
    appNetwork: proof.appNetwork ?? null,
    btcpayNetworkAlias: proof.btcpayNetworkAlias ?? null,
    checkedAt: proof.checkedAt,
    expiresAt: proof.expiresAt,
  });
}

function proofKey(key: string): Buffer | null {
  return /^[a-f0-9]{64}$/i.test(key) ? Buffer.from(key, "hex") : null;
}

export function signBtcpayDeploymentProof(
  proof: Omit<BtcpayLocalDeploymentProof, "signature"> | Omit<BtcpayRemoteDeploymentProof, "signature">,
  key: string,
): string {
  const secret = proofKey(key);
  if (!secret) throw new Error("Deployment proof key must be 32 bytes of hex.");
  return createHmac("sha256", secret).update(canonicalProof({ ...proof, signature: "" })).digest("hex");
}

export function validateBtcpayDeploymentProof(
  proof: unknown,
  expected: { apiUrl: string; storeId: string; key: string; walletAddress?: string; now?: number },
): proof is BtcpayDeploymentProof {
  const value = proof as Partial<BtcpayDeploymentProof> | null;
  const now = expected.now ?? Date.now();
  const normalizedUrl = normalizeBtcpayApiUrl(expected.apiUrl);
  const key = proofKey(expected.key);
  const apiUrl = normalizedUrl ? new URL(normalizedUrl) : null;
  if (!value || !key || !normalizedUrl || typeof value.signature !== "string" || !/^[a-f0-9]{64}$/i.test(value.signature) ||
    value.version !== 1 || value.apiUrl !== normalizedUrl || value.storeId !== expected.storeId || value.network !== "testnet" ||
    value.btcpayVersion !== "2.4.7" || value.btcpayFullySynched !== true ||
    !Number.isSafeInteger(value.checkedAt) || !Number.isSafeInteger(value.expiresAt) ||
    value.checkedAt! > now + CLOCK_SKEW_MS || value.expiresAt! <= now || value.expiresAt! <= value.checkedAt! ||
    value.expiresAt! - value.checkedAt! > MAX_TTL_MS) return false;

  if (value.apiMode === "remote-https") {
    if (!apiUrl || apiUrl.protocol !== "https:" || isIP(apiUrl.hostname) || !apiUrl.hostname.includes(".") ||
      apiUrl.hostname === "localhost" || apiUrl.hostname.endsWith(".localhost") ||
      value.walletKeyPath !== "0/0" || typeof value.walletAddress !== "string" ||
      !/^tb1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(value.walletAddress) ||
      value.walletAddress !== expected.walletAddress) return false;
  } else {
    if (!("composeProject" in value)) return false;
    const normalizedProbeUrl = normalizeBtcpayApiUrl(value.probeUrl ?? value.apiUrl!);
    const probeHost = normalizedProbeUrl ? new URL(normalizedProbeUrl).hostname : null;
    const mode = value.apiMode ?? "host-loopback";
    const hostBound = mode === "host-loopback" && apiUrl !== null && ["127.0.0.1", "localhost"].includes(apiUrl.hostname) &&
      normalizedProbeUrl === normalizedUrl;
    const dockerBound = mode === "docker-service" && normalizedUrl === "http://btcpay:49392" &&
      normalizedProbeUrl !== null && probeHost !== null && ["127.0.0.1", "localhost"].includes(probeHost) &&
      typeof value.appContainerId === "string" && /^[a-f0-9]{12,64}$/i.test(value.appContainerId) &&
      typeof value.appService === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(value.appService) &&
      typeof value.appNetwork === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value.appNetwork) &&
      value.btcpayNetworkAlias === "btcpay";
    if (!(hostBound || dockerBound) || !value.composeProject || !value.btcpayContainerId ||
      value.btcpayImage !== "btcpayserver/btcpayserver:2.4.7" || !value.coreContainerId ||
      value.coreImage !== "btcpayserver/bitcoin:32.1" || value.coreChain !== "test" ||
      value.coreInitialBlockDownload !== false) return false;
  }
  const expectedSignature = createHmac("sha256", key).update(canonicalProof(value as BtcpayDeploymentProof)).digest();
  const receivedSignature = Buffer.from(value.signature, "hex");
  return receivedSignature.length === expectedSignature.length && timingSafeEqual(receivedSignature, expectedSignature);
}

export async function hasValidBtcpayDeploymentProof(): Promise<boolean> {
  const path = process.env.BTCPAY_DEPLOYMENT_PROOF_PATH;
  const key = process.env.BTCPAY_DEPLOYMENT_PROOF_KEY;
  const apiUrl = process.env.BTCPAY_API_URL;
  const storeId = process.env.BTCPAY_STORE_ID;
  if (!path || !key || !apiUrl || !storeId) return false;
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 8192) return false;
    const proof: unknown = JSON.parse(await readFile(path, "utf8"));
    return validateBtcpayDeploymentProof(proof, {
      apiUrl, storeId, key, walletAddress: process.env.BTCPAY_EXPECTED_WALLET_ADDRESS,
    });
  } catch {
    return false;
  }
}

export const BTCPAY_DEPLOYMENT_PROOF_MAX_TTL_MS = MAX_TTL_MS;
