"""
daikin-scheduler — FastAPI backend
"""
import os
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


app = FastAPI(title="Daikin Scheduler", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this if you expose to the internet
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

VALID_DAYS  = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
VALID_MODES = {"heat", "cool", "fan", "auto", "dry"}


class ScheduleIn(BaseModel):
    label:       str
    time:        str   = Field(pattern=r"^\d{2}:\d{2}$")
    days:        list[str]
    temperature: float = Field(ge=16, le=30)
    mode:        str   = "heat"
    enabled:     bool  = True

    def validate_fields(self):
        bad_days = set(self.days) - VALID_DAYS
        if bad_days:
            raise HTTPException(400, f"Unknown days: {bad_days}")
        if self.mode not in VALID_MODES:
            raise HTTPException(400, f"mode must be one of {VALID_MODES}")


class SchedulePatch(BaseModel):
    label:       Optional[str]   = None
    time:        Optional[str]   = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    days:        Optional[list[str]] = None
    temperature: Optional[float] = Field(default=None, ge=16, le=30)
    mode:        Optional[str]   = None
    enabled:     Optional[bool]  = None


class ControlIn(BaseModel):
    power:       Optional[str]   = None   # "0" | "1"
    mode:        Optional[str]   = None
    temperature: Optional[float] = Field(default=None, ge=16, le=30)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    return await daikin.status()


@app.post("/api/control")
async def set_control(body: ControlIn):
    try:
        result = await daikin.set_control_info(
            power=body.power,
            mode=body.mode,
            temp=body.temperature,
        )
        return {"ok": result.get("ret") == "OK", "raw": result}
    except Exception as exc:
        raise HTTPException(502, f"Daikin unreachable: {exc}")


@app.get("/api/schedules")
def list_schedules():
    return database.get_all()


@app.post("/api/schedules", status_code=201)
def create_schedule(body: ScheduleIn):
    body.validate_fields()
    new_id = database.create(
        body.label, body.time, body.days,
        body.temperature, body.mode, body.enabled,
    )
    sched.reload_jobs()
    return {"id": new_id, **database.get_one(new_id)}


@app.patch("/api/schedules/{schedule_id}")
def update_schedule(schedule_id: int, body: SchedulePatch):
    if not database.get_one(schedule_id):
        raise HTTPException(404, "Schedule not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        database.update(schedule_id, **updates)
        sched.reload_jobs()
    return database.get_one(schedule_id)


@app.delete("/api/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int):
    if not database.get_one(schedule_id):
        raise HTTPException(404, "Schedule not found")
    database.delete(schedule_id)
    sched.reload_jobs()


@app.get("/api/health")
def health():
    return {"status": "ok", "daikin_host": DAIKIN_HOST}
