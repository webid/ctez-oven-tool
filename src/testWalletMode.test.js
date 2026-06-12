import test from "node:test";
import assert from "node:assert/strict";

import { lookupIsReadOnly, isTestLookupWallet, TEST_LOOKUP_WALLET } from "./testWalletMode.js";

test("only the configured wallet enables connected lookup test mode", () => {
  assert.equal(isTestLookupWallet(TEST_LOOKUP_WALLET), true);
  assert.equal(isTestLookupWallet("tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz"), false);
});

test("lookup is actionable only when the special wallet is connected for another owner", () => {
  assert.equal(
    lookupIsReadOnly({
      connectedWalletAddress: TEST_LOOKUP_WALLET,
      lookupAddress: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
    }),
    false,
  );
  assert.equal(
    lookupIsReadOnly({
      connectedWalletAddress: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
      lookupAddress: "tz1abc",
    }),
    true,
  );
});

test("lookup remains actionable for the special wallet even when selecting itself", () => {
  assert.equal(
    lookupIsReadOnly({
      connectedWalletAddress: TEST_LOOKUP_WALLET,
      lookupAddress: TEST_LOOKUP_WALLET,
    }),
    false,
  );
});
