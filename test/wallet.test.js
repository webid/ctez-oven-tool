import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("connectWallet requests Beacon permissions without a network override", async () => {
  const source = await readFile(new URL("../src/wallet.js", import.meta.url), "utf8");
  const connectWalletBody = source.match(
    /export async function connectWallet\(\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(connectWalletBody, "connectWallet function should exist");
  assert.match(connectWalletBody, /wallet\.requestPermissions\(\{/);
  assert.match(connectWalletBody, /PermissionScope\.OPERATION_REQUEST/);
  assert.doesNotMatch(connectWalletBody, /\bnetwork\s*:/);
});
