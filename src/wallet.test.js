import test from "node:test";
import assert from "node:assert/strict";

import { RPC_URL } from "./rpcConfig.js";

test("wallet uses an active mainnet RPC endpoint", () => {
  assert.equal(RPC_URL, "https://tezos-mainnet.octez.io");
  assert.doesNotMatch(RPC_URL, /marigold/i);
});
