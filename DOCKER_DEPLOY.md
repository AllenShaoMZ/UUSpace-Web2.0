# UUSPACE Web Docker 部署

## 启动

在本目录执行：

```powershell
docker compose up --build
```

后台运行：

```powershell
docker compose up -d --build
```

打开：

```text
http://192.168.11.166:8080
```

## 端口

容器映射：

```text
8080/tcp        Web 页面
7101-7108/udp  遥测 UDP 监听
```

外部设备发送目标：

```text
192.168.11.166:7101  -> Sheet 0
192.168.11.166:7102  -> Sheet 1
192.168.11.166:7103  -> Sheet 2
192.168.11.166:7104  -> Sheet 3
192.168.11.166:7105  -> Sheet 4
192.168.11.166:7106  -> Sheet 5
192.168.11.166:7107  -> Sheet 6
192.168.11.166:7108  -> Sheet 7
```

## 遥测大表

`docker-compose.yml` 挂载了软件项目里的遥测大表目录：

```text
D:/UUSpace1.0.0/SateliteController/Dll/Meter:/meter:ro
```

容器内默认读取：

```text
/meter/卫星1遥测大表.xlsx
```

如果换表，修改 `Dockerfile` 的 `--meter-file` 或 compose 的启动命令。

## 常用命令

查看日志：

```powershell
docker compose logs -f
```

停止：

```powershell
docker compose down
```

本机发送 UDP 测试包：

```powershell
$u = New-Object System.Net.Sockets.UdpClient
$b = [byte[]](0xAA,0x01,0x02,0x03)
[void]$u.Send($b, $b.Length, "127.0.0.1", 7101)
$u.Close()
```

如果局域网访问不到，检查 Windows 防火墙是否放行 Docker Desktop / 相关端口。
