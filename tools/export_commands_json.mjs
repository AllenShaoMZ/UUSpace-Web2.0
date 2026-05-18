import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const root = process.cwd();
const commandDir = path.join(root, "Commad");
const files = fs.existsSync(commandDir)
  ? fs.readdirSync(commandDir).filter((name) => /\.xls$/i.test(name) && !name.startsWith("~"))
  : [];
const source = files.find((name) => name.includes("指令")) || files[0];

if (!source) {
  console.error("No command xls found in Commad");
  process.exit(1);
}

const workbook = XLSX.readFile(path.join(commandDir, source));
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

const output = {
  source,
  sheetName,
  generatedAt: new Date().toISOString(),
  commands: rows,
};

fs.writeFileSync(path.join(commandDir, "commands.json"), JSON.stringify(output, null, 2), "utf8");
console.log(`Exported ${rows.length} commands from ${source} / ${sheetName}`);
