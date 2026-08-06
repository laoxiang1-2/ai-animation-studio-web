import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the production workflow and in-site API setup", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /创作工作台/);
  assert.match(page, /API 中心/);
  assert.match(page, /输入 API 并连接/);
  assert.match(page, /system\/integrations/);
  assert.match(page, /X-AI-Studio-Admin-Token/);
  assert.match(page, /生产后端尚未配置/);
  assert.match(layout, /AI 动画生产工作台/);
  assert.match(packageJson, /"build": "next build"/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});
