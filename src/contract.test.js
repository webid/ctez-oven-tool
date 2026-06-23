import test from "node:test";
import assert from "node:assert/strict";

import {
  createBurnParams,
  createCloseOvenBatchPlan,
  createWithdrawParams,
  formatCtez,
  formatTez,
  calculateOvenStrategies,
} from "./contractParams.js";

test("createBurnParams keeps large nat/int values as safe decimal strings", () => {
  const params = createBurnParams("900719925474099312345", "900719925474099300000");

  assert.deepEqual(params, {
    id: "900719925474099312345",
    quantity: "-900719925474099300000",
  });
});

test("createBurnParams rejects malformed decimal inputs", () => {
  assert.throws(
    () => createBurnParams("12abc", "1000"),
    /oven id must be a non-negative decimal string/,
  );
  assert.throws(
    () => createBurnParams("12", "-1000"),
    /burn amount must be a non-negative decimal string/,
  );
});

test("createWithdrawParams keeps mutez amount as a safe decimal string", () => {
  const params = createWithdrawParams(
    "42",
    "900719925474099399999",
    "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
  );

  assert.deepEqual(params, {
    id: "42",
    amount: "900719925474099399999",
    to: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
  });
});

test("createWithdrawParams rejects invalid owner destination", () => {
  assert.throws(
    () => createWithdrawParams("42", "1000", "KT1bad"),
    /destination must be an implicit tz address/,
  );
});

test("formatters preserve precision for large decimal mutez values", () => {
  assert.equal(formatTez("900719925474099399999"), "900719925474099.399999");
  assert.equal(formatCtez("123456789012345678901"), "123456789012345.678901");
});

test("createCloseOvenBatchPlan orders burn before max-balance withdraw", () => {
  const plan = createCloseOvenBatchPlan({
    ovenId: "42",
    burnAmount: "1234567",
    withdrawAmount: "7654321",
    destination: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
  });

  assert.deepEqual(plan, [
    {
      entrypoint: "mint_or_burn",
      params: { id: "42", quantity: "-1234567" },
    },
    {
      entrypoint: "withdraw",
      params: {
        id: "42",
        amount: "7654321",
        to: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
      },
    },
  ]);
});

test("createCloseOvenBatchPlan skips burn when there is no ctez outstanding", () => {
  const plan = createCloseOvenBatchPlan({
    ovenId: "42",
    burnAmount: "0",
    withdrawAmount: "7654321",
    destination: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
  });

  assert.deepEqual(plan, [
    {
      entrypoint: "withdraw",
      params: {
        id: "42",
        amount: "7654321",
        to: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
      },
    },
  ]);
});

test("createCloseOvenBatchPlan rejects empty no-op ovens", () => {
  assert.throws(
    () => createCloseOvenBatchPlan({
      ovenId: "42",
      burnAmount: "0",
      withdrawAmount: "0",
      destination: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
    }),
    /no ctez or tez to close/,
  );
});

test("calculateOvenStrategies behaves correctly when wallet ctez is sufficient", () => {
  const strategies = calculateOvenStrategies({
    ctezOutstanding: "10000000", // 10 ctez
    tezBalance: "15000000",      // 15 tez
    walletCtezBalance: "12000000", // 12 ctez
    target: "194064612906983",   // peg ~0.689
  });

  assert.equal(strategies.full.possible, true);
  assert.equal(strategies.full.burn, "10000000");
  assert.equal(strategies.full.withdraw, "15000000");

  assert.equal(strategies.partial.possible, false);
});

test("calculateOvenStrategies behaves correctly when wallet ctez is insufficient but positive", () => {
  const strategies = calculateOvenStrategies({
    ctezOutstanding: "10000000",
    tezBalance: "15000000",
    walletCtezBalance: "4000000",
    target: "194064612906983",
  });

  assert.equal(strategies.full.possible, false);

  assert.equal(strategies.excess.possible, true);
  assert.equal(strategies.excess.burn, "0");
  assert.equal(strategies.excess.withdraw, "7645802");

  assert.equal(strategies.partial.possible, true);
  assert.equal(strategies.partial.burn, "4000000");
  assert.equal(strategies.partial.withdraw, "10587481");
  assert.equal(strategies.partial.remaining, "6000000");
});

test("calculateOvenStrategies behaves correctly when wallet ctez is zero", () => {
  const strategies = calculateOvenStrategies({
    ctezOutstanding: "10000000",
    tezBalance: "15000000",
    walletCtezBalance: "0",
    target: "194064612906983",
  });

  assert.equal(strategies.full.possible, false);
  assert.equal(strategies.partial.possible, false);
  assert.equal(strategies.excess.possible, true);
  assert.equal(strategies.excess.withdraw, "7645802");
});
