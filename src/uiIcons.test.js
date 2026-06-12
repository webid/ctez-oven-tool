import test from "node:test";
import assert from "node:assert/strict";

import { iconSvg } from "./uiIcons.js";

test("status icons render as svg markup without emoji characters", () => {
  const rendered = ["view", "success", "error", "warning"]
    .map((name) => iconSvg(name))
    .join("");

  assert.match(rendered, /<svg/);
  assert.doesNotMatch(rendered, /[\u2705\u274c\u26a0\ud83d\udc41]/u);
});
