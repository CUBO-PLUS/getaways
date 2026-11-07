import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { signBtcpayDeploymentProof, validateBtcpayDeploymentProof } from "@/modules/payments/deployment-proof";

const key = "a".repeat(64);
const walletAddress = `tb1q${"q".repeat(38)}`;
const officialAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const now = 1_800_000_000_000;

function signedProof(overrides: Record<string, unknown> = {}) {
  const payload = {
    version: 1 as const,
    apiUrl: "https://btcpay.example.com",
    apiMode: "remote-https" as const,
    storeId: "store-1",
    network: "testnet" as const,
    btcpayVersion: "2.4.7" as const,
    btcpayFullySynched: true as const,
    walletAddress,
    walletKeyPath: "0/0" as const,
    checkedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  };
  return { ...payload, signature: signBtcpayDeploymentProof(payload, key) };
}

describe("BTCPay deployment proof", () => {
  it("accepts a signed, unexpired remote HTTPS testnet proof bound to expected store and wallet", () => {
    expect(validateBtcpayDeploymentProof(signedProof(), {
      apiUrl: "https://btcpay.example.com", storeId: "store-1", key, walletAddress, now,
    })).toBe(true);
  });

  it("rejects a proof for another receiving wallet or an HTTPS downgrade", () => {
    const expected = { apiUrl: "https://btcpay.example.com", storeId: "store-1", key, walletAddress, now };
    expect(validateBtcpayDeploymentProof(signedProof({ walletAddress: `tb1q${"p".repeat(38)}` }), expected)).toBe(false);
    const downgraded = signedProof({ apiUrl: "http://btcpay.example.com" });
    expect(validateBtcpayDeploymentProof(downgraded, { ...expected, apiUrl: "http://btcpay.example.com" })).toBe(false);
  });

  it("runs the remote preflight, writes an interoperable private proof, and fails closed on unhealthy or unauthorized responses", async () => {
    const directory = await mkdtemp("/tmp/opencode/btcpay-preflight-test-");
    try {
      const bootstrap = join(directory, "fetch.mjs");
      await writeFile(bootstrap, `
const scenario = process.env.PREFLIGHT_SCENARIO;
globalThis.fetch = async (url, options) => {
  if (options.redirect !== "error") throw new Error("redirect policy missing");
  const path = new URL(url).pathname;
  if (scenario === "forbidden" && path.includes("wallet/preview")) return new Response("{}", { status: 403 });
  if (path.endsWith("/server/info")) return Response.json({ version: "2.4.7", fullySynched: scenario !== "unsynced", supportedPaymentMethods: ["BTC-CHAIN"], syncStatus: [{ paymentMethodId: "BTC-CHAIN", available: true }] });
  if (path.endsWith("/payment-methods")) return Response.json([{ paymentMethodId: "BTC-CHAIN", enabled: true }]);
  if (path.includes("wallet/preview")) return Response.json({ addresses: [{ index: 0, keyPath: "0/0", address: scenario === "wrong-wallet" ? "tb1q${"p".repeat(38)}" : process.env.BTCPAY_EXPECTED_WALLET_ADDRESS }] });
  throw new Error("Unexpected preflight URL: " + url);
};
`);
      const proofPath = join(directory, "proof.json");
      const script = resolve(import.meta.dirname, "../../../scripts/btcpay-deployment-preflight.mjs");
      const run = (scenario: string) => spawnSync(process.execPath, ["--import", bootstrap, script, "--api-url", "https://btcpay.example.com", "--store-id", "store-1", "--proof-path", proofPath], {
        encoding: "utf8",
        env: { ...process.env, PREFLIGHT_SCENARIO: scenario, BTCPAY_API_KEY: "synthetic-token", BTCPAY_DEPLOYMENT_PROOF_KEY: key, BTCPAY_EXPECTED_WALLET_ADDRESS: officialAddress },
      });

      const success = run("success");
      expect(success.status, success.stderr).toBe(0);
      expect((await stat(proofPath).catch((error) => { throw new Error(`${success.stdout}\n${success.stderr}\n${error}`); })).mode & 0o777).toBe(0o600);
      const proof = JSON.parse(await readFile(proofPath, "utf8"));
      expect(validateBtcpayDeploymentProof(proof, {
        apiUrl: "https://btcpay.example.com", storeId: "store-1", key, walletAddress: officialAddress,
      })).toBe(true);

      for (const scenario of ["unsynced", "wrong-wallet", "forbidden"]) {
        await rm(proofPath, { force: true });
        const result = run(scenario);
        expect(result.status, `${scenario}: preflight unexpectedly succeeded`).not.toBe(0);
        expect(result.stderr, `${scenario}: missing actionable preflight failure`).toContain("Error:");
        expect(existsSync(proofPath), `${scenario}: failed preflight left a usable proof`).toBe(false);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
