/**
 * 从 /api/protocol 同步监听端口与规则；WebSocket 接收 UDP 桥接推送。
 * 卫星类型：从 Meter 目录 xlsx 枚举，选择后加载 /api/meter/:filename 填充遥测参数表。
 */
(function () {
  const STATIC_TAIL_LINKS = [
    {
      id: "tcp",
      name: "TCP 工作站链路",
      mode: "Standby",
      local: "0.0.0.0:18080",
      remote: "见各站配置",
      rate: "—",
      loss: "—",
      status: "ok",
    },
    {
      id: "serial",
      name: "串口调试链路",
      mode: "COM",
      local: "115200 / 8N1",
      remote: "本机采集",
      rate: "待机",
      loss: "--",
      status: "warn",
    },
  ];

  function api() {
    return window.UUSPACE_API;
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function fmtTime(d) {
    return d.toTimeString().slice(0, 8);
  }

  function mapMeterRow(row) {
    const r = {};
    for (const [k, v] of Object.entries(row)) {
      if (k) r[String(k).trim()] = v;
    }
    const get = (...aliases) => {
      for (const a of aliases) {
        if (r[a] != null && String(r[a]).trim() !== "") return String(r[a]).trim();
      }
      for (const key of Object.keys(r)) {
        for (const a of aliases) {
          if (key === a || key.includes(a)) {
            const v = r[key];
            if (v != null && String(v).trim() !== "") return String(v).trim();
          }
        }
      }
      return "";
    };
    let code = get("代号", "参数代号", "代码", "code", "Code", "ID", "id", "参数代码");
    const name = get("名称", "参数名称", "参数名", "name", "Name", "说明") || code;
    if (!code) {
      const vals = Object.values(r)
        .map((x) => String(x).trim())
        .filter(Boolean);
      code = vals[0] || "ROW";
    }
    const group = get("分组", "组", "group", "Group", "参数组", "子系统") || "遥测表";
    const frame = get("帧", "帧号", "frame", "Frame", "协议帧", "Sheet", "遥测帧") || "—";
    const value = get("当前值", "值", "工程值", "value", "Value", "遥测值", "解码值") || "—";
    const unit = get("单位", "unit", "Unit") || "";
    let status = get("状态", "status", "Status", "告警", "门限") || "正常";
    if (/告警|超限|危险/.test(status)) status = "告警";
    else if (/关注|预警/.test(status)) status = "关注";
    const raw = get("源码", "原始", "raw", "Raw", "HEX", "十六进制") || "";
    return { code, name, group, frame, value, unit, status, raw: raw || "—" };
  }

  function classifyCommandCategory(code, fallbackCategory) {
    const clean = String(code || "").trim().toUpperCase();
    const explicit = String(fallbackCategory || "").trim();
    if (explicit && !/^\d+$/.test(explicit)) return explicit;
    if (clean.startsWith("K")) return "星上指令";
    if (clean.startsWith("DLX") || clean.startsWith("D")) return "动力学指令";
    if (clean.startsWith("P")) return "参数上注";
    return "其他指令";
  }

  function commandTypeLabel(typeValue) {
    const raw = String(typeValue ?? "").trim();
    const labels = {
      "0": "间接指令",
      "1": "内部指令",
      "2": "单地址注数",
      "3": "立即软件注数",
      "4": "延时间接指令",
      "5": "延时内部指令",
      "6": "延时软件注数",
      "7": "连续地址注数单包",
      "8": "连续地址注数多包64",
      "9": "连续地址注数多包256",
    };
    return labels[raw] || raw || "未分类";
  }

  function mapCommandRow(row, i) {
    const r = { ...row };
    const get = (...aliases) => {
      for (const a of aliases) {
        if (r[a] != null && String(r[a]).trim() !== "") return String(r[a]).trim();
      }
      for (const key of Object.keys(r)) {
        for (const a of aliases) {
          if (key.includes(a)) {
            const v = r[key];
            if (v != null && String(v).trim() !== "") return String(v).trim();
          }
        }
      }
      return "";
    };
    const id = get("Num", "num", "指令代号", "代号", "代码", "编号", "code", "Code", "ID");
    const name = get("Name", "name", "指令名称", "名称", "说明");
    const rawType = get("Type", "type", "类型");
    const dataSrc = get("DataSrc", "datasrc", "数据源", "源码来源");
    const packet = get("data", "Data", "指令码", "报文", "packet", "包", "HEX", "十六进制");
    if (!id && !packet) {
      return null;
    }
    const code = id || `CMD${i + 1}`;
    const displayName = name || code;
    const category = classifyCommandCategory(code, get("类别", "分类", "category", "指令类别"));
    const target = get("目标IP", "目标地址", "目标", "target", "IP") || "192.168.11.166";
    const portRaw = get("目标端口号", "目标端口", "端口", "port", "UDP");
    const port = portRaw ? String(portRaw) : "19200";
    const type = commandTypeLabel(rawType);
    const node = get("节点", "MachineID", "机器ID", "软件", "node", "执行单元", "所属系统") || "—";
    const desc = get("描述", "说明", "desc", "备注") || "";
    const sourceMode = dataSrc === "-1" ? "可参数化模板" : dataSrc === "1" ? "固定源码" : dataSrc || "未标记";
    return {
      id: code,
      name: displayName,
      category,
      target,
      port,
      type,
      node,
      packet,
      desc,
      rawType,
      dataSrc,
      sourceMode,
      rawRow: { ...row },
    };
  }

  function rebuildTelemetryGroups() {
    const { parameters, telemetryGroups } = api();
    const palette = ["#5B7CFA", "#3DD9B4", "#FFB020", "#00C2FF", "#9B8CFF", "#FF6B9A"];
    const byGroup = new Map();
    let c = 0;
    for (const p of parameters) {
      const g = p.group || "未分组";
      if (!byGroup.has(g)) byGroup.set(g, []);
      const num = parseFloat(String(p.value).replace(/[^\d.+\-eE]/g, ""));
      byGroup.get(g).push({
        code: p.code,
        name: (p.name || p.code).slice(0, 12),
        unit: p.unit || "",
        value: Number.isFinite(num) ? num : 0,
        color: palette[c++ % palette.length],
      });
    }
    telemetryGroups.splice(0, telemetryGroups.length);
    for (const [name, items] of byGroup) {
      telemetryGroups.push({ name, items });
    }
  }

  function rebuildSummaryFromParams(max = 6) {
    const { parameters, summaryItems } = api();
    summaryItems.splice(0, summaryItems.length);
    for (let i = 0; i < Math.min(max, parameters.length); i++) {
      const p = parameters[i];
      const pct = Math.min(95, 30 + (i * 11) % 60);
      let status = "ok";
      if (p.status === "告警") status = "danger";
      else if (p.status === "关注") status = "warn";
      summaryItems.push({
        code: p.code,
        name: p.name,
        value: `${p.value} ${p.unit}`.trim(),
        percent: pct,
        status,
      });
    }
  }

  function applyProtocol(cfg) {
    const a = api();
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    if (!rules.length) {
      console.warn("[realtime] /api/protocol 未返回 rules，保留内置协议表");
      a.appendStatusEvent("协议表为空", "已保留页面内置 S0–S7 规则，请检查 config/protocol.json");
      return cfg.websocketPath || "";
    }
    a.protocolRules.splice(0, a.protocolRules.length, ...rules);
    const ports = [
      ...new Set(
        rules
          .filter((x) => x.enabled !== false)
          .map((x) => Number(x.port))
          .filter((p) => Number.isFinite(p)),
      ),
    ].sort((x, y) => x - y);
    const host = cfg.bindHost || "0.0.0.0";
    const udpLinks = ports.map((p) => ({
      id: `udp-${p}`,
      name: `UDP 遥测 :${p}`,
      mode: "Server",
      local: `${host}:${p}`,
      remote: "对端按站配置",
      rate: "—",
      loss: "—",
      status: "ok",
    }));
    a.links.splice(0, a.links.length, ...udpLinks, ...STATIC_TAIL_LINKS);
    const el = $("#udpPortsText");
    if (el) el.textContent = ports.length ? ports.join(" / ") : "无启用端口";
    a.renderNavigation();
    a.renderView();
    return cfg.websocketPath || "";
  }

  async function loadMeterByFilename(filename) {
    const a = api();
    const url = `/api/meter/${encodeURIComponent(filename)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const rows = data.rows || [];
    a.parameters.splice(0, a.parameters.length, ...rows.map(mapMeterRow));
    rebuildTelemetryGroups();
    rebuildSummaryFromParams();
    a.renderDock();
    a.state.missionSatTitle = filename.replace(/\.xlsx?$/i, "") || "卫星";
    a.renderView();
  }

  async function loadCommandsMerged(showStatus = false) {
    const a = api();
    let cmdRows = [];
    try {
      const res = await fetch("/api/commands");
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      cmdRows = j.commands || [];
    } catch (e) {
      if (showStatus) a.appendStatusEvent("指令表导入失败", String(e.message || e));
      return;
    }
    const mapped = cmdRows.map(mapCommandRow).filter(Boolean);
    if (mapped.length) {
      a.commands.splice(0, a.commands.length, ...mapped);
      if (!a.commands.some((item) => item.id === a.state.selectedCommandId)) {
        a.state.selectedCommandId = a.commands[0].id;
      }
      if (!a.commands.some((item) => item.category === a.state.commandCategory)) {
        a.state.commandCategory = "全部";
      }
      if (showStatus) a.appendStatusEvent("指令表已导入", `${mapped.length} 条指令`);
      a.renderView();
    } else if (showStatus) {
      a.appendStatusEvent("指令表为空", "未读取到有效指令");
    }
  }

  window.UUSPACE_LOAD_COMMANDS = loadCommandsMerged;

  function setWsUi(connected, detail) {
    const line = $("#wsStatusLine");
    const text = $("#wsStatusText");
    if (!line || !text) return;
    const dot = line.querySelector(".dot");
    if (dot) {
      dot.classList.remove("ok", "warn", "danger");
      dot.classList.add(connected ? "ok" : "warn");
    }
    text.textContent = connected ? detail || "WS 已连接" : detail || "WS 未连接";
  }

  function connectWs(wsPath) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}${wsPath}`;
    const ws = new WebSocket(url);
    setWsUi(false, "连接中…");
    ws.addEventListener("open", () => setWsUi(true, ""));
    ws.addEventListener("close", () => {
      setWsUi(false, "已断开，5s 重连");
      setTimeout(() => connectWs(wsPath), 5000);
    });
    ws.addEventListener("error", () => setWsUi(false, "错误"));
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "udp") {
        api().state.frame += 1;
        const fc = $("#frameCounter");
        if (fc) fc.textContent = String(api().state.frame);
        const cs =
          msg.checksumOk === true ? "校验OK" : msg.checksumOk === false ? "校验失败" : "无校验";
        const head = msg.headerMatch ? `匹配 ${msg.frameId || ""}` : "包头未匹配";
        api().appendStatusEvent(
          `UDP :${msg.port} ${head} · ${cs} · ${msg.length}B · ${msg.remote}`,
          msg.hex ? msg.hex.slice(0, 120) : "",
        );
      }
    });
    return ws;
  }

  async function boot() {
    if (!api()) {
      console.warn("[realtime] UUSPACE_API 未就绪");
      return;
    }
    let wsPath = "";
    try {
      const res = await fetch("/api/protocol");
      const cfg = await res.json();
      wsPath = applyProtocol(cfg);
    } catch (e) {
      console.error("[realtime] /api/protocol", e);
      setWsUi(false, "协议加载失败");
    }

    const sel = $("#satelliteSelect");
    try {
      const res = await fetch("/api/satellites");
      const j = await res.json();
      const list = j.satellites || [];
      if (sel) {
        sel.innerHTML = "";
        if (!list.length) {
          sel.appendChild(new Option("无 Meter xlsx", ""));
        } else {
          sel.appendChild(new Option("选择卫星遥测表…", ""));
          for (const s of list) {
            const opt = new Option(s.filename, s.filename);
            sel.appendChild(opt);
          }
        }
        sel.addEventListener("change", async () => {
          const fn = sel.value;
          if (!fn) return;
          try {
            await loadMeterByFilename(fn);
            api().appendStatusEvent(`已切换遥测表 ${fn}`, fmtTime(new Date()));
          } catch (e) {
            console.error(e);
            api().appendStatusEvent(`加载遥测表失败: ${fn}`, String(e.message || e));
          }
        });
        if (list.length === 1) {
          sel.value = list[0].filename;
          await loadMeterByFilename(list[0].filename).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[realtime] /api/satellites", e);
      if (sel) sel.innerHTML = `<option value="">卫星列表加载失败</option>`;
      api().appendStatusEvent(
        "卫星遥测表加载失败",
        "请从仓库根目录启动 Python：python tools\\udp_web_server.py --root <项目根>",
      );
    }

    loadCommandsMerged().catch(() => {});
    if (wsPath) {
      connectWs(wsPath);
    } else {
      setWsUi(true, "SSE UDP桥接");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
