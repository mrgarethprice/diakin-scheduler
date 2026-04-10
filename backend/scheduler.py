"""
Schedule runner — rebuilds APScheduler jobs from the DB whenever schedules change.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database
from daikin import DaikinAirbase

log = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="Pacific/Auckland")
_daikin: DaikinAirbase | None = None

DAY_TO_DOW = {
    "mon": "0", "tue": "1", "wed": "2", "thu": "3",
    "fri": "4", "sat": "5", "sun": "6",
}


def init(daikin: DaikinAirbase, timezone: str = "Pacific/Auckland") -> None:
    global _daikin, _scheduler
    _daikin = daikin
    _scheduler = AsyncIOScheduler(timezone=timezone)
    reload_jobs()
    _scheduler.start()
    log.info("Scheduler started (tz=%s)", timezone)


def reload_jobs() -> None:
    """Drop all jobs and rebuild from DB. Called after any schedule CRUD."""
    _scheduler.remove_all_jobs()
    for s in database.get_all():
        if not s["enabled"] or not s["days"]:
            continue
        hour, minute = s["time"].split(":")
        dow = ",".join(DAY_TO_DOW[d] for d in s["days"] if d in DAY_TO_DOW)
        if not dow:
            continue
        _scheduler.add_job(
            _apply,
            CronTrigger(hour=hour, minute=minute, day_of_week=dow),
            args=[s],
            id=f"sched_{s['id']}",
            replace_existing=True,
            misfire_grace_time=60,
        )
        log.info(
            "Job %s: %s on %s → %.1f°C (%s)",
            s["id"], s["time"], s["days"], s["temperature"], s["mode"],
        )
    log.info("Loaded %d active job(s)", len(_scheduler.get_jobs()))


async def _apply(schedule: dict) -> None:
    log.info("Firing: %s → %.1f°C (%s)", schedule["label"],
             schedule["temperature"], schedule["mode"])
    try:
        await _daikin.set_control_info(
            power="1",
            mode=schedule["mode"],
            temp=schedule["temperature"],
        )
    except Exception as exc:
        log.error("Failed to apply schedule %s: %s", schedule["id"], exc)


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler
