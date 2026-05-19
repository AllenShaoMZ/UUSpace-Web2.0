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
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

_TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(_TOOLS_DIR)


def format_telemetry_display_value(value: float, sig_figs: int = 5) -> str:
    """Display string with sig_figs from first non-zero digit (Web MC default)."""
    if not math.isfinite(value):
        return "—"
    if value == 0:
        return "0"
    abs_v = abs(value)
    if abs_v >= 1e8:
        return f"{value:.3e}"
    order = math.floor(math.log10(abs_v))
    dec = max(0, sig_figs - 1 - int(order))
    rounded = float(f"{value:.12g}")
    return f"{rounded:.{dec}f}"


def resolve_project_root(root: str | None = None) -> str:
    candidate = os.path.abspath(root or PROJECT_ROOT)
    if os.path.isdir(os.path.join(candidate, "Meter")) or os.path.isdir(os.path.join(candidate, "Commad")):
        return candidate
    nested = os.path.join(candidate, "UUSpace-Web2.0")
    if os.path.isdir(os.path.join(nested, "Meter")) or os.path.isdir(os.path.join(nested, "Commad")):
        return nested
    return candidate


def default_meter_file(root: str) -> str:
    meter_dir = os.path.join(root, "Meter")
    if not os.path.isdir(meter_dir):
        return ""
    preferred = os.path.join(meter_dir, "卫星1遥测大表.xlsx")
    if os.path.exists(preferred):
        return preferred
    for filename in sorted(os.listdir(meter_dir)):
        if re.search(r"\.xlsx?$", filename, re.IGNORECASE):
            return os.path.join(meter_dir, filename)
    return ""


def utc_now() -> str:
    return dt.datetime.utcnow().isoformat(timespec="milliseconds") + "Z"


def ascii_preview(data: bytes) -> str:
    return "".join(chr(b) if 32 <= b <= 126 else "." for b in data[:80])


def iso_from_unix_seconds(value: float) -> str:
    if value is None or math.isnan(value) or math.isinf(value) or value <= 0:
        return utc_now()
    try:
        return dt.datetime.utcfromtimestamp(value).isoformat(timespec="milliseconds") + "Z"
    except (OverflowError, OSError, ValueError):
        return utc_now()


def looks_like_command_row(row: Dict) -> bool:
    if not isinstance(row, dict):
        return False
    return any(str(value).strip() for value in row.values())


def command_dir(root: str) -> str:
    preferred = os.path.join(root, "Command")
    if os.path.isdir(preferred):
        return preferred
    return os.path.join(root, "Commad")


def read_commands(root: str) -> Dict:
    json_path = os.path.join(command_dir(root), "commands.json")
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        commands = payload.get("commands", payload if isinstance(payload, list) else [])
        if isinstance(commands, list):
            commands = [row for row in commands if looks_like_command_row(row)]
        return {
            "source": payload.get("source", "commands.json") if isinstance(payload, dict) else "commands.json",
            "commands": commands,
        }
    return {"source": "", "commands": []}


def read_protocol(root: str, udp_state=None) -> Dict:
    protocol_path = os.path.join(root, "config", "protocol.json")
    payload: Dict = {}
    if os.path.exists(protocol_path):
        with open(protocol_path, "r", encoding="utf-8") as f:
            try:
                payload = json.load(f) or {}
            except json.JSONDecodeError:
                payload = {}
    if not isinstance(payload, dict):
        payload = {}
    fallback_rules = [
        {
            "id": f"S{index}",
            "enabled": True,
            "header": "",
            "length": 0,
            "checksum": "关闭",
            "port": port,
            "sheet": index,
            "type": "1",
            "endian": "大端",
        }
        for index, port in enumerate(udp_state.udp_ports if udp_state else range(7101, 7109))
    ]
    rules = payload.get("rules")
    if not isinstance(rules, list) or len(rules) == 0:
        payload["rules"] = fallback_rules
    if udp_state is not None:
        payload.setdefault("bindHost", udp_state.udp_host)
    for rule in payload.get("rules", []):
        if isinstance(rule, dict) and rule.get("checksum") in (None, "None", "none"):
            rule["checksum"] = "关闭"
    payload["websocketPath"] = ""
    payload.setdefault("eventSourcePath", "/api/udp/events")
    payload.setdefault("bridge", "sse")
    return payload


def list_meter_workbooks(root: str) -> List[Dict]:
    meter_dir = os.path.join(root, "Meter")
    if not os.path.isdir(meter_dir):
        return []
    preferred_name = "卫星1遥测大表.xlsx"
    workbooks = []
    for filename in sorted(os.listdir(meter_dir)):
        if not re.search(r"\.xlsx?$", filename, re.IGNORECASE):
            continue
        workbooks.append(
            {
                "id": os.path.splitext(filename)[0],
                "filename": filename,
                "path": f"/api/meter/{filename}",
            }
        )
    workbooks.sort(key=lambda item: (0 if item["filename"] == preferred_name else 1, item["filename"]))
    return workbooks


def read_meter_workbook(root: str, filename: str) -> Dict:
    meter_dir = os.path.join(root, "Meter")
    safe_name = os.path.basename(filename)
    meter_file = os.path.join(meter_dir, safe_name)
    if not os.path.exists(meter_file):
        raise FileNotFoundError(f"找不到文件: {safe_name}")
    parser = XlsxTelemetryParser("", max_values=0)
    with zipfile.ZipFile(meter_file) as z:
        shared_strings = parser.load_shared_strings(z)
        sheet_paths = parser.load_sheet_paths(z)
        if not sheet_paths:
            return {"sheetName": "", "headers": [], "rows": []}
        sheet_name, path = next(iter(sheet_paths.items()))
        rows = parser.load_rows(z, path, shared_strings)
    headers = [str(cell).strip() for cell in (rows[0] if rows else [])]
    data: List[Dict] = []
    for row in rows[1:]:
        if not row or not any(str(cell).strip() for cell in row):
            continue
        obj = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            obj[header] = row[index] if index < len(row) else ""
        data.append(obj)
    return {"sheetName": sheet_name, "headers": headers, "rows": data}


def read_cmdchain(root: str) -> List[Dict]:
    fp = os.path.join(command_dir(root), "cmdchain.txt")
    if not os.path.exists(fp):
        return []
    chains: List[Dict] = []
    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            parts = line.split("\t")
            chains.append(
                {
                    "category": parts[0] if len(parts) > 0 else "",
                    "name": parts[1] if len(parts) > 1 else "",
                    "commandIds": [item.strip() for item in (parts[2] if len(parts) > 2 else "").split(",") if item.strip()],
                    "weight": parts[3] if len(parts) > 3 else "",
                }
            )
    return chains


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


def wave_token_abs_bit(token: str) -> int:
    """路序绝对位号（MSB=7，与桌面 BitConverterHelper 一致）。"""
    match = re.search(r"W(\d+)(?:B(\d+))?", (token or "").strip())
    if not match:
        raise ValueError(f"invalid wave token: {token!r}")
    byte_i = int(match.group(1))
    bit_i = int(match.group(2) or 0)
    return byte_i * 8 + (7 - bit_i)


def wave_range_abs_bits(wave_no: str, bit_width: int) -> tuple[int, int]:
    """解析 W4B5-W5B0 等跨字节路序，返回闭区间 [start_abs, end_abs]。"""
    parts = (wave_no or "").split("-", 1)
    start_abs = wave_token_abs_bit(parts[0])
    if len(parts) > 1 and parts[1].strip():
        end_abs = wave_token_abs_bit(parts[1])
    else:
        end_abs = start_abs + max(bit_width, 1) - 1
    if end_abs < start_abs:
        start_abs, end_abs = end_abs, start_abs
    return start_abs, end_abs


def extract_bits_msb(payload: bytes, start_abs: int, end_abs: int) -> int:
    count = end_abs - start_abs + 1
    if count <= 0 or count > 64:
        raise ValueError("invalid bit span")
    result = 0
    for i in range(count):
        bit_pos = start_abs + i
        byte_idx = bit_pos // 8
        bit_in_byte = 7 - (bit_pos % 8)
        if byte_idx < 0 or byte_idx >= len(payload):
            raise IndexError("telemetry bit range out of packet")
        if (payload[byte_idx] >> bit_in_byte) & 1:
            result |= 1 << (count - 1 - i)
    return result


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


def try_unwrap_forward_frame(frame: bytes):
    if frame is None or len(frame) < 13:
        return False, frame, -1, -1, math.nan, 0
    if frame[:4] != b"URLY":
        return False, frame, -1, -1, math.nan, 0
    version = frame[4]
    if version == 3:
        ts_ms = int.from_bytes(frame[5:13], "big", signed=True)
        payload = frame[13:]
        return True, payload, -1, -1, (ts_ms / 1000.0 if ts_ms > 0 else math.nan), version
    if version not in (1, 2):
        return False, frame, -1, -1, math.nan, 0
    header_len = 21 if version == 2 else 13
    if len(frame) < header_len:
        return False, frame, -1, -1, math.nan, 0
    original_port = int.from_bytes(frame[5:7], "big", signed=False)
    original_sheet_index = int.from_bytes(frame[7:9], "big", signed=False)
    inner_len = int.from_bytes(frame[9:13], "big", signed=False)
    if inner_len <= 0 or header_len + inner_len > len(frame):
        return False, frame, -1, -1, math.nan, 0
    if version == 2:
        ts_ms = int.from_bytes(frame[13:21], "big", signed=True)
        source_timestamp = ts_ms / 1000.0 if ts_ms > 0 else math.nan
    else:
        source_timestamp = math.nan
    payload = frame[header_len:header_len + inner_len]
    if original_sheet_index == 65535:
        original_sheet_index = -1
    if original_port <= 0:
        original_port = -1
    return True, payload, original_port, original_sheet_index, source_timestamp, version


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

        if self.bit_width % 8 != 0:
            if "-" in (self.wave_no or "") or byte_width > 1:
                start_abs, end_abs = wave_range_abs_bits(self.wave_no, self.bit_width)
                bit_value = extract_bits_msb(payload, start_abs, end_abs)
            else:
                raw_unsigned = read_uint(payload, self.data_index, 1)
                bit_value = get_save_bit_value(raw_unsigned, 7 - self.bit_index, self.bit_width)
        else:
            raw_unsigned = read_uint(payload, self.data_index, byte_width)
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
            "value": value,
            "valueText": format_telemetry_display_value(value),
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
            forwarded, payload, forwarded_source_port, forwarded_sheet_index, relay_timestamp, forward_version = try_unwrap_forward_frame(data)
            listen_sheet_index = self.port_to_sheet.get(listen_port)
            effective_sheet = forwarded_sheet_index
            if effective_sheet is None or effective_sheet < 0:
                if forwarded_source_port in self.port_to_sheet:
                    effective_sheet = self.port_to_sheet.get(forwarded_source_port)
                else:
                    effective_sheet = listen_sheet_index
            packet_time = iso_from_unix_seconds(relay_timestamp) if forwarded else utc_now()
            packet = {
                "time": packet_time,
                "sourceIp": addr[0],
                "sourcePort": addr[1],
                "listenPort": listen_port,
                "sheetIndex": effective_sheet,
                "listenSheetIndex": listen_sheet_index,
                "length": len(payload),
                "rawLength": len(data),
                "hex": payload[:96].hex(" ").upper(),
                "rawHex": data[:96].hex(" ").upper(),
                "ascii": ascii_preview(payload),
                "total": self.total,
                "forwarded": forwarded,
                "forwardVersion": forward_version if forwarded else None,
                "forwardedSourcePort": forwarded_source_port,
                "forwardedSheetIndex": forwarded_sheet_index,
                "relayTimestamp": relay_timestamp if forwarded else None,
            }
            if self.parser and self.parser.enabled and effective_sheet is not None:
                packet["parsed"] = self.parser.parse_packet(effective_sheet, payload)
                parsed_values = packet["parsed"].get("values", [])
                latest = {}
                for value in parsed_values:
                    code = value.get("code")
                    if code:
                        latest[code] = {**value, "updatedAt": packet["time"]}
                self.latest_values[effective_sheet] = latest
                packet["updatedCount"] = len(parsed_values)
            self.last_packet = packet
            self.history.appendleft(packet)
            if listen_port in self.port_stats:
                self.port_stats[listen_port]["total"] += 1
                self.port_stats[listen_port]["lastPacket"] = packet
                self.port_stats[listen_port]["lastTime"] = packet["time"]
                self.port_stats[listen_port]["updatedCount"] = packet.get("updatedCount", 0)
            if effective_sheet in self.sheet_stats:
                self.sheet_stats[effective_sheet]["total"] += 1
                self.sheet_stats[effective_sheet]["lastTime"] = packet["time"]
                self.sheet_stats[effective_sheet]["updatedCount"] = packet.get("updatedCount", 0)
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
    web_root: str = PROJECT_ROOT

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def web_root_path(self) -> str:
        return self.web_root or PROJECT_ROOT

    def do_GET(self) -> None:
        root = self.web_root_path()
        path = urlparse(self.path).path
        if path == "/api/udp/status":
            self.send_json(self.udp_state.snapshot())
            return
        if path == "/api/protocol":
            self.send_json(read_protocol(root, self.udp_state))
            return
        if path == "/api/satellites":
            self.send_json({"satellites": list_meter_workbooks(root)})
            return
        if path.startswith("/api/meter/"):
            filename = unquote(path[len("/api/meter/"):])
            try:
                self.send_json(read_meter_workbook(root, filename))
            except Exception as exc:
                self.send_json({"error": str(exc)})
            return
        if path == "/api/cmdchain":
            self.send_json({"chains": read_cmdchain(root)})
            return
        if path == "/api/telemetry/definitions":
            self.send_json(self.udp_state.telemetry_definitions())
            return
        if path == "/api/commands":
            self.send_json(read_commands(root))
            return
        if path == "/api/udp/events":
            self.send_events()
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/command/send":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b""
            try:
                payload = json.loads(body.decode("utf-8") if body else "{}")
            except Exception as exc:
                self.send_json({"success": False, "error": f"解析请求体失败: {exc}"})
                return
            target = str(payload.get("target", "")).strip()
            port = int(payload.get("port") or 0)
            data = str(payload.get("data", "")).replace(" ", "").strip()
            if not target or not port or not data:
                self.send_json({"success": False, "error": "目标地址、端口和 HEX 数据均为必填"})
                return
            try:
                packet = bytes.fromhex(data)
            except ValueError:
                self.send_json({"success": False, "error": "报文不是合法的 HEX 字符串"})
                return
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.sendto(packet, (target, port))
                self.send_json({"success": True, "sentTo": f"{target}:{port}", "bytes": len(packet)})
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)})
            return
        self.send_error(404, "Not Found")

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
    parser.add_argument("--root", default=PROJECT_ROOT, help="static web root (default: repo root)")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP bind host")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP port")
    parser.add_argument("--udp-host", default="192.168.11.166", help="UDP bind host")
    parser.add_argument("--udp-port", type=int, default=None, help="single UDP listen port")
    parser.add_argument("--udp-ports", default=None, help="UDP ports, e.g. 7101-7108 or 7101,7102")
    parser.add_argument(
        "--meter-file",
        default="",
        help="telemetry definition xlsx (default: first xlsx under <root>/Meter)",
    )
    parser.add_argument("--max-values", type=int, default=0, help="max parsed values per UDP packet, 0 means all")
    args = parser.parse_args()

    web_root = resolve_project_root(args.root)
    os.chdir(web_root)
    meter_file = args.meter_file.strip() or default_meter_file(web_root)
    udp_ports = parse_ports(args.udp_ports) if args.udp_ports else ([args.udp_port] if args.udp_port else list(range(7101, 7109)))
    parser_engine = XlsxTelemetryParser(meter_file, max_values=args.max_values)
    state = UdpState(args.udp_host, udp_ports, parser_engine)
    UdpBridgeHandler.udp_state = state
    UdpBridgeHandler.web_root = web_root

    for udp_port in udp_ports:
        threading.Thread(target=udp_listener, args=(state, udp_port), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.http_port), UdpBridgeHandler)

    print(f"Root: {web_root}")
    print(f"HTTP: http://{args.host}:{args.http_port}")
    print(f"UDP : {args.udp_host}:{','.join(str(port) for port in udp_ports)}")
    print(f"Meter: {meter_file if parser_engine.enabled else 'disabled / not found'}")
    print(f"Commands: {command_dir(web_root)}")
    print("Open the HTTP URL from LAN clients, then send UDP packets to this machine.")
    server.serve_forever()


if __name__ == "__main__":
    main()
