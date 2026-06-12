import test from "node:test";
import assert from "node:assert/strict";

import { createLookupOptions } from "./lookupDisplay.js";

test("createLookupOptions preserves every filtered owner", () => {
  const owners = Array.from({ length: 75 }, (_, idx) => ({
    address: `tz1${String(idx).padStart(33, "a")}`,
    totalCtez: BigInt(idx),
    totalTez: BigInt(idx * 2),
  }));

  assert.equal(createLookupOptions(owners).length, 75);
});
