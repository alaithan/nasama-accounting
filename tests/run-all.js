// Run every test file in this folder and summarise. Zero dependencies.
//     node tests/run-all.js
// Exits non-zero if any file fails.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const summary = out.trim().split("\n").reverse().find(l => /passed|PASS|FAIL/.test(l)) || "(no summary)";
  const okRun = r.status === 0;
  if (!okRun) bad++;
  console.log(`${okRun ? "✓" : "✗"} ${f.padEnd(26)} ${summary.replace(/^[✓✗]\s*/, "")}`);
  if (!okRun) console.log(out.split("\n").filter(l => /✗|Error/.test(l)).slice(0, 10).map(l => "    " + l).join("\n"));
}
console.log(bad ? `\n${bad} file(s) FAILED` : `\nAll ${files.length} test files passed`);
process.exit(bad ? 1 : 0);
