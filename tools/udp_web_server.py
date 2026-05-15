#!/usr/bin/env python3
"""Serve the static web UI and bridge UDP packets to the browser.

The browser cannot listen to UDP directly. This small zero-dependency server
listens for UDP datagrams, serves the current folder over HTTP, and exposes
received UDP packets through Server-Sent Events at /api/udp/events.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import queue
import re
import socket
import struct
import threading
import zipfile
from collections import deque
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Deque, Dict, List, Set
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


def utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def ascii_preview(data: bytes) -> str:
    return "".join(chr(b) if 32 <= b <= 126 else "." for b in data[:80])


def parse_float(value: str) -> float:
    text = (value or "").strip().replace(",", ".")
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_params(value: str) -> List[float]:
    text = (value or "").replace("；", "/").replace(";", "/").replace("\r", "/").replace("\n", "/")
    params: List[float] = []
    for part in text.split("/"):
        part = part.strip()
        if not part:
            continue
        try:
            params.append(float(part.replace(",", ".")))
        except ValueError:
            pass
    return params


def data_type_from_text(text: str, bit_width: int) -> int:
    value = (text or "").strip()
    if value == "有符号整数":
        return 2
    if value == "浮点数":
        if bit_width == 32:
            return 3
        if bit_width == 64:
            return 4
    return 1


def wave_to_index(wave_no: str):
    first = (wave_no or "").split("-", 1)[0]
    match = re.search(r"W(\d+)(?:B(\d+))?", first)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2) or 0)


def get_bit(value: int, index: int) -> bool:
    return ((value >> index) & 0x01) == 0x01


def get_save_bit_value(value: int, index: int, count: int) -> int:
    result = 0
    for i in range(count):
        if get_bit(value, index - i):
            result += 1 << ((count - 1) - i)
    return result


def read_uint(data: bytes, index: int, byte_width: int) -> int:
    if index < 0 or index + byte_width > len(data):
        raise IndexError("telemetry byte range out of packet")
    return int.from_bytes(data[index:index + byte_width], "big", signed=False)


def read_int(data: bytes, index: int, byte_width: int) -> int:
    if index < 0 or index + byte_width > len(data):
        raise IndexError("telemetry byte range out of packet")
    return int.from_bytes(data[index:index + byte_width], "big", signed=True)


@dataclass
class TelemetryItem:
    serial_no: str
    wave_no: str
    bit_width: int
    name: str
    code: str
    formula: str
    params: List[float]
    decimals: int
    unit: str
    normal_value: str
    remark: str
    data_type_text: str
    data_type: int
    data_index: int
    bit_index: int

    def to_definition(self, index: int) -> Dict:
        return {
            "index": index,
            "serialNo": self.serial_no,
            "waveNo": self.wave_no,
            "bitWidth": self.bit_width,
            "name": self.name,
            "code": self.code,
            "formula": self.formula,
            "params": self.params,
            "decimals": self.decimals,
            "unit": self.unit,
            "normalValue": self.normal_value,
            "remark": self.remark,
            "dataType": self.data_type_text,
            "dataIndex": self.data_index,
            "bitIndex": self.bit_index,
        }

    def update(self, payload: bytes) -> Dict:
        byte_width = self.bit_width // 8
        if self.bit_width % 8 != 0:
            byte_width += 1
        if byte_width <= 0:
            byte_width = 1

        raw_unsigned = read_uint(payload, self.data_index, byte_width)
        if self.bit_width % 8 != 0:
            if byte_width == 1:
                bit_value = get_save_bit_value(raw_unsigned, self.bit_index, self.bit_width)
            else:
                bit_value = get_save_bit_value(raw_unsigned, (byte_width * 8 - 1) - self.bit_index, self.bit_width)
        else:
            bit_value = raw_unsigned

        original = self.original_value(payload, bit_value)
        value = self.apply_formula(original)
        if math.isnan(value) or math.isinf(value):
            value = 0.0

        return {
            "code": self.code,
            "name": self.name,
            "waveNo": self.wave_no,
            "raw": bit_value,
            "value": round(value, self.decimals),
            "valueText": f"{value:.{self.decimals}f}",
            "unit": self.unit,
            "formula": self.formula,
            "dataType": self.data_type_text,
            "status": self.status_text(value),
        }

    def original_value(self, payload: bytes, bit_value: int) -> float:
        if self.data_type == 1:
            return float(bit_value)
        if self.data_type == 2:
            if self.bit_width in (8, 16, 24, 32):
                return float(read_int(payload, self.data_index, self.bit_width // 8))
            return float(bit_value)
        if self.data_type == 3:
            if self.data_index + 4 > len(payload):
                raise IndexError("float32 range out of packet")
            return float(struct.unpack(">f", payload[self.data_index:self.data_index + 4])[0])
        if self.data_type == 4:
            if self.data_index + 8 > len(payload):
                raise IndexError("float64 range out of packet")
            return float(struct.unpack(">d", payload[self.data_index:self.data_index + 8])[0])
        return float(bit_value)

    def apply_formula(self, original: float) -> float:
        if self.formula in ("Func0001", "Func0002", "Func0003", "Func0004"):
            return original
        if self.formula == "Func0007":
            value = original
            for _ in self.params:
                value *= self.params[0]
            return value
        if self.formula == "Func0005":
            return self.params[0] if self.params else original
        if self.formula == "Func0006":
            return -self.params[0] if self.params else original
        if self.formula == "Func0008":
            value = original
            for _ in self.params:
                if self.params[0] != 0:
                    value /= self.params[0]
            return value
        if self.formula == "Func0010" and len(self.params) > 1:
            return original * self.params[0] + self.params[1]
        return 0.0

    def status_text(self, value: float) -> str:
        text = (self.normal_value or "").strip()
        if not text:
            return ""
        normalized = text.replace("：", ":").replace("；", ";").replace("，", ",")
        for segment in re.split(r"[;,]", normalized):
            if ":" not in segment:
                continue
            raw_key, label = segment.split(":", 1)
            raw_key, label = raw_key.strip(), label.strip()
            try:
                key = int(raw_key, 16) if raw_key.lower().startswith("0x") else float(raw_key)
            except ValueError:
                continue
            if abs(value - key) <= max(1e-6, abs(float(key)) * 1e-6):
                return label
        return "遥测异常"


class XlsxTelemetryParser:
    NS = {
        "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }

    def __init__(self, meter_file: str, max_values: int = 0) -> None:
        self.meter_file = meter_file
        self.max_values = max_values
        self.sheet_items: Dict[int, List[TelemetryItem]] = {}
        if meter_file and os.path.exists(meter_file):
            self.load(meter_file)

    @property
    def enabled(self) -> bool:
        return bool(self.sheet_items)

    def load(self, meter_file: str) -> None:
        with zipfile.ZipFile(meter_file) as z:
            shared_strings = self.load_shared_strings(z)
            sheet_paths = self.load_sheet_paths(z)
            for sheet_name, path in sheet_paths.items():
                if not sheet_name.isdigit():
                    continue
                sheet_index = int(sheet_name)
                rows = self.load_rows(z, path, shared_strings)
                self.sheet_items[sheet_index] = self.items_from_rows(rows)

    def load_shared_strings(self, z: zipfile.ZipFile) -> List[str]:
        if "xl/sharedStrings.xml" not in z.namelist():
            return []
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        values = []
        for si in root.findall("m:si", self.NS):
            text = "".join((t.text or "") for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
            values.append(text)
        return values

    def load_sheet_paths(self, z: zipfile.ZipFile) -> Dict[str, str]:
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheet_paths = {}
        for sheet in workbook.find("m:sheets", self.NS):
            name = sheet.attrib["name"]
            rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_map[rid]
            sheet_paths[name] = "xl/" + target.lstrip("/")
        return sheet_paths

    def load_rows(self, z: zipfile.ZipFile, path: str, shared_strings: List[str]) -> List[List[str]]:
        root = ET.fromstring(z.read(path))
        rows: List[List[str]] = []
        for row in root.findall(".//m:row", self.NS):
            values: List[str] = []
            for cell in row.findall("m:c", self.NS):
                ref = cell.attrib.get("r", "A1")
                col = self.column_index(ref)
                while len(values) < col:
                    values.append("")
                value_node = cell.find("m:v", self.NS)
                value = "" if value_node is None else (value_node.text or "")
                if cell.attrib.get("t") == "s" and value:
                    value = shared_strings[int(value)]
                values.append(value)
            rows.append(values)
        return rows

    @staticmethod
    def column_index(ref: str) -> int:
        match = re.match(r"([A-Z]+)", ref)
        if not match:
            return 0
        result = 0
        for ch in match.group(1):
            result = result * 26 + ord(ch) - 64
        return result - 1

    def items_from_rows(self, rows: List[List[str]]) -> List[TelemetryItem]:
        items: List[TelemetryItem] = []
        for row in rows[1:]:
            if len(row) < 14:
                row = row + [""] * (14 - len(row))
            code = (row[2] or "").strip()
            if not code:
                continue
            index_pair = wave_to_index(row[1])
            if not index_pair:
                continue
            bit_width = int(parse_float(row[4]) * 8)
            if bit_width <= 0:
                continue
            data_index, bit_index = index_pair
            data_type_text = (row[10] or "").strip()
            items.append(
                TelemetryItem(
                    serial_no=row[0],
                    wave_no=row[1],
                    bit_width=bit_width,
                    name=(row[3] or "").strip(),
                    code=code,
                    formula=(row[6] or "").strip(),
                    params=parse_params(row[7]),
                    decimals=2,
                    unit=(row[11] or "").strip(),
                    normal_value=(row[12] or "").strip(),
                    remark=(row[13] or "").strip(),
                    data_type_text=data_type_text,
                    data_type=data_type_from_text(data_type_text, bit_width),
                    data_index=data_index,
                    bit_index=bit_index,
                )
            )
        return items

    def parse_packet(self, sheet_index: int, payload: bytes) -> Dict:
        items = self.sheet_items.get(sheet_index, [])
        parsed = []
        errors = 0
        for item in items:
            try:
                parsed.append(item.update(payload))
            except Exception:
                errors += 1
            if self.max_values > 0 and len(parsed) >= self.max_values:
                break
        return {
            "meterFile": self.meter_file,
            "sheetIndex": sheet_index,
            "totalDefinitions": len(items),
            "parsedCount": len(parsed),
            "errorCount": errors,
            "values": parsed,
        }

    def definitions_snapshot(self) -> Dict:
        return {
            "enabled": self.enabled,
            "meterFile": self.meter_file,
            "sheets": [
                {
                    "sheetIndex": sheet_index,
                    "count": len(items),
                    "items": [item.to_definition(index) for index, item in enumerate(items)],
                }
                for sheet_index, items in sorted(self.sheet_items.items())
            ],
        }


class UdpState:
    def __init__(self, udp_host: str, udp_ports: List[int], parser: XlsxTelemetryParser = None) -> None:
        self.udp_host = udp_host
        self.udp_ports = udp_ports
        self.parser = parser
        self.port_to_sheet = {port: index for index, port in enumerate(udp_ports)}
        self.port_stats = {
            port: {
                "listenPort": port,
                "sheetIndex": self.port_to_sheet[port],
                "total": 0,
                "lastPacket": None,
                "lastTime": None,
                "updatedCount": 0,
                "definitionCount": len(parser.sheet_items.get(self.port_to_sheet[port], [])) if parser else 0,
            }
            for port in udp_ports
        }
        self.latest_values: Dict[int, Dict[str, Dict]] = {}
        self.sheet_stats = {
            self.port_to_sheet[port]: {
                "listenPort": port,
                "sheetIndex": self.port_to_sheet[port],
                "total": 0,
                "lastTime": None,
                "updatedCount": 0,
                "definitionCount": len(parser.sheet_items.get(self.port_to_sheet[port], [])) if parser else 0,
            }
            for port in udp_ports
        }
        self.total = 0
        self.last_packet = None
        self.history: Deque[Dict] = deque(maxlen=80)
        self.subscribers: Set[queue.Queue] = set()
        self.lock = threading.Lock()

    def add_packet(self, data: bytes, addr, listen_port: int) -> Dict:
        with self.lock:
            self.total += 1
            sheet_index = self.port_to_sheet.get(listen_port)
            packet = {
                "time": utc_now(),
                "sourceIp": addr[0],
                "sourcePort": addr[1],
                "listenPort": listen_port,
                "sheetIndex": sheet_index,
                "length": len(data),
                "hex": data[:96].hex(" ").upper(),
                "ascii": ascii_preview(data),
                "total": self.total,
            }
            if self.parser and self.parser.enabled and sheet_index is not None:
                packet["parsed"] = self.parser.parse_packet(sheet_index, data)
                parsed_values = packet["parsed"].get("values", [])
                latest = {}
                for value in parsed_values:
                    code = value.get("code")
                    if code:
                        latest[code] = {**value, "updatedAt": packet["time"]}
                self.latest_values[sheet_index] = latest
                packet["updatedCount"] = len(parsed_values)
            self.last_packet = packet
            self.history.appendleft(packet)
            if listen_port in self.port_stats:
                self.port_stats[listen_port]["total"] += 1
                self.port_stats[listen_port]["lastPacket"] = packet
                self.port_stats[listen_port]["lastTime"] = packet["time"]
                self.port_stats[listen_port]["updatedCount"] = packet.get("updatedCount", 0)
            if sheet_index in self.sheet_stats:
                self.sheet_stats[sheet_index]["total"] += 1
                self.sheet_stats[sheet_index]["lastTime"] = packet["time"]
                self.sheet_stats[sheet_index]["updatedCount"] = packet.get("updatedCount", 0)
            subscribers = list(self.subscribers)

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(packet)
            except queue.Full:
                pass
        return packet

    def snapshot(self) -> Dict:
        with self.lock:
            return {
                "listening": True,
                "udpHost": self.udp_host,
                "udpPort": self.udp_ports[0] if self.udp_ports else None,
                "udpPorts": self.udp_ports,
                "portStats": list(self.port_stats.values()),
                "parser": {
                    "enabled": bool(self.parser and self.parser.enabled),
                    "meterFile": self.parser.meter_file if self.parser else "",
                    "sheetCounts": {str(k): len(v) for k, v in (self.parser.sheet_items.items() if self.parser else [])},
                },
                "sheetStats": list(self.sheet_stats.values()),
                "latestValues": {str(k): v for k, v in self.latest_values.items()},
                "total": self.total,
                "lastPacket": self.last_packet,
                "history": list(self.history),
            }

    def telemetry_definitions(self) -> Dict:
        with self.lock:
            if not self.parser:
                return {"enabled": False, "meterFile": "", "sheets": []}
            return self.parser.definitions_snapshot()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=120)
        with self.lock:
            self.subscribers.add(q)
            if self.last_packet:
                q.put_nowait(self.last_packet)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            self.subscribers.discard(q)


class UdpBridgeHandler(SimpleHTTPRequestHandler):
    udp_state: UdpState

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/udp/status":
            self.send_json(self.udp_state.snapshot())
            return
        if path == "/api/telemetry/definitions":
            self.send_json(self.udp_state.telemetry_definitions())
            return
        if path == "/api/udp/events":
            self.send_events()
            return
        super().do_GET()

    def send_json(self, payload: Dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.write(b": udp bridge connected\n\n")
        self.wfile.flush()

        q = self.udp_state.subscribe()
        try:
            while True:
                try:
                    packet = q.get(timeout=15)
                    data = json.dumps(packet, ensure_ascii=False)
                    self.wfile.write(f"event: udp\ndata: {data}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": heartbeat\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            self.udp_state.unsubscribe(q)


def udp_listener(state: UdpState, udp_port: int) -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((state.udp_host, udp_port))
    while True:
        data, addr = sock.recvfrom(65535)
        state.add_packet(data, addr, udp_port)


def parse_ports(value: str) -> List[int]:
    ports: List[int] = []
    for part in value.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_text, end_text = token.split("-", 1)
            start, end = int(start_text), int(end_text)
            ports.extend(range(start, end + 1))
        else:
            ports.append(int(token))
    return sorted(set(ports))


def main() -> None:
    parser = argparse.ArgumentParser(description="UUSPACE static web + UDP bridge")
    parser.add_argument("--root", default=os.getcwd(), help="static web root")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP bind host")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP port")
    parser.add_argument("--udp-host", default="192.168.11.166", help="UDP bind host")
    parser.add_argument("--udp-port", type=int, default=None, help="single UDP listen port")
    parser.add_argument("--udp-ports", default=None, help="UDP ports, e.g. 7101-7108 or 7101,7102")
    parser.add_argument(
        "--meter-file",
        default=r"D:\UUSpace1.0.0\SateliteController\Dll\Meter\卫星1遥测大表.xlsx",
        help="telemetry definition xlsx",
    )
    parser.add_argument("--max-values", type=int, default=0, help="max parsed values per UDP packet, 0 means all")
    args = parser.parse_args()

    os.chdir(args.root)
    udp_ports = parse_ports(args.udp_ports) if args.udp_ports else ([args.udp_port] if args.udp_port else list(range(7101, 7109)))
    parser_engine = XlsxTelemetryParser(args.meter_file, max_values=args.max_values)
    state = UdpState(args.udp_host, udp_ports, parser_engine)
    UdpBridgeHandler.udp_state = state

    for udp_port in udp_ports:
        threading.Thread(target=udp_listener, args=(state, udp_port), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.http_port), UdpBridgeHandler)

    print(f"HTTP: http://{args.host}:{args.http_port}")
    print(f"UDP : {args.udp_host}:{','.join(str(port) for port in udp_ports)}")
    print(f"Meter: {args.meter_file if parser_engine.enabled else 'disabled / not found'}")
    print("Open the HTTP URL from LAN clients, then send UDP packets to this machine.")
    server.serve_forever()


if __name__ == "__main__":
    main()
