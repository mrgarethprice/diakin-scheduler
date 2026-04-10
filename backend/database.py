"""
SQLite persistence for schedules.
Database lives at /data/scheduler.db — mapped to a volume on the NAS.
"""
import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path("/data/scheduler.db")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                label       TEXT    NOT NULL,
                time        TEXT    NOT NULL,        -- "HH:MM"
                days        TEXT    NOT NULL,        -- JSON array e.g. ["mon","tue"]
                temperature REAL    NOT NULL,
                mode        TEXT    NOT NULL DEFAULT 'heat',
                enabled     INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT    DEFAULT (datetime('now'))
            )
        """)
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["days"]    = json.loads(d["days"])
    d["enabled"] = bool(d["enabled"])
    return d


def get_all() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM schedules ORDER BY time ASC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_one(schedule_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM schedules WHERE id = ?", (schedule_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def create(label: str, time: str, days: list, temperature: float,
           mode: str, enabled: bool) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO schedules (label, time, days, temperature, mode, enabled)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (label, time, json.dumps(days), temperature, mode, int(enabled)),
        )
        conn.commit()
        return cur.lastrowid


def update(schedule_id: int, **fields: Any) -> None:
    if not fields:
        return
    if "days" in fields:
        fields["days"] = json.dumps(fields["days"])
    if "enabled" in fields:
        fields["enabled"] = int(fields["enabled"])
    sets   = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [schedule_id]
    with _connect() as conn:
        conn.execute(f"UPDATE schedules SET {sets} WHERE id = ?", values)
        conn.commit()


def delete(schedule_id: int) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        conn.commit()
