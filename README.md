# UUSPACE Web 2.0

卫星地面综测 Web 端原型。界面按 `卫星综测Web端UI设计提示词.md` 的 Mission Workspace 风格设计，功能参考桌面版 `D:\UUSpace1.0.0\SateliteController`。

## 功能范围

- 连接管理：UDP 7101-7108 监听状态、最近报文、HEX、端口包数。
- 协议配置：S0-S7 包头、长度、端口、Sheet 映射展示。
- 遥测表格：每个 UDP 端口对应一个 Sheet 表格，支持 Sheet 切换、刷新状态、搜索、收藏、添加表格。
- 遥测曲线：从表格选中参数添加曲线，或在曲线页勾选 Sheet 参数。
- 状态总览：链路状态、告警、状态流。
- 指令控制：指令卡片、源码展示、发送确认入口。

不包含回放功能。

## 端口与 Sheet 映射

| UDP 端口 | Sheet |
| --- | --- |
| 7101 | Sheet0 |
| 7102 | Sheet1 |
| 7103 | Sheet2 |
| 7104 | Sheet3 |
| 7105 | Sheet4 |
| 7106 | Sheet5 |
| 7107 | Sheet6 |
| 7108 | Sheet7 |

默认 UDP 绑定 IP 为 `192.168.11.166`。如果本机没有这个地址，启动时把 UDP 绑定改为 `0.0.0.0`。

## 本机运行

在项目目录运行：

```powershell
python tools\udp_web_server.py --host 0.0.0.0 --http-port 8080 --udp-host 192.168.11.166 --udp-ports 7101-7108
```

如果报 IP 绑定失败：

```powershell
python tools\udp_web_server.py --host 0.0.0.0 --http-port 8080 --udp-host 0.0.0.0 --udp-ports 7101-7108
```

局域网访问：

```text
http://本机IP:8080/
```

## Docker 运行

```powershell
docker compose up --build
```

Docker 会暴露：

- `8080/tcp`
- `7101-7108/udp`

`docker-compose.yml` 默认挂载桌面版遥测大表目录：

```text
D:/UUSpace1.0.0/SateliteController/Dll/Meter:/meter:ro
```

## 验证 UDP 数据

打开网页后进入“连接管理”或“遥测表格”。向本机 UDP 7101-7108 任一端口发送数据后：

- 连接管理页会显示最近报文、来源、HEX。
- 对应 Sheet 标签会显示包数。
- 遥测表格顶部会显示最近更新时间和刷新状态。
- 如果报文长度与遥测大表路序匹配，当前值列会更新。

## 关键文件

- `index.html`：Web 页面骨架。
- `styles.css`：Mission Workspace 样式。
- `app.js`：前端状态、页面渲染、表格/曲线交互。
- `tools/udp_web_server.py`：静态 Web 服务、UDP 桥接、遥测大表解析。
- `开发对照表.md`：桌面版到 Web 版的功能/代码对应表。
- `DOCKER_DEPLOY.md`：Docker 部署说明。

## 检查命令

```powershell
node --check app.js
python -m py_compile tools\udp_web_server.py
```
