const state = {
  activeView: "status",
  frame: 582912,
  missionSatTitle: "XX-07",
  dataFilter: "全部",
  commandFilter: "",
  commandCategory: "全部",
  selectedCommandId: "K2001",
  selectedRuleId: "S0",
  selectedParamCode: "FW-A-RPM",
  udpBridge: {
    available: false,
    connected: false,
    udpPort: 7101,
    udpPorts: [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108],
    portStats: [],
    parser: { enabled: false, meterFile: "", sheetCounts: {} },
    total: 0,
    lastPacket: null,
    history: [],
  },
  liveTelemetry: [],
  sheetDefinitions: {},
  sheetStats: [],
  sheetLiveValues: {},
  activeSheet: 0,
  activeTableViewId: "",
  tableViews: [],
  tableSearch: "",
  curveSearch: "",
  curveBuffers: {},
  refreshTimer: null,
  lastViewRefreshAt: 0,
  channels: new Set(["FW-A-RPM", "FW-B-RPM", "ATT-X", "ATT-Y", "TEMP-CABIN"]),
  favorites: new Set(["FW-A-RPM", "ATT-X", "BAT-VOLT", "TEMP-CABIN"]),
  summaryCollapsed: false,
  chartTick: 0,
};

const views = [
  { id: "status", label: "状态总览" },
  { id: "protocol", label: "协议配置" },
  { id: "table", label: "遥测表格" },
  { id: "curve", label: "遥测曲线" },
  { id: "command", label: "指令控制" },
  { id: "connection", label: "连接管理" },
];

const links = [
  {
    id: "udp",
    name: "UDP 遥测链路",
    mode: "Server",
    local: "192.168.11.166:7101-7108",
    remote: "遥测大表 Sheet 0-7",
    rate: "125 pkt/s",
    loss: "0.12%",
    status: "ok",
  },
  {
    id: "tcp",
    name: "TCP 工作站链路",
    mode: "Standby",
    local: "0.0.0.0:18080",
    remote: "2 个客户端",
    rate: "42 pkt/s",
    loss: "0.00%",
    status: "ok",
  },
  {
    id: "serial",
    name: "串口调试链路",
    mode: "COM3",
    local: "115200 / 8N1",
    remote: "本机采集",
    rate: "待机",
    loss: "--",
    status: "warn",
  },
];

const summaryItems = [
  { code: "FW-A-RPM", name: "飞轮A转速", value: "1248 rpm", percent: 62, status: "ok" },
  { code: "FW-B-RPM", name: "飞轮B转速", value: "1186 rpm", percent: 58, status: "ok" },
  { code: "ATT-X", name: "姿态角 X", value: "+0.013 deg", percent: 47, status: "ok" },
  { code: "ATT-Y", name: "姿态角 Y", value: "-0.020 deg", percent: 51, status: "ok" },
  { code: "TEMP-CABIN", name: "舱内温度", value: "28.6 ℃", percent: 71, status: "warn" },
  { code: "BAT-VOLT", name: "电池母线电压", value: "28.4 V", percent: 82, status: "ok" },
];

const alarms = [
  { level: "warning", source: "飞轮热控", text: "飞轮A温度接近上限", time: "08:13:22" },
  { level: "danger", source: "UDP链路", text: "2号工作站丢包率瞬时升高", time: "08:18:04" },
  { level: "warning", source: "姿控软件", text: "姿态Y短时漂移", time: "08:21:49" },
];

const statusEvents = [
  { time: "08:11:08", type: "success", text: "UDP 7101-7108 遥测链路建立", detail: "每个端口对应遥测大表一个数字 Sheet" },
  { time: "08:13:22", type: "warning", text: "飞轮A温度接近上限", detail: "当前 68.2 ℃ / 上限 70 ℃" },
  { time: "08:15:43", type: "success", text: "遥测帧 F2 恢复连续", detail: "Frame 582681 起连续 25fps" },
  { time: "08:18:04", type: "danger", text: "UDP工作站丢包率瞬时升高", detail: "2号工作站 1.8% / 当前已回落" },
  { time: "08:22:15", type: "info", text: "协议 Sheet 与遥测表同步完成", detail: "F0-F7 数字 Sheet 已映射" },
];

const telemetryGroups = [
  {
    name: "飞轮组",
    items: [
      { code: "FW-A-RPM", name: "A转速", unit: "rpm", value: 1248, color: "#5B7CFA" },
      { code: "FW-B-RPM", name: "B转速", unit: "rpm", value: 1186, color: "#3DD9B4" },
      { code: "FW-C-RPM", name: "C转速", unit: "rpm", value: 1214, color: "#FFB020" },
    ],
  },
  {
    name: "姿态组",
    items: [
      { code: "ATT-X", name: "姿态X", unit: "deg", value: 0.013, color: "#00C2FF" },
      { code: "ATT-Y", name: "姿态Y", unit: "deg", value: -0.02, color: "#9B8CFF" },
      { code: "ATT-Z", name: "姿态Z", unit: "deg", value: 0.018, color: "#FF6B9A" },
    ],
  },
  {
    name: "温度组",
    items: [
      { code: "TEMP-CABIN", name: "舱内温度", unit: "℃", value: 28.6, color: "#FFB020" },
      { code: "TEMP-WHEEL", name: "飞轮温度", unit: "℃", value: 68.2, color: "#FF5A65" },
      { code: "TEMP-PCDU", name: "PCDU温度", unit: "℃", value: 31.8, color: "#3DD9B4" },
    ],
  },
];

const parameters = [
  { code: "FW-A-RPM", name: "飞轮A速度", group: "飞轮组", frame: "F2", value: "1248", unit: "rpm", status: "正常", raw: "0B C1 04 E0" },
  { code: "FW-B-RPM", name: "飞轮B速度", group: "飞轮组", frame: "F2", value: "1186", unit: "rpm", status: "正常", raw: "0B C1 04 A2" },
  { code: "ATT-X", name: "姿态X", group: "姿态组", frame: "F1", value: "+0.013", unit: "deg", status: "正常", raw: "22 01 00 0D" },
  { code: "ATT-Y", name: "姿态Y", group: "姿态组", frame: "F1", value: "-0.020", unit: "deg", status: "关注", raw: "22 02 FF EC" },
  { code: "TEMP-CABIN", name: "卫星舱内温度", group: "温度组", frame: "F0", value: "28.6", unit: "℃", status: "正常", raw: "31 10 01 1E" },
  { code: "TEMP-WHEEL", name: "飞轮A温度", group: "温度组", frame: "F2", value: "68.2", unit: "℃", status: "告警", raw: "31 20 02 AA" },
  { code: "TEMP-PCDU", name: "PCDU温度", group: "电源PCDU", frame: "F4", value: "31.8", unit: "℃", status: "正常", raw: "31 24 01 3E" },
  { code: "BAT-VOLT", name: "电池电压", group: "电源PCDU", frame: "F4", value: "28.4", unit: "V", status: "正常", raw: "40 02 01 1C" },
  { code: "UDP-LOSS", name: "UDP丢包率", group: "链路", frame: "SYS", value: "0.12", unit: "%", status: "正常", raw: "55 01 00 0C" },
  { code: "F2-LEN", name: "F2帧长度", group: "协议", frame: "F2", value: "512", unit: "byte", status: "正常", raw: "F2 00 02 00" },
];

const protocolRules = [
  { id: "S0", enabled: true, header: "AA", length: 1777, checksum: "关闭", port: 7101, sheet: 0, type: "1", endian: "大端" },
  { id: "S1", enabled: true, header: "26", length: 1777, checksum: "关闭", port: 7102, sheet: 1, type: "1", endian: "大端" },
  { id: "S2", enabled: true, header: "07 40", length: 1024, checksum: "关闭", port: 7103, sheet: 2, type: "1", endian: "大端" },
  { id: "S3", enabled: true, header: "07 50", length: 1024, checksum: "关闭", port: 7104, sheet: 3, type: "1", endian: "大端" },
  { id: "S4", enabled: true, header: "07 60", length: 1024, checksum: "关闭", port: 7105, sheet: 4, type: "1", endian: "大端" },
  { id: "S5", enabled: true, header: "07 70", length: 1024, checksum: "关闭", port: 7106, sheet: 5, type: "1", endian: "大端" },
  { id: "S6", enabled: true, header: "07 80", length: 1024, checksum: "关闭", port: 7107, sheet: 6, type: "1", endian: "大端" },
  { id: "S7", enabled: true, header: "1A CF", length: 29, checksum: "关闭", port: 7108, sheet: 7, type: "1", endian: "大端" },
];

const commands = [
  {
    id: "K2001",
    name: "飞轮A启动",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "间接指令",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 01 01 00 05 AA BB CC DD EE 4F 2E E9 C8 FD",
    desc: "启动飞轮A闭环控制，等待遥测确认。",
  },
  {
    id: "K2002",
    name: "飞轮A停止",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "间接指令",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 01 01 00 04 AA BB 00 00 4B 2E E9 C8 FD",
    desc: "停止飞轮A输出，适用于热控关注后的人工干预。",
  },
  {
    id: "K2003",
    name: "姿态初始化",
    category: "星上指令",
    target: "192.168.11.166",
    port: "19200",
    type: "内部指令",
    node: "姿控软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 02 00 30 01 00 0F 01 00 08 01 02 03 04 05 06 07 08 6A 2E E9 C8 FD",
    desc: "复位姿态控制状态机并装订初始状态。",
  },
  {
    id: "D3101",
    name: "动力学接入",
    category: "动力学指令",
    target: "127.0.0.1",
    port: "18100",
    type: "程控指令",
    node: "地测软件",
    packet: "DA 31 01 00 10 01 00 00 00 7E",
    desc: "接入动力学数据源，用于联调姿控响应。",
  },
  {
    id: "P4101",
    name: "热控参数上注",
    category: "参数上注",
    target: "192.168.11.166",
    port: "19200",
    type: "参数上注",
    node: "星务软件",
    packet: "20 6B 18 00 00 F9 AD 9F 52 00 01 00 30 01 00 03 01 00 06 54 48 43 01 46 00 5D 2E E9 C8 FD",
    desc: "更新飞轮热控阈值和回差参数。",
  },
];

const $ = (selector) => document.querySelector(selector);

function init() {
  renderNavigation();
  renderDock();
  renderTicker();
  renderView();
  bindGlobalActions();
  connectUdpBridge();
  startClock();
}

function renderNavigation() {
  $(".task-nav").innerHTML = views
    .map((view) => `<button class="task-button ${view.id === state.activeView ? "active" : ""}" data-view="${view.id}">${view.label}</button>`)
    .join("");

  $(".workspace-tabs").innerHTML = views
    .map((view) => `<button class="workspace-tab ${view.id === state.activeView ? "active" : ""}" data-view="${view.id}" role="tab">${view.label}</button>`)
    .join("");

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      renderNavigation();
      renderView();
    });
  });
}

function renderDock() {
  $("#summaryList").innerHTML = summaryItems
    .map(
      (item) => `
        <article class="summary-item" data-summary-param="${item.code}">
          <header>
            <strong>${item.name}</strong>
            <em>${item.value}</em>
          </header>
          <div class="mini-bar"><span style="width:${item.percent}%"></span></div>
          <span class="tag ${item.status === "warn" ? "warn" : "ok"}">${item.code}</span>
        </article>
      `,
    )
    .join("");

  $("#alarmList").innerHTML = alarms
    .map(
      (alarm) => `
        <article class="alarm-item ${alarm.level}">
          <header>
            <strong>${alarm.source}</strong>
            <em>${alarm.time}</em>
          </header>
          <div>${alarm.text}</div>
          <span class="tag ${alarm.level === "danger" ? "danger" : "warn"}">${alarm.level === "danger" ? "严重" : "关注"}</span>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-summary-param]").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedParamCode = item.dataset.summaryParam;
      state.activeView = "table";
      renderNavigation();
      renderView();
    });
  });
}

function renderTicker() {
  $("#ticker").innerHTML = statusEvents
    .slice(0, 4)
    .map(
      (event) => `
        <article class="ticker-item">
          <span>${event.time}</span>
          <i class="dot ${event.type === "success" ? "ok" : event.type === "danger" ? "danger" : event.type === "warning" ? "warn" : ""}"></i>
          <strong>${event.text}</strong>
        </article>
      `,
    )
    .join("");
}

function renderView() {
  const renderer = {
    status: renderStatus,
    connection: renderConnection,
    protocol: renderProtocol,
    table: renderTelemetryTable,
    curve: renderCurve,
    command: renderCommandCenter,
  }[state.activeView];

  $("#stage").innerHTML = renderer();
  bindViewActions();

  if (state.activeView === "curve") {
    requestAnimationFrame(drawTrendChart);
  }
}

function renderStatus() {
  return `
    <div class="view">
      <section class="view-surface mission-card">
        <div class="mission-id">
          <div>
            <h1>${state.missionSatTitle} 地面综测状态总览</h1>
            <p>围绕连接、协议、遥测表格、实时曲线和指令控制组织工作区，第一眼确认系统是否在线、链路是否稳定、遥测是否异常。</p>
          </div>
          <span class="tag ok">在线值守</span>
        </div>
        <div class="orbit-visual" aria-hidden="true">
          <div class="ground-node">地</div>
          <div class="sat-node">星</div>
          <div class="link-line"></div>
        </div>
        <div class="mission-facts">
          <div class="fact"><span>卫星</span><strong>${state.missionSatTitle}</strong></div>
          <div class="fact"><span>模式</span><strong>在轨测试</strong></div>
          <div class="fact"><span>链路</span><strong>UDP 主用</strong></div>
          <div class="fact"><span>协议</span><strong>F0-F7</strong></div>
        </div>
      </section>

      <section class="stat-grid">
        <article class="stat-tile"><span>连接状态</span><strong>3/3</strong><div class="delta">UDP 主用，TCP/串口备用</div></article>
        <article class="stat-tile"><span>协议规则</span><strong>${protocolRules.length}</strong><div class="delta">包头、包长、校验、Sheet 已配置</div></article>
        <article class="stat-tile"><span>遥测参数</span><strong>${parameters.length}</strong><div class="delta">重点收藏 ${state.favorites.size} 项</div></article>
        <article class="stat-tile"><span>刷新速率</span><strong>25fps</strong><div class="delta">Frame ${state.frame}</div></article>
      </section>

      <section class="mission-grid">
        <article class="view-surface">
          <div class="view-header">
            <div class="view-title">状态流<small>只保留连接、协议、遥测状态事件</small></div>
            <button class="ghost-button" data-view-shortcut="connection">查看连接</button>
          </div>
          <div class="event-panel-body">${eventRows(statusEvents)}</div>
        </article>
        <article class="view-surface">
          <div class="view-header">
            <div class="view-title">工作区结构<small>根据 MD 文档：任务驱动、顶部切换、Dock 信息面板</small></div>
          </div>
          <div class="event-panel-body">
            ${serviceRow("顶部任务栏", "嵌入 WS / UDP / Frame / UTC 状态", "ok")}
            ${serviceRow("遥测摘要栏", "重点参数常驻左侧 Dock", "ok")}
            ${serviceRow("主工作区", "连接、协议、表格、曲线、指令独立切换", "ok")}
            ${serviceRow("遥测详情", "在表格行内查看当前值、状态和源码", "ok")}
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderConnection() {
  const udp = state.udpBridge;
  const last = udp.lastPacket;
  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">连接管理<small>保留串口 / TCP / UDP 能力，但以值守面板呈现</small></div>
          <div class="header-actions">
            <button class="ghost-button">检测链路</button>
            <button class="primary-button">应用配置</button>
          </div>
        </div>
        <div class="connection-grid">
          ${links.map(linkCard).join("")}
        </div>
      </section>

      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">UDP 接收验证<small>浏览器通过本机桥接服务查看 UDP 数据</small></div>
          <div class="header-actions">
            <span class="tag ${udp.connected ? "ok" : udp.available ? "warn" : ""}">${udp.connected ? "SSE 已连接" : udp.available ? "等待数据" : "未启动桥接服务"}</span>
          </div>
        </div>
        <div class="udp-monitor">
          <div class="udp-stats">
            ${metric("监听端口", udp.udpPorts && udp.udpPorts.length ? `${udp.udpPorts[0]}-${udp.udpPorts[udp.udpPorts.length - 1]}` : "--")}
            ${metric("累计包数", udp.total)}
            ${metric("最近入口", last ? `端口 ${last.listenPort} / Sheet ${last.sheetIndex}` : "--")}
            ${metric("最近长度", last ? `${last.length} byte` : "--")}
          </div>
          <div class="source-block">${last ? last.hex : "启动 tools/udp_web_server.py 后，向本机 UDP 7101-7108 发送数据，这里会显示最近包的 HEX。"}</div>
          <div class="port-map">
            ${renderUdpPortStats()}
          </div>
          <div class="udp-history">
            ${udp.history
              .slice(0, 6)
              .map(
                (packet) => `
                  <article class="udp-row">
                    <time>${packet.time.slice(11, 19)}</time>
                    <strong>${packet.sourceIp}:${packet.sourcePort}</strong>
                    <span>Sheet ${packet.sheetIndex} / ${packet.listenPort}</span>
                    <code>${packet.hex}</code>
                  </article>
                `,
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">连接参数<small>面向局域网多工作站，不做传统软件弹窗</small></div>
        </div>
        <div class="config-grid">
          <label class="config-field"><span>连接类型</span><select class="field"><option>UDP 主用</option><option>TCP 服务端</option><option>串口采集</option></select></label>
          <label class="config-field"><span>本地端口</span><input class="field" value="7101-7108" /></label>
          <label class="config-field"><span>目标地址</span><input class="field" value="192.168.11.166" /></label>
          <label class="config-field"><span>工作站刷新</span><input class="field" value="25fps" /></label>
          <label class="config-field"><span>串口参数</span><input class="field" value="COM3 / 115200 / 8N1" /></label>
          <label class="config-field"><span>心跳阈值</span><input class="field" value="3s" /></label>
        </div>
      </section>
    </div>
  `;
}

function renderProtocol() {
  const selected = protocolRules.find((rule) => rule.id === state.selectedRuleId) || protocolRules[0];
  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">协议配置<small>对应桌面端包头、包长、校验、端口、Sheet、端序规则</small></div>
          <div class="header-actions">
            <button class="ghost-button">从遥测表同步</button>
            <button class="primary-button">保存规则</button>
          </div>
        </div>
        <div class="protocol-grid">
          <aside class="rule-list">
            ${protocolRules
              .map(
                (rule) => `
                  <button class="rule-item ${rule.id === selected.id ? "active" : ""}" data-rule="${rule.id}">
                    <strong>${rule.id}</strong>
                    <span>${rule.header} · ${rule.length} byte · Sheet ${rule.sheet}</span>
                  </button>
                `,
              )
              .join("")}
          </aside>
          <section class="protocol-form">
            <div class="config-grid">
              <label class="config-field"><span>启用</span><select class="field"><option>${selected.enabled ? "启用" : "停用"}</option><option>启用</option><option>停用</option></select></label>
              <label class="config-field"><span>包头 HEX</span><input class="field" value="${selected.header}" /></label>
              <label class="config-field"><span>包长 byte</span><input class="field" value="${selected.length}" /></label>
              <label class="config-field"><span>校验方式</span><select class="field"><option>${selected.checksum}</option><option>关闭</option><option>XOR</option><option>SUM</option><option>None</option></select></label>
              <label class="config-field"><span>监听端口</span><input class="field" value="${selected.port}" /></label>
              <label class="config-field"><span>Sheet 序号</span><input class="field" value="${selected.sheet}" /></label>
              <label class="config-field"><span>协议类型</span><input class="field" value="${selected.type}" /></label>
              <label class="config-field"><span>数值端序</span><select class="field"><option>${selected.endian}</option><option>大端</option><option>小端</option></select></label>
            </div>
            <div class="source-block">示例帧：
${selected.header} 00 02 01 7A 22 01 00 0D 22 02 FF EC
校验：${selected.checksum}
目标 Sheet：${selected.sheet}</div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function getRuleBySheet(sheetIndex) {
  return protocolRules.find((rule) => Number(rule.sheet) === Number(sheetIndex)) || { port: "", sheet: sheetIndex };
}

function getSheetDefinition(sheetIndex) {
  return state.sheetDefinitions[String(sheetIndex)] || [];
}

function getSheetStat(sheetIndex) {
  const rule = getRuleBySheet(sheetIndex);
  return (
    state.sheetStats.find((item) => Number(item.sheetIndex) === Number(sheetIndex)) ||
    state.udpBridge.portStats.find((item) => Number(item.sheetIndex) === Number(sheetIndex)) || {
      listenPort: rule.port,
      sheetIndex,
      total: 0,
      lastTime: null,
      updatedCount: 0,
      definitionCount: getSheetDefinition(sheetIndex).length,
    }
  );
}

function telemetryStatus(value) {
  if (!value) return "正常";
  if (value === "遥测异常" || /异常|告警|超限|错误/.test(value)) return "告警";
  if (/关注|预警|关闭/.test(value)) return "关注";
  return value || "正常";
}

function mapDefinitionToRow(definition, sheetIndex) {
  const live = state.sheetLiveValues[String(sheetIndex)] && state.sheetLiveValues[String(sheetIndex)][definition.code];
  const statusText = live ? telemetryStatus(live.status) : "等待";
  return {
    index: definition.index,
    serialNo: definition.serialNo,
    waveNo: definition.waveNo,
    bitWidth: definition.bitWidth,
    code: definition.code,
    name: definition.name || definition.code,
    group: `Sheet ${sheetIndex}`,
    frame: `S${sheetIndex}`,
    value: live ? live.valueText : "—",
    unit: definition.unit || "",
    status: statusText === "等待" ? "关注" : statusText,
    raw: live ? String(live.raw) : "—",
    hex: live && live.raw != null ? Number(live.raw).toString(16).toUpperCase() : "—",
    formula: definition.formula,
    dataType: definition.dataType,
    normalValue: definition.normalValue,
    remark: definition.remark,
    updated: Boolean(live),
    updatedAt: live ? live.updatedAt : "",
  };
}

function getTelemetryRowsForSheet(sheetIndex) {
  const definitions = getSheetDefinition(sheetIndex);
  if (definitions.length) {
    return definitions.map((definition) => mapDefinitionToRow(definition, sheetIndex));
  }
  return parameters.map((param, index) => ({
    index,
    serialNo: index + 1,
    waveNo: param.waveNo || param.frame || "",
    bitWidth: param.bitWidth || "",
    ...param,
  }));
}

function getActiveTelemetryRows() {
  let rows = getTelemetryRowsForSheet(state.activeSheet);
  const view = state.tableViews.find((item) => item.id === state.activeTableViewId);
  if (view) {
    rows = rows.filter((row) => Number(view.sheet) === Number(state.activeSheet) && view.codes.includes(row.code));
  }
  return rows;
}

function getFilteredTelemetryRows() {
  return getActiveTelemetryRows().filter((param) => {
    const keyword = state.tableSearch.trim().toLowerCase();
    const matchText =
      !keyword ||
      [param.code, param.name, param.group, param.frame, param.waveNo, param.remark, param.formula]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    if (state.dataFilter === "告警") return matchText && (param.status === "告警" || param.status === "关注");
    if (state.dataFilter === "收藏") return matchText && state.favorites.has(param.code);
    return matchText;
  });
}

function getSelectedTelemetryParam() {
  return getActiveTelemetryRows().find((item) => item.code === state.selectedParamCode) || null;
}

function getAllTelemetryRows() {
  const rows = [];
  protocolRules.forEach((rule) => rows.push(...getTelemetryRowsForSheet(rule.sheet)));
  return rows.length ? rows : parameters;
}

function buildCurveChannelGroups() {
  const keyword = state.curveSearch.trim().toLowerCase();
  const sheetGroups = protocolRules
    .map((rule) => {
      const rows = getTelemetryRowsForSheet(rule.sheet)
        .filter((row) => {
          if (!keyword) return true;
          return [row.code, row.name, row.group, row.waveNo].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
        })
        .filter((row) => row.code)
        .map((row) => ({
          code: row.code,
          name: `${row.code} ${row.name}`,
          unit: row.unit || "",
          value: parseNumber(row.value),
          color: colorForCode(row.code),
        }));
      return { name: `Sheet ${rule.sheet} / ${rule.port}`, items: rows };
    })
    .filter((group) => group.items.length);
  return sheetGroups.length ? sheetGroups : telemetryGroups;
}

function parseNumber(value) {
  const num = parseFloat(String(value).replace(/[^\d.+\-eE]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function colorForCode(code) {
  const palette = ["#5B7CFA", "#3DD9B4", "#FFB020", "#00C2FF", "#9B8CFF", "#FF6B9A", "#2FD47A", "#FF5A65"];
  let hash = 0;
  String(code || "").split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  });
  return palette[hash % palette.length];
}

function pushCurvePoint(code, value, time) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  if (!state.curveBuffers[code]) state.curveBuffers[code] = [];
  state.curveBuffers[code].push({ time: time || Date.now(), value: numeric });
  if (state.curveBuffers[code].length > 180) {
    state.curveBuffers[code].splice(0, state.curveBuffers[code].length - 180);
  }
}

function getCurveSeries() {
  const rowsByCode = new Map(getAllTelemetryRows().map((row) => [row.code, row]));
  return [...state.channels].map((code, index) => {
    const row = rowsByCode.get(code) || telemetryGroups.flatMap((group) => group.items).find((item) => item.code === code) || { code, name: code, value: 0 };
    const buffer = state.curveBuffers[code] || [];
    return {
      code,
      name: row.name || code,
      color: row.color || colorForCode(code),
      points: buffer.length ? buffer.map((point) => point.value) : syntheticPoints(index).map((point) => point * (index + 1)),
    };
  });
}

function syntheticPoints(seriesIndex) {
  return Array.from({ length: 80 }, (_, i) => {
    const t = (i + state.chartTick * 0.35) / 7;
    const wave = Math.sin(t + seriesIndex * 0.8) * 0.18 + Math.cos(t * 0.43 + seriesIndex) * 0.1;
    const bump = Math.exp(-Math.pow(i - 48 - seriesIndex * 3, 2) / 120) * 0.32;
    return 0.52 + wave + bump * (seriesIndex % 2 ? -0.7 : 1);
  });
}

function normalizePoints(points) {
  if (!points.length) return syntheticPoints(0);
  if (points.length === 1) return Array.from({ length: 80 }, () => 0.5);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || Math.max(Math.abs(max), 1);
  const normalized = points.map((value) => 0.18 + ((value - min) / span) * 0.64);
  if (normalized.length >= 80) return normalized.slice(-80);
  const padded = Array.from({ length: 80 - normalized.length }, () => normalized[0]);
  return [...padded, ...normalized];
}

function renderTelemetryTable() {
  const activeRows = getActiveTelemetryRows();
  const sourceRows = activeRows.length ? activeRows : (state.liveTelemetry.length ? state.liveTelemetry : parameters);
  const rows = sourceRows.filter((param) => {
    const keyword = state.tableSearch.trim().toLowerCase();
    const matchText =
      !keyword ||
      [param.code, param.name, param.group, param.frame, param.waveNo, param.remark, param.formula]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    if (state.dataFilter === "告警") return param.status === "告警" || param.status === "关注";
    if (state.dataFilter === "收藏") return state.favorites.has(param.code);
    return matchText;
  });
  const sheetStat = getSheetStat(state.activeSheet);
  const selectedView = state.tableViews.find((view) => view.id === state.activeTableViewId);

  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">遥测表格<small>端口 7101-7108 分别对应 Sheet0-Sheet7，支持刷新可视化、添加表格和添加曲线</small></div>
          <div class="header-actions">
            <button class="ghost-button" data-add-table>添加表格</button>
            <button class="ghost-button" data-add-curve>添加曲线</button>
            <button class="ghost-button" data-refresh-defs>刷新定义</button>
          </div>
        </div>
        <div class="sheet-tabs">
          ${protocolRules
            .map((rule) => {
              const stat = getSheetStat(rule.sheet);
              const count = getSheetDefinition(rule.sheet).length || stat.definitionCount || 0;
              return `
                <button class="sheet-tab ${Number(rule.sheet) === Number(state.activeSheet) ? "active" : ""} ${stat.total > 0 ? "live" : ""}" data-sheet="${rule.sheet}">
                  <strong>Sheet ${rule.sheet}</strong>
                  <span>${rule.port}</span>
                  <em>${count} 项 / ${stat.total || 0} 包</em>
                </button>
              `;
            })
            .join("")}
        </div>
        <div class="table-status-line">
          <span class="tag ${sheetStat.total > 0 ? "ok" : "warn"}">${sheetStat.total > 0 ? "正在刷新" : "等待 UDP"}</span>
          <span>端口 ${getRuleBySheet(state.activeSheet).port || "--"} · Sheet ${state.activeSheet}</span>
          <span>定义 ${getSheetDefinition(state.activeSheet).length || sheetStat.definitionCount || sourceRows.length} 项</span>
          <span>本 Sheet 包数 ${sheetStat.total || 0}</span>
          <span>最近更新 ${formatTimeText(sheetStat.lastTime)}</span>
          ${selectedView ? `<span>当前表格：${selectedView.name}</span>` : ""}
        </div>
        <div class="data-toolbar">
          <input class="search-box" id="paramSearch" value="${escapeAttr(state.tableSearch)}" placeholder="搜索参数、代号、分组、路序、公式" />
          <div class="segmented" aria-label="参数筛选">
            ${["全部", "告警", "收藏"].map((filter) => `<button class="segment ${state.dataFilter === filter ? "active" : ""}" data-data-filter="${filter}">${filter}</button>`).join("")}
          </div>
          <div class="segmented table-view-tabs" aria-label="自定义表格">
            <button class="segment ${!state.activeTableViewId ? "active" : ""}" data-table-view="">整表</button>
            ${state.tableViews.map((view) => `<button class="segment ${state.activeTableViewId === view.id ? "active" : ""}" data-table-view="${view.id}">${view.name}</button>`).join("")}
          </div>
        </div>
        <div class="data-grid">
          <aside class="favorite-rail">
            <h3>快捷参数</h3>
            <div class="favorite-list">
              ${sourceRows
                .filter((param) => state.favorites.has(param.code) || state.channels.has(param.code))
                .slice(0, 24)
                .map((param) => `<div class="favorite-item" data-param-card="${param.code}"><span>★ ${param.name}</span><strong>${param.value}${param.unit}</strong></div>`)
                .join("")}
            </div>
          </aside>
          <section class="table-wrap">
            <h3>Sheet ${state.activeSheet} 遥测大表 <small>${rows.length}/${sourceRows.length} 行</small></h3>
            <table class="param-table">
              <thead>
                <tr><th style="width:46px"></th><th>序号</th><th>路序</th><th>参数代号</th><th>参数名称</th><th>当前值</th><th>单位</th><th>状态</th><th>十六进制</th><th>公式</th><th>类型</th></tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (param) => `
                      <tr class="${param.code === state.selectedParamCode ? "selected-row" : ""} ${param.updated ? "fresh-row" : ""}" data-param-row="${param.code}">
                        <td><button class="star-button ${state.favorites.has(param.code) ? "active" : ""}" data-fav="${param.code}">★</button></td>
                        <td>${param.serialNo || param.index + 1 || ""}</td>
                        <td>${param.waveNo || ""}</td>
                        <td>${param.code}</td>
                        <td>${param.name}</td>
                        <td>${param.value}${param.unit ? ` ${param.unit}` : ""}</td>
                        <td>${param.unit || ""}</td>
                        <td><span class="tag ${param.status === "告警" ? "danger" : param.status === "关注" ? "warn" : "ok"}">${param.status}</span></td>
                        <td>${param.raw}</td>
                        <td>${param.formula || ""}</td>
                        <td>${param.dataType || ""}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderCurve() {
  const channelRows = buildCurveChannelGroups();
  return `
    <div class="view split-grid">
      <section class="view-surface channel-picker">
        <div class="view-header compact-head">
          <div class="view-title">曲线通道<small>可从遥测表格添加，也可在这里勾选 Sheet 参数</small></div>
          <button class="ghost-button" data-add-active-sheet-curve>添加当前 Sheet</button>
        </div>
        <input class="search-box" id="channelSearch" value="${escapeAttr(state.curveSearch)}" placeholder="搜索通道、代号、Sheet" />
        <div class="channel-groups">
          ${channelRows
            .map(
              (group) => `
                <div class="channel-group">
                  <h3>${group.name}</h3>
                  ${group.items
                    .map(
                      (item) => `
                        <label class="check-row" data-channel-row="${item.code}">
                          <span>${item.name}</span>
                          <input type="checkbox" data-channel="${item.code}" ${state.channels.has(item.code) ? "checked" : ""} />
                        </label>
                      `,
                    )
                    .join("")}
                </div>
              `,
            )
            .join("")}
        </div>
      </section>

      <section class="trend-stack">
        <article class="view-surface chart-wrap">
          <div class="chart-meta">
            <span>实时曲线区 / Mission 风格低疲劳曲线</span>
            <span>25fps · ${state.channels.size} 通道</span>
          </div>
          <canvas id="trendCanvas" width="1200" height="420"></canvas>
        </article>
        <article class="view-surface">
          <div class="view-header">
            <div class="view-title">当前值卡片流<small>曲线下方直接看当前值</small></div>
          </div>
          <div class="value-strip">${valueCards()}</div>
        </article>
      </section>
    </div>
  `;
}

function renderCommandCenter() {
  const categories = ["全部", "星上指令", "动力学指令", "参数上注"];
  const filtered = commands.filter((command) => {
    const keyword = state.commandFilter.trim().toLowerCase();
    const matchCategory = state.commandCategory === "全部" || command.category === state.commandCategory;
    const matchText =
      !keyword ||
      command.id.toLowerCase().includes(keyword) ||
      command.name.toLowerCase().includes(keyword) ||
      command.category.toLowerCase().includes(keyword) ||
      command.node.toLowerCase().includes(keyword);
    return matchCategory && matchText;
  });

  return `
    <div class="view">
      <section class="view-surface">
        <div class="view-header">
          <div class="view-title">指令控制<small>卡片流 + 右侧详情，不做旧软件的左右表单界面</small></div>
          <div class="header-actions">
            <button class="ghost-button">导入指令表</button>
            <button class="primary-button">发送确认</button>
          </div>
        </div>
        <div class="command-toolbar">
          <input class="search-box" id="commandSearch" value="${state.commandFilter}" placeholder="搜索 K2001、飞轮、节点、上注" />
          <div class="segmented">
            ${categories.map((category) => `<button class="segment ${state.commandCategory === category ? "active" : ""}" data-command-category="${category}">${category}</button>`).join("")}
          </div>
        </div>
        <div class="command-grid">
          ${filtered
            .map(
              (command) => `
                <article class="command-card ${command.id === state.selectedCommandId ? "selected" : ""}" data-command-card="${command.id}">
                  <header>
                    <h3>${command.id}</h3>
                    <span class="tag accent">${command.category}</span>
                  </header>
                  <p>${command.name}</p>
                  <p>${command.desc}</p>
                  <footer>
                    <span class="tag">UDP:${command.port}</span>
                    <button class="send-mini" data-send="${command.id}">发送</button>
                  </footer>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function bindViewActions() {
  document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.viewShortcut;
      renderNavigation();
      renderView();
    });
  });

  document.querySelectorAll("[data-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRuleId = button.dataset.rule;
      renderView();
    });
  });

  document.querySelectorAll("[data-data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dataFilter = button.dataset.dataFilter;
      renderView();
    });
  });

  document.querySelectorAll("[data-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSheet = Number(button.dataset.sheet);
      state.activeTableViewId = "";
      const rows = getActiveTelemetryRows();
      if (rows[0]) state.selectedParamCode = rows[0].code;
      renderView();
    });
  });

  document.querySelectorAll("[data-table-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTableViewId = button.dataset.tableView;
      const rows = getActiveTelemetryRows();
      if (rows[0]) state.selectedParamCode = rows[0].code;
      renderView();
    });
  });

  const addTableButton = document.querySelector("[data-add-table]");
  if (addTableButton) {
    addTableButton.addEventListener("click", () => {
      const rows = getFilteredTelemetryRows().slice(0, 80);
      const id = `table-${Date.now()}`;
      state.tableViews.push({
        id,
        name: `表格${state.tableViews.length + 1}`,
        sheet: state.activeSheet,
        codes: rows.map((row) => row.code),
      });
      state.activeTableViewId = id;
      appendStatusEvent(`已添加 Sheet ${state.activeSheet} 自定义表格`, `${rows.length} 个遥测参数`);
      renderView();
    });
  }

  const addCurveButton = document.querySelector("[data-add-curve]");
  if (addCurveButton) {
    addCurveButton.addEventListener("click", () => {
      const selected = getSelectedTelemetryParam();
      const rows = selected ? [selected] : getFilteredTelemetryRows().slice(0, 6);
      rows.forEach((row) => state.channels.add(row.code));
      state.activeView = "curve";
      appendStatusEvent("已添加遥测曲线", rows.map((row) => row.code).join(", "));
      renderNavigation();
      renderView();
    });
  }

  const refreshDefsButton = document.querySelector("[data-refresh-defs]");
  if (refreshDefsButton) {
    refreshDefsButton.addEventListener("click", () => {
      loadTelemetryDefinitions(true);
    });
  }

  document.querySelectorAll("[data-fav]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const code = button.dataset.fav;
      if (state.favorites.has(code)) state.favorites.delete(code);
      else state.favorites.add(code);
      renderView();
    });
  });

  document.querySelectorAll("[data-param-row], [data-param-card]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedParamCode = row.dataset.paramRow || row.dataset.paramCard;
      renderView();
    });
  });

  document.querySelectorAll("[data-channel]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.channels.add(input.dataset.channel);
      else state.channels.delete(input.dataset.channel);
      renderView();
    });
  });

  const addActiveSheetCurve = document.querySelector("[data-add-active-sheet-curve]");
  if (addActiveSheetCurve) {
    addActiveSheetCurve.addEventListener("click", () => {
      const rows = getTelemetryRowsForSheet(state.activeSheet).slice(0, 12);
      rows.forEach((row) => state.channels.add(row.code));
      appendStatusEvent(`已添加 Sheet ${state.activeSheet} 曲线组`, rows.map((row) => row.code).join(", "));
      renderView();
    });
  }

  const channelSearch = $("#channelSearch");
  if (channelSearch) {
    channelSearch.addEventListener("input", () => {
      state.curveSearch = channelSearch.value;
      filterRows("[data-channel-row]", channelSearch.value, "flex");
    });
  }

  const paramSearch = $("#paramSearch");
  if (paramSearch) {
    paramSearch.addEventListener("input", () => {
      state.tableSearch = paramSearch.value;
      renderView();
      const nextInput = $("#paramSearch");
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    });
  }

  const commandSearch = $("#commandSearch");
  if (commandSearch) {
    commandSearch.addEventListener("input", () => {
      state.commandFilter = commandSearch.value;
      renderView();
      const nextInput = $("#commandSearch");
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    });
  }

  document.querySelectorAll("[data-command-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.commandCategory = button.dataset.commandCategory;
      renderView();
    });
  });

  document.querySelectorAll("[data-command-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedCommandId = card.dataset.commandCard;
      renderView();
    });
  });

  document.querySelectorAll("[data-send]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedCommandId = button.dataset.send;
      appendStatusEvent(`${button.dataset.send} 已进入发送确认`);
      renderView();
    });
  });
}

function bindGlobalActions() {
  $("#collapseSummary").addEventListener("click", () => {
    state.summaryCollapsed = !state.summaryCollapsed;
    $("#summaryList").closest(".dock-panel").classList.toggle("collapsed", state.summaryCollapsed);
  });
  $("#ackAllBtn").addEventListener("click", () => appendStatusEvent("告警面板已确认"));
}

function eventRows(rows) {
  return rows
    .map(
      (event) => `
        <article class="event-row">
          <time>${event.time.slice(0, 5)}</time>
          <div class="event-icon ${event.type === "danger" ? "danger" : event.type === "warning" ? "warning" : ""}">${eventIcon(event.type)}</div>
          <p>${event.text}</p>
          <span class="tag ${event.type === "danger" ? "danger" : event.type === "warning" ? "warn" : event.type === "success" ? "ok" : ""}">${event.type === "success" ? "正常" : event.type === "warning" ? "关注" : event.type === "danger" ? "严重" : "信息"}</span>
        </article>
      `,
    )
    .join("");
}

function serviceRow(name, detail, status) {
  return `
    <article class="event-row">
      <time>${status.toUpperCase()}</time>
      <i class="dot ${status === "ok" ? "ok" : status === "warn" ? "warn" : "danger"}"></i>
      <p>${name}</p>
      <span class="tag ${status === "ok" ? "ok" : status === "warn" ? "warn" : "danger"}">${detail}</span>
    </article>
  `;
}

function linkCard(link) {
  return `
    <article class="link-card">
      <header>
        <div>
          <strong>${link.name}</strong>
          <span>${link.mode}</span>
        </div>
        <span class="tag ${link.status === "ok" ? "ok" : "warn"}">${link.status === "ok" ? "在线" : "待机"}</span>
      </header>
      <div class="link-metrics">
        ${metric("本地", link.local)}
        ${metric("远端", link.remote)}
        ${metric("速率", link.rate)}
        ${metric("丢包", link.loss)}
      </div>
    </article>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderUdpPortStats() {
  const stats = state.udpBridge.portStats && state.udpBridge.portStats.length
    ? state.udpBridge.portStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastPacket: null,
      }));

  return stats
    .map(
      (item) => `
        <article class="port-pill ${item.total > 0 ? "active" : ""}">
          <strong>${item.listenPort}</strong>
          <span>Sheet ${item.sheetIndex}</span>
          <em>${item.total} 包</em>
        </article>
      `,
    )
    .join("");
}

function valueCards() {
  const liveRows = getAllTelemetryRows().filter((item) => state.channels.has(item.code));
  if (liveRows.length) {
    return liveRows
      .slice(0, 8)
      .map(
        (item) => `
          <article class="value-card" data-param-card="${item.code}">
            <span>${item.code}</span>
            <strong style="color:${colorForCode(item.code)}">${item.value}${item.unit ? ` ${item.unit}` : ""}</strong>
            <div class="mini-bar"><span style="width:72%; background:var(--teal)"></span></div>
          </article>
        `,
      )
      .join("");
  }

  const flat = telemetryGroups.flatMap((group) => group.items).filter((item) => state.channels.has(item.code));
  return flat
    .slice(0, 8)
    .map(
      (item) => `
        <article class="value-card" data-param-card="${item.code}">
          <span>${item.code}</span>
          <strong style="color:${item.color}">${formatValue(item.value)} ${item.unit}</strong>
          <div class="mini-bar"><span style="width:${Math.min(92, Math.abs(Number(item.value)) + 35)}%; background:${item.color}"></span></div>
        </article>
      `,
    )
    .join("");
}

function drawTrendChart() {
  const canvas = $("#trendCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const top = 40;
  const left = 52;
  const right = 28;
  const bottom = 38;
  const chartW = w - left - right;
  const chartH = h - top - bottom;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07090d";
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(37,46,66,.72)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const y = top + (chartH / 6) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 10; i += 1) {
    const x = left + (chartW / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, h - bottom);
    ctx.stroke();
  }

  ctx.fillStyle = "#76839b";
  ctx.font = "18px Microsoft YaHei, Segoe UI, sans-serif";
  ctx.fillText("实时遥测曲线", left, 24);
  ctx.font = "12px Consolas, monospace";
  ctx.fillText("T-60s", left, h - 12);
  ctx.fillText("NOW", w - right - 34, h - 12);

  getCurveSeries()
    .slice(0, 6)
    .forEach((item, seriesIndex) => {
      const rawPoints = item.points && item.points.length ? item.points : syntheticPoints(seriesIndex);
      const points = normalizePoints(rawPoints);
      const coords = points.map((value, i) => ({
        x: left + (chartW / (points.length - 1)) * i,
        y: top + chartH - clamp(value, 0.12, 0.88) * chartH,
      }));

      const gradient = ctx.createLinearGradient(0, top, 0, h - bottom);
      gradient.addColorStop(0, hexToRgba(item.color, 0.35));
      gradient.addColorStop(1, hexToRgba(item.color, 0));
      ctx.beginPath();
      coords.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.lineTo(coords[coords.length - 1].x, h - bottom);
      ctx.lineTo(coords[0].x, h - bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      coords.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const last = coords[coords.length - 1];
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

  state.chartTick += 1;
}

function appendStatusEvent(text, detail) {
  const time = new Date().toTimeString().slice(0, 8);
  statusEvents.unshift({ time, type: "success", text, detail: detail != null && detail !== "" ? detail : "本地 UI 状态事件" });
  renderTicker();
}

function filterRows(selector, keyword, visibleDisplay) {
  const k = keyword.trim().toLowerCase();
  document.querySelectorAll(selector).forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(k) ? visibleDisplay : "none";
  });
}

function eventIcon(type) {
  if (type === "success") return "✓";
  if (type === "warning") return "!";
  if (type === "danger") return "×";
  return "i";
}

function kv(key, value) {
  return `<div class="kv"><span>${key}</span><strong>${value}</strong></div>`;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTimeText(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 19) || String(value);
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatValue(value) {
  return Math.abs(value) < 1 ? Number(value).toFixed(3) : Number(value).toFixed(1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function startClock() {
  setInterval(() => {
    $("#utcClock").textContent = new Date().toISOString().slice(11, 19);
    state.frame += 25;
    $("#frameCounter").textContent = state.frame.toString();
    if (state.activeView === "curve") {
      drawTrendChart();
    }
  }, 1000);
}

function connectUdpBridge() {
  if (!window.location.protocol.startsWith("http")) {
    return;
  }

  fetch("/api/udp/status", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("UDP bridge unavailable");
      return response.json();
    })
    .then((snapshot) => {
      state.udpBridge.available = true;
      state.udpBridge.udpPort = snapshot.udpPort;
      state.udpBridge.udpPorts = snapshot.udpPorts || (snapshot.udpPort ? [snapshot.udpPort] : []);
      state.udpBridge.portStats = snapshot.portStats || [];
      state.udpBridge.parser = snapshot.parser || state.udpBridge.parser;
      state.udpBridge.total = snapshot.total || 0;
      state.udpBridge.lastPacket = snapshot.lastPacket || null;
      state.udpBridge.history = snapshot.history || [];
      state.sheetStats = snapshot.sheetStats || [];
      state.sheetLiveValues = snapshot.latestValues || {};
      syncPacketValues(snapshot.lastPacket);
      refreshUdpViews();
      loadTelemetryDefinitions(false);
      openUdpEventSource();
    })
    .catch(() => {
      state.udpBridge.available = false;
      refreshUdpViews();
    });
}

function openUdpEventSource() {
  if (!window.EventSource) return;

  const source = new EventSource("/api/udp/events");
  source.addEventListener("open", () => {
    state.udpBridge.connected = true;
    refreshUdpViews();
  });
  source.addEventListener("udp", (event) => {
    const packet = JSON.parse(event.data);
    state.udpBridge.available = true;
    state.udpBridge.connected = true;
    state.udpBridge.total = packet.total;
    state.udpBridge.lastPacket = packet;
    state.udpBridge.portStats = updatePortStats(state.udpBridge.portStats, packet);
    syncPacketValues(packet);
    if (packet.parsed && packet.parsed.values) {
      state.liveTelemetry = packet.parsed.values.map((item) => ({
        code: item.code,
        name: item.name,
        group: `Sheet ${packet.sheetIndex}`,
        frame: `S${packet.sheetIndex}`,
        value: item.valueText,
        unit: item.unit || "",
        status: item.status === "遥测异常" ? "告警" : item.status ? "正常" : "正常",
        raw: String(item.raw),
        waveNo: item.waveNo,
        formula: item.formula,
      }));
      if (!state.liveTelemetry.some((item) => item.code === state.selectedParamCode) && state.liveTelemetry[0]) {
        state.selectedParamCode = state.liveTelemetry[0].code;
      }
    }
    state.udpBridge.history = [packet, ...state.udpBridge.history.filter((item) => item.total !== packet.total)].slice(0, 20);
    appendStatusEvent(`端口 ${packet.listenPort} / Sheet ${packet.sheetIndex} 收到 UDP ${packet.length} byte`, `${packet.sourceIp}:${packet.sourcePort} · ${packet.hex}`);
    refreshUdpViews();
  });
  source.addEventListener("error", () => {
    state.udpBridge.connected = false;
    refreshUdpViews();
  });
}

function updatePortStats(portStats, packet) {
  const stats = portStats && portStats.length
    ? portStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastPacket: null,
      }));

  return stats.map((item) => {
    if (Number(item.listenPort) !== Number(packet.listenPort)) return item;
    return {
      ...item,
      total: Number(item.total || 0) + 1,
      lastPacket: packet,
      lastTime: packet.time,
      updatedCount: packet.updatedCount || (packet.parsed && packet.parsed.parsedCount) || 0,
    };
  });
}

function refreshUdpViews() {
  if (state.activeView === "curve") {
    return;
  }
  if (!["connection", "status", "table"].includes(state.activeView)) {
    return;
  }
  const now = Date.now();
  const elapsed = now - state.lastViewRefreshAt;
  if (elapsed >= 250) {
    state.lastViewRefreshAt = now;
    renderView();
    return;
  }
  if (state.refreshTimer) return;
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    state.lastViewRefreshAt = Date.now();
    if (["connection", "status", "table"].includes(state.activeView)) {
      renderView();
    }
  }, 250 - elapsed);
}

function syncPacketValues(packet) {
  if (!packet || packet.sheetIndex == null) return;
  if (!packet.parsed || !packet.parsed.values) return;
  const sheetKey = String(packet.sheetIndex);
  const nextValues = {};
  packet.parsed.values.forEach((item) => {
    nextValues[item.code] = { ...item, updatedAt: packet.time };
    pushCurvePoint(item.code, Number(item.value), Date.parse(packet.time) || Date.now());
  });
  state.sheetLiveValues = { ...state.sheetLiveValues, [sheetKey]: nextValues };
  state.sheetStats = updateSheetStats(state.sheetStats, packet);
}

function updateSheetStats(sheetStats, packet) {
  const stats = sheetStats && sheetStats.length
    ? sheetStats
    : protocolRules.map((rule) => ({
        listenPort: rule.port,
        sheetIndex: rule.sheet,
        total: 0,
        lastTime: null,
        updatedCount: 0,
        definitionCount: getSheetDefinition(rule.sheet).length,
      }));

  return stats.map((item) => {
    if (Number(item.sheetIndex) !== Number(packet.sheetIndex)) return item;
    return {
      ...item,
      listenPort: packet.listenPort,
      total: Number(item.total || 0) + 1,
      lastTime: packet.time,
      updatedCount: packet.updatedCount || (packet.parsed && packet.parsed.parsedCount) || 0,
      definitionCount: getSheetDefinition(packet.sheetIndex).length || item.definitionCount || 0,
    };
  });
}

function loadTelemetryDefinitions(showEvent) {
  if (!window.location.protocol.startsWith("http")) return Promise.resolve();
  return fetch("/api/telemetry/definitions", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("definitions unavailable");
      return response.json();
    })
    .then((payload) => {
      const next = {};
      (payload.sheets || []).forEach((sheet) => {
        next[String(sheet.sheetIndex)] = sheet.items || [];
      });
      state.sheetDefinitions = next;
      if (!getSheetDefinition(state.activeSheet).length && payload.sheets && payload.sheets[0]) {
        state.activeSheet = Number(payload.sheets[0].sheetIndex);
      }
      if (showEvent) appendStatusEvent("遥测大表定义已刷新", payload.meterFile || "");
      if (state.activeView === "table" || state.activeView === "curve" || state.activeView === "status") {
        renderView();
      }
    })
    .catch(() => {
      if (showEvent) appendStatusEvent("遥测定义接口不可用", "请确认 tools/udp_web_server.py 正在运行");
    });
}

window.UUSPACE_API = {
  state,
  parameters,
  commands,
  protocolRules,
  links,
  summaryItems,
  telemetryGroups,
  renderView,
  renderNavigation,
  renderDock,
  renderTicker,
  appendStatusEvent,
  connectUdpBridge,
};

init();
