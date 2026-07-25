#!/usr/bin/env python3
"""Build a compact JSON feed from NOAA/NCEP GEFS cyclone tracker products."""

from __future__ import annotations

import argparse
import json
import math
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NCEP_TRACKER_ROOT = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/ens_tracker/prod"
NOAA_GEFS_URL = "https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gefs.php"
NOAA_OPEN_DATA_URL = "https://registry.opendata.aws/noaa-gefs/"
NOAA_DISCLAIMER_URL = "https://www.weather.gov/disclaimer"
USER_AGENT = "MeteoScope world forecast updater/1.0"
GEFS_MEMBER_COUNT = 31


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--tracker-root", default=NCEP_TRACKER_ROOT)
    parser.add_argument("--xml-input", type=Path)
    parser.add_argument("--genesis-input-dir", type=Path)
    parser.add_argument("--min-genesis-probability", type=int, default=20)
    return parser.parse_args()


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


def listed_links(url: str) -> list[str]:
    html = fetch_text(url)
    return re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)


def discover_latest_cycle(tracker_root: str) -> tuple[str, str, str]:
    root = tracker_root.rstrip("/")
    date_values = sorted({
        match.group(1)
        for href in listed_links(f"{root}/")
        if (match := re.fullmatch(r"gefs\.(\d{8})/", href))
    }, reverse=True)
    for date_value in date_values[:4]:
        date_url = f"{root}/gefs.{date_value}/"
        cycles = sorted({
            match.group(1)
            for href in listed_links(date_url)
            if (match := re.fullmatch(r"(\d{2})/", href))
        }, reverse=True)
        for cycle in cycles:
            cycle_url = f"{date_url}{cycle}/"
            track_url = f"{cycle_url}tctrack/"
            expected_name = f"kwbc_{date_value}{cycle}0000_GEFS_glob_prod_esttr_glo.xml"
            if expected_name in listed_links(track_url):
                return f"{track_url}{expected_name}", f"{cycle_url}genesis/", f"{date_value}{cycle}"
    raise RuntimeError("No current NOAA/NCEP GEFS ensemble tracker cycle is available")


def finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def compact_number(value: Any, digits: int = 2) -> float | int | None:
    number = finite_number(value)
    if number is None:
        return None
    number = round(number, digits)
    return int(number) if number.is_integer() else number


def normalize_longitude(value: Any) -> float | int | None:
    number = finite_number(value)
    if number is None:
        return None
    normalized = round(((number + 180.0) % 360.0) - 180.0, 2)
    return int(normalized) if normalized.is_integer() else normalized


def knot_to_ms(value: Any) -> float | int | None:
    number = finite_number(value)
    if number is None or number < 0:
        return None
    return compact_number(number * 0.514444, 1)


def build_point(
    longitude: Any,
    latitude: Any,
    step_hours: Any,
    pressure_hpa: Any = None,
    wind_knots: Any = None,
) -> list[Any] | None:
    lon = normalize_longitude(longitude)
    lat = compact_number(latitude)
    step = compact_number(step_hours, 0)
    pressure = compact_number(pressure_hpa, 1)
    if lon is None or lat is None or step is None:
        return None
    if pressure is not None and pressure <= 0:
        pressure = None
    return [lon, lat, int(step), pressure, knot_to_ms(wind_knots)]


def parse_gefs_xml(xml_text: str) -> tuple[str, list[dict[str, Any]]]:
    root = ET.fromstring(xml_text)
    forecast_base_time = (root.findtext("./header/baseTime") or "").strip()
    systems_by_key: dict[str, dict[str, Any]] = {}

    for data_node in root.findall("./data"):
        member_id = int(data_node.attrib.get("member", -1))
        for disturbance in data_node.findall("./disturbance"):
            basin = (disturbance.findtext("basin") or "").strip().upper()
            number = (disturbance.findtext("cycloneNumber") or "").strip().zfill(2)
            if not basin or not number:
                continue
            name = (disturbance.findtext("cycloneName") or "").strip()
            system_key = f"{basin}{number}"
            system = systems_by_key.setdefault(system_key, {
                "id": f"{system_key}{forecast_base_time[:4]}",
                "name": name or system_key,
                "kind": "genesis" if name.lower() == "invest" or int(number) >= 90 else "named",
                "forecastBaseTime": forecast_base_time,
                "members": [],
            })
            if name and system["name"] == system_key:
                system["name"] = name

            points = []
            seen_steps = set()
            for fix in disturbance.findall("./fix"):
                step = int(fix.attrib.get("hour", 0))
                if step in seen_steps:
                    continue
                point = build_point(
                    fix.findtext("longitude"),
                    fix.findtext("latitude"),
                    step,
                    fix.findtext("./cycloneData/minimumPressure/pressure"),
                    fix.findtext("./cycloneData/maximumWind/speed"),
                )
                if point:
                    points.append(point)
                    seen_steps.add(step)
            points.sort(key=lambda point: point[2])
            if len(points) >= 2:
                system["members"].append({"id": member_id, "points": points})

    systems = []
    for system in systems_by_key.values():
        members = sorted(system["members"], key=lambda member: member["id"])
        if not members:
            continue
        control_member = next(
            (member for member in members if member["id"] == 0),
            members[0],
        )
        system.update({
            "observedCenter": control_member["points"][0][:2],
            "memberCount": len(members),
            "members": members,
            "controlTrack": control_member["points"],
            "deterministicTrack": [],
        })
        systems.append(system)
    return forecast_base_time, systems


def parse_atcf_coordinate(value: str) -> float | None:
    match = re.fullmatch(r"(\d+)([NSEW])", value.strip().upper())
    if not match:
        return None
    number = int(match.group(1)) / 10.0
    return -number if match.group(2) in {"S", "W"} else number


def parse_genesis_probability(text: str) -> dict[str, Any] | None:
    points = []
    probabilities = []
    basin = ""
    number = ""
    base_time = ""
    for raw_line in text.splitlines():
        fields = [field.strip() for field in raw_line.split(",")]
        if len(fields) < 9:
            continue
        basin = fields[0].upper()
        number = fields[1].zfill(2)
        base_time = fields[2]
        latitude = parse_atcf_coordinate(fields[6])
        longitude = parse_atcf_coordinate(fields[7])
        probability = finite_number(fields[8])
        point = build_point(longitude, latitude, fields[5])
        if point and probability is not None:
            points.append(point)
            probabilities.append(probability)
    if not points or not probabilities:
        return None
    unique_points = {point[2]: point for point in points}
    ordered_points = [unique_points[step] for step in sorted(unique_points)]
    return {
        "key": f"{basin}{number}",
        "forecastBaseTime": (
            f"{base_time[:4]}-{base_time[4:6]}-{base_time[6:8]}"
            f"T{base_time[8:10]}:00:00Z"
        ),
        "probability": int(round(max(probabilities))),
        "points": ordered_points,
    }


def load_genesis_products(
    genesis_url: str | None,
    genesis_input_dir: Path | None,
) -> list[dict[str, Any]]:
    products = []
    if genesis_input_dir:
        sources = [
            (path.name, path.read_text(encoding="utf-8"))
            for path in genesis_input_dir.glob("aemn.trkprob.*.indiv.gene")
        ]
    elif genesis_url:
        names = [
            href
            for href in listed_links(genesis_url)
            if re.fullmatch(r"aemn\.trkprob\.[A-Z]{2}\d+\.65nm\.\d{10}\.indiv\.gene", href)
        ]
        sources = [(name, fetch_text(f"{genesis_url}{name}")) for name in names]
    else:
        sources = []
    for _, text in sources:
        product = parse_genesis_probability(text)
        if product:
            products.append(product)
    return products


def merge_genesis_products(
    systems: list[dict[str, Any]],
    products: list[dict[str, Any]],
    min_probability: int,
) -> list[dict[str, Any]]:
    systems_by_key = {
        re.sub(r"\d{4}$", "", system["id"]): system
        for system in systems
    }
    for product in products:
        probability = product["probability"]
        existing = systems_by_key.get(product["key"])
        if existing:
            if existing["kind"] == "genesis":
                existing["genesisProbability"] = probability
            continue
        if probability < min_probability:
            continue
        points = product["points"]
        candidate = {
            "id": f"GEFS-{product['key']}-{product['forecastBaseTime'][:10]}",
            "name": product["key"],
            "kind": "genesis",
            "forecastBaseTime": product["forecastBaseTime"],
            "observedCenter": points[0][:2],
            "memberCount": max(1, round(probability * GEFS_MEMBER_COUNT / 100)),
            "genesisProbability": probability,
            "members": [],
            "controlTrack": points,
            "deterministicTrack": [],
        }
        systems.append(candidate)
    return systems


def main() -> int:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    if args.xml_input:
        xml_text = args.xml_input.read_text(encoding="utf-8")
        genesis_url = None
    else:
        xml_url, genesis_url, _ = discover_latest_cycle(args.tracker_root)
        xml_text = fetch_text(xml_url)

    forecast_base_time, systems = parse_gefs_xml(xml_text)
    genesis_products = load_genesis_products(genesis_url, args.genesis_input_dir)
    systems = merge_genesis_products(
        systems,
        genesis_products,
        max(0, min(100, args.min_genesis_probability)),
    )
    systems.sort(key=lambda system: (
        system["kind"] != "named",
        -(system.get("memberCount") or 0),
        system["id"],
    ))

    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "forecastBaseTime": forecast_base_time,
        "source": {
            "name": "NOAA/NCEP",
            "model": "GEFS",
            "url": NOAA_GEFS_URL,
            "license": "NOAA Open Data",
            "licenseUrl": NOAA_OPEN_DATA_URL,
            "termsUrl": NOAA_DISCLAIMER_URL,
            "attribution": "NOAA/NCEP Global Ensemble Forecast System (GEFS)",
            "modified": True,
            "disclaimer": (
                "This is processed numerical guidance, not an official tropical "
                "cyclone forecast. NOAA does not endorse MeteoScope."
            ),
        },
        "systems": systems,
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(systems)} systems and "
        f"{sum(system['memberCount'] for system in systems)} member tracks to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
