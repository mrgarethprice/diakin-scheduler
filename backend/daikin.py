"""
Daikin BRP15B61 Airbase local HTTP client.
All communication is on your local network — no cloud dependency.
"""
import httpx
import logging
from urllib.parse import unquote

log = logging.getLogger(__name__)

MODE_TO_CODE = {
    "fan":  "0",
    "heat": "1",
    "cool": "2",
    "auto": "3",
    "dry":  "6",
}
CODE_TO_MODE = {v: k for k, v in MODE_TO_CODE.items()}


class DaikinAirbase:
    def __init__(self, host: str):
        self.base = f"http://{host}/skyfi"
        self._zone_count: int | None = None

    def _parse(self, text: str) -> dict:
        """Parse Daikin's CSV key=value response format."""
        result = {}
        for part in text.strip().split(","):
            if "=" in part:
                k, v = part.split("=", 1)
                result[k.strip()] = v.strip()
        return result

    async def get_basic_info(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base}/common/basic_info", timeout=5)
            return self._parse(r.text)

    async def get_model_info(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base}/aircon/get_model_info", timeout=5)
            return self._parse(r.text)

    async def get_zone_setting(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base}/aircon/get_zone_setting", timeout=5)
            return self._parse(r.text)

    async def set_zone_setting(self, zone_onoff: list[int]) -> dict:
        """
        Set zone on/off state. Always sends all 8 slots.
        Zone names are echoed back unchanged from get_zone_setting.
        URL is built manually to avoid double-encoding the percent-hex values.

        Slots beyond the configured zone count are forced to 0 — the Daikin
        unit rejects requests that try to enable unconfigured zones.
        """
        current = await self.get_zone_setting()
        zone_name = current.get("zone_name", "")

        full = list(zone_onoff)
        while len(full) < 8:
            full.append(0)
        full = full[:8]

        count = await self.get_zone_count()
        if count is not None:
            for i in range(count, 8):
                full[i] = 0

        onoff_str = "%3b".join(str(x) for x in full)
        url = (
            f"{self.base}/aircon/set_zone_setting"
            f"?zone_name={zone_name}&zone_onoff={onoff_str}"
        )

        log.info("Setting zones: %s", full)

        async with httpx.AsyncClient() as client:
            r = await client.get(url, timeout=5)
            result = self._parse(r.text)
            if result.get("ret") != "OK":
                log.error("Zone set returned non-OK: %s", result)
            return result

    async def get_control_info(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base}/aircon/get_control_info", timeout=5)
            return self._parse(r.text)

    async def get_sensor_info(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base}/aircon/get_sensor_info", timeout=5)
            return self._parse(r.text)

    async def set_control_info(
        self,
        power: str | None = None,
        mode: str | None = None,  # "heat" | "cool" | "fan" | "auto" | "dry"
        temp: float | None = None,
        fan: str | None = None,
    ) -> dict:
        """
        Fetch current state, overlay any provided values, then send.
        The Airbase adapter requires ALL control parameters to be echoed
        back — omitting fields like f_dir causes a silent rejection.
        """
        current = await self.get_control_info()

        # Start from the full current state so every parameter the unit
        # expects is present, then overlay only the values we want to change.
        params = {k: v for k, v in current.items() if k != "ret"}

        if power is not None:
            params["pow"] = power
        if mode is not None:
            params["mode"] = MODE_TO_CODE.get(mode, mode)
        if temp is not None:
            params["stemp"] = str(temp)
        if fan is not None:
            params["f_rate"] = fan

        log.info("Setting Daikin: %s", params)

        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base}/aircon/set_control_info",
                params=params,
                timeout=5,
            )
            result = self._parse(r.text)
            if result.get("ret") != "OK":
                log.error("Daikin returned non-OK: %s", result)
            return result

    async def status(self) -> dict:
        """Combined status for the API."""
        try:
            control = await self.get_control_info()
            sensor  = await self.get_sensor_info()
            result = {
                "connected":    True,
                "power":        control.get("pow") == "1",
                "mode":         CODE_TO_MODE.get(control.get("mode", ""), "unknown"),
                "set_temp":     _safe_float(control.get("stemp")),
                "indoor_temp":  _safe_float(sensor.get("htemp")),
                "outdoor_temp": _safe_float(sensor.get("otemp")),
                "fan":          control.get("f_rate", "A"),
            }
            try:
                zs = await self.get_zone_setting()
                raw = unquote(zs.get("zone_onoff", ""))
                result["zones"] = [int(x) for x in raw.split(";") if x]
            except Exception:
                pass
            return result
        except Exception as exc:
            log.error("Daikin unreachable: %s", exc)
            return {"connected": False, "error": str(exc)}


    async def get_zone_count(self) -> int | None:
        """Return the configured zone count, fetching from hardware if needed."""
        if self._zone_count is not None:
            return self._zone_count
        try:
            model = await self.get_model_info()
            count = int(model.get("en_zone", "0"))
            count = min(max(count, 0), 8)
            if count > 0:
                self._zone_count = count
            return count if count > 0 else None
        except Exception as exc:
            log.warning("Failed to fetch zone count: %s", exc)
            return None

    async def capabilities(self) -> dict:
        """Discover fan speeds and zone configuration from hardware."""
        model = await self.get_model_info()
        log.info("Raw model_info: %s", model)

        # ── Fan speeds ──
        # Some firmware reports en_frate as boolean (1 = supported) with the
        # actual step count in frate_steps. Fall back to frate_steps when
        # en_frate looks like a boolean rather than a count.
        steps = int(model.get("en_frate", "0"))
        if steps <= 1:
            steps = int(model.get("frate_steps", str(steps)))
        auto = model.get("en_frate_auto") == "1"

        AIRBASE_SPEEDS = [
            {"value": "1", "label": "Low"},
            {"value": "3", "label": "Mid"},
            {"value": "5", "label": "High"},
        ]
        if steps == 2:
            speeds = [AIRBASE_SPEEDS[0], AIRBASE_SPEEDS[2]]
        elif steps >= 3:
            speeds = list(AIRBASE_SPEEDS)
        else:
            speeds = []
        if speeds:
            speeds.insert(0, {"value": "B", "label": "Quiet"})
        if auto:
            speeds.append({"value": "A", "label": "Auto"})

        # ── Zones ──
        zone_info = None
        try:
            basic = await self.get_basic_info()
            log.info("Raw basic_info: %s", basic)
            if basic.get("en_setzone") == "1":
                zs = await self.get_zone_setting()
                log.info("Raw zone_setting: %s", zs)
                names_raw = unquote(zs.get("zone_name", ""))
                all_names = names_raw.split(";")
                onoff_raw = unquote(zs.get("zone_onoff", ""))
                all_onoff = [int(x) for x in onoff_raw.split(";") if x]

                zone_count = int(model.get("en_zone", "0"))
                zone_count = min(max(zone_count, 0), 8)
                self._zone_count = zone_count

                if zone_count > 0:
                    names = [n.strip() for n in all_names[:zone_count]]
                    zone_info = {
                        "count": zone_count,
                        "names": names,
                        "onoff": all_onoff[:zone_count],
                    }
                    log.info("Zones discovered: count=%d names=%s", zone_count, names)
        except Exception as exc:
            log.warning("Zone discovery failed: %s", exc)

        return {"fan_speeds": speeds, "zones": zone_info}


def _safe_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
