/**
 * UUSPACE Web 2.0 — 遥测 UDP 桥接
 * - 读取 config/protocol.json，按规则中的 **port** 字段创建 UDP 监听（同一端口只建一个 socket）
 * - 收到报文后按 **header** 匹配帧类型，广播到 WebSocket 客户端
 * - 提供 /api/satellites（Meter 目录 xlsx）、/api/meter、/api/cmdchain、/api/protocol
 *
 * 浏览器无法直接 bind UDP，因此必须由本进程监听；前端通过 WS 接收实时帧。
 */
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dgram from 'dgram';
import express from 'express';
import { WebSocketServer } from 'ws';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const METER_DIR = path.join(ROOT, 'Meter');
const COMMAD_DIR = path.join(ROOT, 'Commad');
const CONFIG_PROTOCOL = path.join(ROOT, 'config', 'protocol.json');

const HTTP_PORT = Number(process.env.UUSPACE_PORT || 3980);

function readProtocol() {
  const raw = fs.readFileSync(CONFIG_PROTOCOL, 'utf8');
  const j = JSON.parse(raw);
  return j;
}

function hexToBuffer(hex) {
  const clean = hex.replace(/\s+/g, '');
  return Buffer.from(clean, 'hex');
}

function xorChecksum(buf) {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xff;
}

function sumChecksum(buf) {
  let s = 0;
  for (const b of buf) s += b;
  return s & 0xff;
}

function matchRule(buf, rule) {
  if (!rule.enabled) return { ok: false, reason: 'disabled' };
  const hdr = hexToBuffer(rule.header);
  if (buf.length < hdr.length) return { ok: false, reason: 'short' };
  if (!hdr.equals(buf.subarray(0, hdr.length))) return { ok: false, reason: 'header' };
  const needLen = Number(rule.length) || buf.length;
  if (buf.length < needLen) return { ok: false, reason: 'length' };
  const body = buf.subarray(0, needLen);
  let checksumOk = true;
  if (rule.checksum === 'XOR') {
    const cs = body[body.length - 1];
    const payload = body.subarray(0, body.length - 1);
    checksumOk = xorChecksum(payload) === cs;
  } else if (rule.checksum === 'SUM') {
    const cs = body[body.length - 1];
    const payload = body.subarray(0, body.length - 1);
    checksumOk = (sumChecksum(payload) & 0xff) === cs;
  }
  return { ok: true, checksumOk, rule };
}

function listMeterWorkbooks() {
  if (!fs.existsSync(METER_DIR)) return [];
  return fs
    .readdirSync(METER_DIR)
    .filter((f) => /\.xlsx?$/i.test(f))
    .map((filename) => ({
      id: filename.replace(/\.xlsx?$/i, ''),
      filename,
      path: `/api/meter/${encodeURIComponent(filename)}`,
    }));
}

function readWorkbookFirstSheetRows(filename) {
  const fp = path.join(METER_DIR, filename);
  if (!fs.existsSync(fp)) throw new Error(`找不到文件: ${filename}`);
  const wb = XLSX.readFile(fp);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((c) => String(c).trim());
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some((c) => String(c).trim() !== '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] != null ? row[idx] : '';
    });
    data.push(obj);
  }
  return { sheetName: name, headers, rows: data };
}

function readCmdchain() {
  const fp = path.join(COMMAD_DIR, 'cmdchain.txt');
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      return {
        category: parts[0] || '',
        name: parts[1] || '',
        commandIds: (parts[2] || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        weight: parts[3] || '',
      };
    });
}

function readCommandXls() {
  const candidates = fs.existsSync(COMMAD_DIR)
    ? fs.readdirSync(COMMAD_DIR).filter((f) => /\.xls$/i.test(f) && !f.startsWith('~'))
    : [];
  const xls = candidates.find((f) => f.includes('指令')) || candidates[0];
  if (!xls) return [];
  const fp = path.join(COMMAD_DIR, xls);
  const wb = XLSX.readFile(fp);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows;
}

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(ROOT));

function parseCommandHex(data) {
  const clean = String(data || "").replace(/\s+/g, "").trim();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return null;
  }
  return Buffer.from(clean, "hex");
}

app.post("/api/command/send", (req, res) => {
  const payload = req.body || {};
  const target = String(payload.target || "").trim();
  const port = Number(payload.port) || 0;
  const data = String(payload.data || "");
  if (!target || !port || !String(data).replace(/\s+/g, "").trim()) {
    res.json({ success: false, error: "目标地址、端口和 HEX 数据均为必填" });
    return;
  }
  const packet = parseCommandHex(data);
  if (!packet || packet.length === 0) {
    res.json({ success: false, error: "报文不是合法的 HEX 字符串" });
    return;
  }
  const sock = dgram.createSocket("udp4");
  sock.send(packet, port, target, (err) => {
    sock.close();
    if (err) {
      res.json({ success: false, error: String(err.message || err) });
      return;
    }
    res.json({ success: true, sentTo: `${target}:${port}`, bytes: packet.length });
  });
});

app.get('/api/protocol', (_req, res) => {
  try {
    res.json(readProtocol());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/satellites', (_req, res) => {
  try {
    res.json({ satellites: listMeterWorkbooks() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/meter/:filename', (req, res) => {
  try {
    const filename = path.basename(decodeURIComponent(req.params.filename));
    const data = readWorkbookFirstSheetRows(filename);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/cmdchain', (_req, res) => {
  try {
    res.json({ chains: readCmdchain() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/commands', (_req, res) => {
  try {
    res.json({ commands: readCommandXls() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const protocol = readProtocol();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: protocol.websocketPath || '/ws' });

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'hello', message: 'UUSPACE telemetry bridge' }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(s);
  }
}
const rules = protocol.rules || [];
const portSet = new Map();
for (const r of rules) {
  if (!r.enabled) continue;
  const p = Number(r.port);
  if (!Number.isFinite(p)) continue;
  if (!portSet.has(p)) portSet.set(p, []);
  portSet.get(p).push(r);
}

if (!process.env.UUSPACE_TEST) {
  for (const [port, portRules] of portSet) {
    const sock = dgram.createSocket('udp4');
    sock.on('error', (err) => {
      console.error(`[UDP ${port}]`, err.message);
    });
    sock.on('message', (msg, rinfo) => {
      let matchedRule = null;
      let checksumOk = null;
      for (const rule of portRules) {
        const m = matchRule(msg, rule);
        if (m.ok) {
          matchedRule = m.rule;
          checksumOk = m.checksumOk;
          break;
        }
      }
      const hex = msg.subarray(0, Math.min(msg.length, 512)).toString('hex').replace(/(.{2})/g, '$1 ').trim();
      broadcast({
        type: 'udp',
        port,
        remote: `${rinfo.address}:${rinfo.port}`,
        length: msg.length,
        frameId: matchedRule ? matchedRule.id : null,
        headerMatch: !!matchedRule,
        checksumOk: checksumOk == null ? null : checksumOk,
        hex,
        ts: Date.now(),
      });
    });
    sock.bind(port, protocol.bindHost || '0.0.0.0', () => {
      console.log(`[UDP] listening ${protocol.bindHost || '0.0.0.0'}:${port} (${portRules.map((x) => x.id).join(', ')})`);
    });
  }
}

export { app };

if (!process.env.UUSPACE_TEST) {
  server.listen(HTTP_PORT, () => {
    console.log(`[HTTP] http://127.0.0.1:${HTTP_PORT}/  static + API`);
    console.log(`[WS]   ws://127.0.0.1:${HTTP_PORT}${protocol.websocketPath || '/ws'}`);
  });
}
