"""
Dieter — FastAPI backend
"""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import database
import scheduler as sched
from daikin import DaikinAirbase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)

DAIKIN_HOST = os.environ["DAIKIN_HOST"]          # required — set in .env
TIMEZONE     = os.environ.get("TZ", "Pacific/Auckland")
daikin       = DaikinAirbase(DAIKIN_HOST)


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    sched.init(daikin, timezone=TIMEZONE)
    yield
    sched.get_scheduler().shutdown(wait=False)


app = FastAPI(title="Dieter", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this if you expose to the internet
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

VALID_MODES = {"heat", "cool", "fan", "auto"}
VALID_ACTIONS = {"setpoint", "off"}


class ScheduleIn(BaseModel):
    time:        str   = Field(pattern=r"^\d{2}:\d{2}$")
    action:      str   = "setpoint"  # "setpoint" | "off"
    temperature: Optional[float] = Field(default=None, ge=16, le=30)
    mode:        Optional[str]   = "heat"
    fan:         Optional[str]   = None
    zones:       Optional[list[int]] = None
    enabled:     bool  = True

    def validate_fields(self):
        if self.action not in VALID_ACTIONS:
            raise HTTPException(400, f"action must be one of {VALID_ACTIONS}")
        if self.action == "setpoint" and self.temperature is None:
            raise HTTPException(400, "temperature is required for setpoint schedules")
        if self.action == "setpoint" and self.mode not in VALID_MODES:
            raise HTTPException(400, f"mode must be one of {VALID_MODES}")


class SchedulePatch(BaseModel):
    time:        Optional[str]   = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    action:      Optional[str]   = None
    temperature: Optional[float] = Field(default=None, ge=16, le=30)
    mode:        Optional[str]   = None
    fan:         Optional[str]   = None
    zones:       Optional[list[int]] = None
    enabled:     Optional[bool]  = None


class ControlIn(BaseModel):
    power:       Optional[str]   = None   # "0" | "1"
    mode:        Optional[str]   = None
    temperature: Optional[float] = Field(default=None, ge=16, le=30)
    fan:         Optional[str]   = None


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    return await daikin.status()


@app.get("/api/capabilities")
async def get_capabilities():
    try:
        return await daikin.capabilities()
    except Exception as exc:
        raise HTTPException(502, f"Daikin unreachable: {exc}")


@app.post("/api/control")
async def set_control(body: ControlIn):
    try:
        result = await daikin.set_control_info(
            power=body.power,
            mode=body.mode,
            temp=body.temperature,
            fan=body.fan,
        )
        return {"ok": result.get("ret") == "OK", "raw": result}
    except Exception as exc:
        raise HTTPException(502, f"Daikin unreachable: {exc}")


class ZonesIn(BaseModel):
    zones: list[int]


@app.post("/api/zones")
async def set_zones(body: ZonesIn):
    try:
        result = await daikin.set_zone_setting(body.zones)
        return {"ok": result.get("ret") == "OK", "raw": result}
    except Exception as exc:
        raise HTTPException(502, f"Daikin unreachable: {exc}")


@app.get("/api/schedules")
def list_schedules():
    return database.get_all()


@app.post("/api/schedules", status_code=201)
def create_schedule(body: ScheduleIn):
    body.validate_fields()
    zones_json = json.dumps(body.zones) if body.zones is not None else None
    new_id = database.create(
        body.time, body.temperature, body.mode, body.action, body.enabled,
        fan=body.fan, zones=zones_json,
    )
    sched.reload_jobs()
    return {"id": new_id, **database.get_one(new_id)}


@app.patch("/api/schedules/{schedule_id}")
def update_schedule(schedule_id: int, body: SchedulePatch):
    if not database.get_one(schedule_id):
        raise HTTPException(404, "Schedule not found")
    updates = body.model_dump(exclude_none=True)
    # zones=null means "reset to all" (distinct from absent). Check if it
    # was explicitly sent so we can store NULL in the DB.
    if "zones" not in updates and "zones" in body.model_fields_set:
        updates["zones"] = None
    elif "zones" in updates:
        updates["zones"] = json.dumps(updates["zones"])
    if "action" in updates and updates["action"] not in VALID_ACTIONS:
        raise HTTPException(400, f"action must be one of {VALID_ACTIONS}")
    if "mode" in updates and updates["mode"] not in VALID_MODES:
        raise HTTPException(400, f"mode must be one of {VALID_MODES}")
    if updates:
        current = database.get_one(schedule_id)
        action = updates.get("action", current.get("action", "setpoint"))
        temperature = updates.get("temperature", current.get("temperature"))
        if action == "setpoint" and temperature is None:
            raise HTTPException(400, "temperature is required for setpoint schedules")
        if action == "off":
            updates["temperature"] = None
            updates["mode"] = None
            updates["fan"] = None
            updates["zones"] = None
        database.update(schedule_id, **updates)
        sched.reload_jobs()
    return database.get_one(schedule_id)


@app.delete("/api/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int):
    if not database.get_one(schedule_id):
        raise HTTPException(404, "Schedule not found")
    database.delete(schedule_id)
    sched.reload_jobs()


@app.get("/api/scheduler")
def get_scheduler_state():
    return {"paused": sched.is_paused()}


class SchedulerIn(BaseModel):
    paused: bool


@app.post("/api/scheduler")
def set_scheduler_state(body: SchedulerIn):
    if body.paused:
        sched.pause()
    else:
        sched.resume()
    return {"paused": sched.is_paused()}


@app.get("/api/health")
def health():
    return {"status": "ok", "daikin_host": DAIKIN_HOST}
