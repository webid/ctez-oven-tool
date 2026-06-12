import test from "node:test";
import assert from "node:assert/strict";

import {
  createBurnParams,
  createCloseOvenBatchPlan,
  createWithdrawParams,
  formatCtez,
  formatTez,
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
    /ctez outstanding must be a non-negative decimal string/,
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
    ctezOutstanding: "1234567",
    tezBalance: "7654321",
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
    ctezOutstanding: "0",
    tezBalance: "7654321",
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
      ctezOutstanding: "0",
      tezBalance: "0",
      destination: "tz1NRbpmTuPEFCCYCqCr7i3hkMRDRhBFgmxz",
    }),
    /no ctez or tez to close/,
  );
});
