"""
Daikin BRP15B61 Airbase local HTTP client.
All communication is on your local network — no cloud dependency.
"""
import httpx
import logging

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

    def _parse(self, text: str) -> dict:
        """Parse Daikin's CSV key=value response format."""
        result = {}
        for part in text.strip().split(","):
            if "=" in part:
                k, v = part.split("=", 1)
                result[k.strip()] = v.strip()
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
            return {
                "connected":    True,
                "power":        control.get("pow") == "1",
                "mode":         CODE_TO_MODE.get(control.get("mode", ""), "unknown"),
                "set_temp":     _safe_float(control.get("stemp")),
                "indoor_temp":  _safe_float(sensor.get("htemp")),
                "outdoor_temp": _safe_float(sensor.get("otemp")),
                "fan":          control.get("f_rate", "A"),
            }
        except Exception as exc:
            log.error("Daikin unreachable: %s", exc)
            return {"connected": False, "error": str(exc)}


def _safe_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
