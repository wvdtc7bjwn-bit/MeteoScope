#!/usr/bin/env python3
"""Build a compact JSON feed from ECMWF Open Data tropical-cyclone tracks.

The source data is ECMWF IFS Open Data published under CC BY 4.0. The output
keeps the attribution and modification notice required for downstream display.
"""

from __future__ import annotations

import argparse
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from eccodes import (
    CODES_MISSING_DOUBLE,
    CODES_MISSING_LONG,
    CodesInternalError,
    codes_bufr_new_from_file,
    codes_get,
    codes_get_array,
    codes_release,
    codes_set,
)
from ecmwf.opendata import Client


ECMWF_SOURCE_URL = "https://www.ecmwf.int/en/forecasts/datasets/open-data"
ECMWF_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
ECMWF_TERMS_URL = "https://apps.ecmwf.int/datasets/licences/general/"
MAX_PERIODS = 128
ECMWF_MODEL_CONFIGS = {
    "ifs-ens": {
        "clientModel": "ifs",
        "label": "IFS ENS",
        "stream": "enfo",
        "cycleSteps": {0: (360,), 6: (144,), 12: (360,), 18: (144,)},
        "ensemble": True,
    },
    "ifs-hres": {
        "clientModel": "ifs",
        "label": "IFS HRES",
        "stream": "oper",
        "cycleSteps": {0: (360, 240), 6: (144, 90), 12: (360, 240), 18: (144, 90)},
        "ensemble": False,
    },
    "aifs-ens": {
        "clientModel": "aifs-ens",
        "label": "AIFS ENS",
        "stream": "enfo",
        "cycleSteps": {0: (360, 240), 6: (144,), 12: (360, 240), 18: (144,)},
        "ensemble": True,
    },
    "aifs-single": {
        "clientModel": "aifs-single",
        "label": "AIFS Single",
        "stream": "oper",
        "cycleSteps": {0: (240, 360), 6: (240, 90), 12: (240, 360), 18: (240, 90)},
        "ensemble": False,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", default="aws", choices=("aws", "ecmwf", "azure", "google"))
    parser.add_argument("--model", default="ifs-ens", choices=tuple(ECMWF_MODEL_CONFIGS))
    parser.add_argument("--ensemble-input", type=Path)
    parser.add_argument("--deterministic-input", type=Path)
    parser.add_argument("--min-genesis-members", type=int, default=5)
    return parser.parse_args()


def is_missing(value: Any) -> bool:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return True
    return (
        not math.isfinite(number)
        or number == CODES_MISSING_DOUBLE
        or abs(number) > 1.0e20
    )


def compact_number(value: Any, digits: int = 2) -> float | int | None:
    if is_missing(value):
        return None
    number = round(float(value), digits)
    return int(number) if number.is_integer() else number


def normalize_longitude(value: Any) -> float | int | None:
    number = compact_number(value)
    if number is None:
        return None
    normalized = ((float(number) + 180.0) % 360.0) - 180.0
    normalized = round(normalized, 2)
    return int(normalized) if normalized.is_integer() else normalized


def value_at(values: Any, index: int, fallback: Any = None) -> Any:
    try:
        length = len(values)
    except TypeError:
        return fallback
    if length == 0:
        return fallback
    return values[index] if index < length else values[0]


def first_present(values: Any) -> Any:
    for value in values:
        if value not in (CODES_MISSING_LONG, CODES_MISSING_DOUBLE) and not is_missing(value):
            return value
    return None


def safe_array(handle: int, key: str, fallback: list[Any] | None = None) -> list[Any]:
    try:
        return list(codes_get_array(handle, key))
    except CodesInternalError:
        return list(fallback or [])


def safe_get(handle: int, key: str, fallback: Any = None) -> Any:
    try:
        return codes_get(handle, key)
    except CodesInternalError:
        return fallback


def pressure_hpa(value: Any) -> float | int | None:
    number = compact_number(value, 1)
    if number is None:
        return None
    hpa = float(number) / 100.0 if float(number) > 2000 else float(number)
    hpa = round(hpa, 1)
    return int(hpa) if hpa.is_integer() else hpa


def build_point(
    longitude: Any,
    latitude: Any,
    step_hours: Any,
    pressure: Any = None,
    wind: Any = None,
) -> list[Any] | None:
    lon = normalize_longitude(longitude)
    lat = compact_number(latitude)
    step = compact_number(step_hours, 0)
    if lon is None or lat is None or step is None:
        return None
    return [
        lon,
        lat,
        int(step),
        pressure_hpa(pressure),
        compact_number(wind, 1),
    ]


def count_periods(handle: int) -> int:
    for rank in range(1, MAX_PERIODS + 1):
        try:
            codes_get_array(handle, f"#{rank}#timePeriod")
        except CodesInternalError:
            return rank
    return MAX_PERIODS


def parse_track_message(handle: int) -> dict[str, Any]:
    codes_set(handle, "unpack", 1)
    member_numbers = safe_array(handle, "ensembleMemberNumber")
    subset_count = int(safe_get(handle, "numberOfSubsets", len(member_numbers) or 1))
    if not member_numbers:
        member_numbers = list(range(subset_count))

    forecast_base_time = datetime(
        int(safe_get(handle, "year")),
        int(safe_get(handle, "month")),
        int(safe_get(handle, "day")),
        int(safe_get(handle, "hour")),
        int(safe_get(handle, "minute", 0)),
        tzinfo=timezone.utc,
    ).isoformat().replace("+00:00", "Z")

    identifier = str(safe_get(handle, "stormIdentifier", "")).strip()
    name = str(safe_get(handle, "longStormName", "")).strip() or identifier
    observed_latitude = safe_get(handle, "#1#latitude")
    observed_longitude = safe_get(handle, "#1#longitude")

    analysis_latitudes = safe_array(handle, "#2#latitude")
    analysis_longitudes = safe_array(handle, "#2#longitude")
    analysis_pressures = safe_array(handle, "#1#pressureReducedToMeanSeaLevel")
    analysis_winds = safe_array(handle, "#1#windSpeedAt10M")
    period_count = count_periods(handle)

    periods: list[int] = [0]
    period_values: list[dict[str, list[Any]]] = []
    for period_index in range(1, period_count):
        period_candidates = safe_array(handle, f"#{period_index}#timePeriod")
        period = first_present(period_candidates)
        if period is None:
            continue
        periods.append(int(period))
        center_rank = period_index * 2 + 2
        period_values.append({
            "latitude": safe_array(handle, f"#{center_rank}#latitude"),
            "longitude": safe_array(handle, f"#{center_rank}#longitude"),
            "pressure": safe_array(
                handle,
                f"#{period_index + 1}#pressureReducedToMeanSeaLevel",
            ),
            "wind": safe_array(handle, f"#{period_index + 1}#windSpeedAt10M"),
        })

    members = []
    for member_index, member_number in enumerate(member_numbers):
        points = []
        analysis_point = build_point(
            value_at(analysis_longitudes, member_index, observed_longitude),
            value_at(analysis_latitudes, member_index, observed_latitude),
            0,
            value_at(analysis_pressures, member_index),
            value_at(analysis_winds, member_index),
        )
        if analysis_point:
            points.append(analysis_point)

        for values, period in zip(period_values, periods[1:]):
            point = build_point(
                value_at(values["longitude"], member_index),
                value_at(values["latitude"], member_index),
                period,
                value_at(values["pressure"], member_index),
                value_at(values["wind"], member_index),
            )
            if point and (not points or point[:3] != points[-1][:3]):
                points.append(point)

        if len(points) >= 2:
            members.append({
                "id": int(member_number),
                "points": points,
            })

    observed_center = build_point(observed_longitude, observed_latitude, 0)
    return {
        "id": identifier,
        "name": name,
        "forecastBaseTime": forecast_base_time,
        "observedCenter": observed_center[:2] if observed_center else None,
        "members": members,
    }


def parse_bufr(path: Path) -> list[dict[str, Any]]:
    systems = []
    with path.open("rb") as source:
        while True:
            handle = codes_bufr_new_from_file(source)
            if handle is None:
                break
            try:
                system = parse_track_message(handle)
                if system["id"] and system["members"]:
                    systems.append(system)
            finally:
                codes_release(handle)
    return systems


def is_genesis_identifier(identifier: str) -> bool:
    prefix = str(identifier).strip()[:2]
    return prefix.isdigit() and int(prefix) >= 70


def merge_systems(
    ensemble_systems: list[dict[str, Any]],
    deterministic_systems: list[dict[str, Any]],
    min_genesis_members: int,
) -> list[dict[str, Any]]:
    deterministic_by_id = {
        system["id"]: system["members"][0]["points"]
        for system in deterministic_systems
        if system.get("members")
    }
    merged = []
    for system in ensemble_systems:
        members = system.get("members", [])
        if is_genesis_identifier(system["id"]) and len(members) < min_genesis_members:
            continue
        control_member = next(
            (member for member in members if int(member.get("id", -1)) == 0),
            members[0] if members else None,
        )
        merged.append({
            "id": system["id"],
            "name": system["name"],
            "kind": "genesis" if is_genesis_identifier(system["id"]) else "named",
            "forecastBaseTime": system["forecastBaseTime"],
            "observedCenter": system["observedCenter"],
            "memberCount": len(members),
            "members": members,
            "controlTrack": control_member.get("points", []) if control_member else [],
            "deterministicTrack": deterministic_by_id.get(system["id"], []),
        })
    return merged


def retrieve_tracks(
    client: Client,
    stream: str,
    step: int,
    target: Path,
    cycle: int,
) -> str:
    result = client.retrieve(
        time=cycle,
        stream=stream,
        type="tf",
        step=step,
        target=str(target),
    )
    return result.datetime.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    args = parse_args()
    model_config = ECMWF_MODEL_CONFIGS[args.model]
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="meteoscope-ecmwf-") as temp_dir:
        temp_root = Path(temp_dir)
        primary_input = args.ensemble_input
        if not model_config["ensemble"] and args.deterministic_input is not None:
            primary_input = args.deterministic_input
        retrieved_base_times = []

        if primary_input is not None:
            primary_systems = parse_bufr(primary_input)
        else:
            client = Client(
                source=args.source,
                model=model_config["clientModel"],
                infer_stream_keyword=False,
            )
            forecast_candidates: list[tuple[str, list[dict[str, Any]]]] = []
            for cycle, steps in model_config["cycleSteps"].items():
                for step in steps:
                    forecast_path = temp_root / f"{args.model}-{cycle:02d}-{step}.bufr"
                    try:
                        base_time = retrieve_tracks(
                            client,
                            model_config["stream"],
                            step,
                            forecast_path,
                            cycle,
                        )
                        forecast_candidates.append((base_time, parse_bufr(forecast_path)))
                        break
                    except (OSError, ValueError, CodesInternalError) as error:
                        print(
                            f"Skipping unavailable {args.model} {cycle:02d} UTC "
                            f"step {step}: {error}"
                        )
            if not forecast_candidates:
                raise RuntimeError(
                    f"No ECMWF {model_config['label']} tropical-cyclone track cycle is available"
                )
            selected_base_time, primary_systems = max(
                forecast_candidates,
                key=lambda candidate: candidate[0],
            )
            retrieved_base_times.append(selected_base_time)

        deterministic_systems = (
            parse_bufr(args.deterministic_input)
            if model_config["ensemble"]
            and args.deterministic_input is not None
            and args.deterministic_input != primary_input
            else []
        )
        systems = merge_systems(
            primary_systems,
            deterministic_systems,
            max(1, args.min_genesis_members),
        )

    forecast_times = [
        system["forecastBaseTime"]
        for system in systems
        if system.get("forecastBaseTime")
    ] + retrieved_base_times
    latest_forecast_time = max(forecast_times) if forecast_times else None
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "forecastBaseTime": latest_forecast_time,
        "source": {
            "name": "ECMWF Open Data",
            "model": model_config["label"],
            "url": ECMWF_SOURCE_URL,
            "license": "CC BY 4.0",
            "licenseUrl": ECMWF_LICENSE_URL,
            "termsUrl": ECMWF_TERMS_URL,
            "attribution": (
                "This service is based on data and products of the European Centre "
                "for Medium-Range Weather Forecasts (ECMWF)."
            ),
            "modified": True,
            "disclaimer": (
                "ECMWF does not accept any liability whatsoever for any error or "
                "omission in the data, their availability, or for any loss or "
                "damage arising from their use."
            ),
        },
        "systems": systems,
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {model_config['label']} {len(systems)} systems and "
        f"{sum(system['memberCount'] for system in systems)} members to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
