"""Awapi Editor — Sample Python Script."""

from __future__ import annotations
from dataclasses import dataclass
from statistics import mean
from typing import Iterable


@dataclass(frozen=True)
class SensorReading:
    sensor_id: str
    location: str
    temperature_c: float
    humidity_pct: float

    @property
    def temperature_f(self) -> float:
        return round((self.temperature_c * 9.0 / 5.0) + 32.0, 2)


def summarize_readings(readings: Iterable[SensorReading]) -> dict[str, float]:
    items = list(readings)
    if not items:
        return {"count": 0, "avg_temp_c": 0.0, "avg_humidity_pct": 0.0}

    return {
        "count": len(items),
        "avg_temp_c": round(mean(r.temperature_c for r in items), 2),
        "avg_humidity_pct": round(mean(r.humidity_pct for r in items), 2),
    }


def main() -> None:
    sample_data = [
        SensorReading("SNS-01", "Server Room A", 21.4, 42.0),
        SensorReading("SNS-02", "Server Room B", 23.1, 45.5),
        SensorReading("SNS-03", "Roof Weather Station", 16.8, 68.2),
    ]

    summary = summarize_readings(sample_data)
    print(f"Processed {int(summary['count'])} readings:")
    print(f"  Average Temp:     {summary['avg_temp_c']} °C")
    print(f"  Average Humidity: {summary['avg_humidity_pct']}%")

    for reading in sample_data:
        print(f"  - {reading.sensor_id} ({reading.location}): {reading.temperature_c} °C / {reading.temperature_f} °F")


if __name__ == "__main__":
    main()
