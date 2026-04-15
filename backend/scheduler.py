"""
Schedule runner — rebuilds APScheduler jobs from the DB whenever schedules change.
All schedules fire every day of the week.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database
from daikin import DaikinAirbase

log = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="Pacific/Auckland")
_daikin: DaikinAirbase | None = None


def init(daikin: DaikinAirbase, timezone: str = "Pacific/Auckland") -> None:
    global _daikin, _scheduler
    _daikin = daikin
    _scheduler = AsyncIOScheduler(timezone=timezone)
    reload_jobs()
    _scheduler.start()
    if database.get_setting("scheduler_paused") == "1":
        _scheduler.pause()
        log.info("Scheduler started paused (restored from DB)")
    else:
        log.info("Scheduler started (tz=%s)", timezone)


def pause() -> None:
    _scheduler.pause()
    database.set_setting("scheduler_paused", "1")
    log.info("Scheduler paused")


def resume() -> None:
    _scheduler.resume()
    database.set_setting("scheduler_paused", "0")
    log.info("Scheduler resumed")


def is_paused() -> bool:
    return _scheduler.state == 2  # STATE_PAUSED = 2 in APScheduler


def reload_jobs() -> None:
    """Drop all jobs and rebuild from DB. Called after any schedule CRUD."""
    _scheduler.remove_all_jobs()
    for s in database.get_all():
        if not s["enabled"]:
            continue
        hour, minute = s["time"].split(":")
        _scheduler.add_job(
            _apply,
            CronTrigger(hour=hour, minute=minute),
            args=[s],
            id=f"sched_{s['id']}",
            replace_existing=True,
            misfire_grace_time=60,
        )
        log.info(
            "Job %s: %s → %s",
            s["id"], s["time"],
            "OFF" if s.get("action") == "off" else f"{s['temperature']:.1f}°C ({s['mode']})",
        )
    log.info("Loaded %d active job(s)", len(_scheduler.get_jobs()))


async def _apply(schedule: dict) -> None:
    if schedule.get("action") == "off":
        log.info("Firing: %s → OFF", schedule["id"])
    else:
        log.info(
            "Firing: %s → %.1f°C (%s)",
            schedule["id"], schedule["temperature"], schedule["mode"]
        )
    try:
        if schedule.get("action") == "off":
            await _daikin.set_control_info(power="0")
        else:
            await _daikin.set_control_info(
                power="1",
                mode=schedule["mode"],
                temp=schedule["temperature"],
            )
    except Exception as exc:
        log.error("Failed to apply schedule %s: %s", schedule["id"], exc)


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler
