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
                time        TEXT    NOT NULL,        -- "HH:MM"
                days        TEXT    NOT NULL,        -- JSON array e.g. ["mon","tue"]
                action      TEXT    NOT NULL DEFAULT 'setpoint',
                temperature REAL,
                mode        TEXT,
                enabled     INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT    DEFAULT (datetime('now'))
            )
        """)
        _migrate_schema(conn)
        conn.commit()


def _migrate_schema(conn: sqlite3.Connection) -> None:
    info = {
        row["name"]: row
        for row in conn.execute("PRAGMA table_info(schedules)").fetchall()
    }
    if not info:
        return

    needs_rebuild = (
        "label" in info
        or "action" not in info
        or ("temperature" in info and info["temperature"]["notnull"] == 1)
        or ("mode" in info and info["mode"]["notnull"] == 1)
    )
    if not needs_rebuild:
        return

    action_expr = "COALESCE(action, 'setpoint')" if "action" in info else "'setpoint'"

    conn.execute("""
        CREATE TABLE schedules_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            time        TEXT    NOT NULL,
            days        TEXT    NOT NULL,
            action      TEXT    NOT NULL DEFAULT 'setpoint',
            temperature REAL,
            mode        TEXT,
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    conn.execute(f"""
        INSERT INTO schedules_new (id, time, days, action, temperature, mode, enabled, created_at)
        SELECT
            id,
            time,
            days,
            CASE WHEN {action_expr} = 'off' THEN 'off' ELSE 'setpoint' END,
            CASE WHEN {action_expr} = 'off' THEN NULL ELSE temperature END,
            CASE WHEN {action_expr} = 'off' THEN NULL ELSE mode END,
            enabled,
            created_at
        FROM schedules
    """)
    conn.execute("DROP TABLE schedules")
    conn.execute("ALTER TABLE schedules_new RENAME TO schedules")


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["days"]    = json.loads(d["days"])
    d["enabled"] = bool(d["enabled"])
    d.setdefault("action", "setpoint")
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


def create(time: str, days: list, temperature: float | None,
           mode: str | None, action: str, enabled: bool) -> int:
    db_temp = None if action == "off" else temperature
    db_mode = None if action == "off" else mode
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO schedules (time, days, action, temperature, mode, enabled)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (time, json.dumps(days), action, db_temp, db_mode, int(enabled)),
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
