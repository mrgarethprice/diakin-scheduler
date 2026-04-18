import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import ModeDial from "./components/ModeDial";
import NeuSlider from "./components/NeuSlider";
import NeuSwitch from "./components/NeuSwitch";
import NeuPushButton from "./components/NeuPushButton";
import ActionButton from "./components/ActionButton";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "";

const MODE_ICONS = {
  heat: "ri-fire-line",
  cool: "ri-snowflake-line",
  fan: "ri-windy-line",
  auto: "ri-arrow-up-down-line",
};

const FAN_LABEL_MAP = { "1": "1", "3": "2", "5": "3", "A": "A" };

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function toTitleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function api(path, opts = {}) {
  return fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (r.status === 204) return null;
    return r.json();
  });
}

const MOCK_SCHEDULES = [
  { id: 1, time: "05:30", temperature: 24, mode: "heat", action: "setpoint", enabled: true },
  { id: 2, time: "08:30", temperature: null, mode: null, action: "off", enabled: true },
  { id: 3, time: "16:00", temperature: 24, mode: "cool", action: "setpoint", enabled: true },
  { id: 4, time: "23:00", temperature: 16, mode: "heat", action: "setpoint", enabled: true },
];

function formatTime12(time24) {
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function getNextSchedule(schedules) {
  if (!schedules.length) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const upcoming = schedules
    .filter((s) => s.enabled)
    .map((s) => {
      const [h, m] = s.time.split(":").map(Number);
      return { ...s, mins: h * 60 + m };
    })
    .sort((a, b) => a.mins - b.mins);

  const next = upcoming.find((s) => s.mins > nowMins) || upcoming[0];
  return next || null;
}

function getModeIcon(mode) {
  return MODE_ICONS[mode] || "ri-fire-line";
}

// ── Fan Icon (inline SVG for currentColor inheritance) ───────────────────────

function FanIcon({ className = "" }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.9121 1.48919C12.1849 1.07672 13.5503 1.04147 14.8427 1.38763L15.664 1.60833L14.4101 6.28411C15.1439 6.12076 15.9031 6.07591 16.6582 6.15716C17.9883 6.30036 19.2487 6.82532 20.2871 7.66888C21.3256 8.51263 22.0982 9.63918 22.5107 10.912C22.9232 12.1849 22.9584 13.5502 22.6123 14.8427L22.3925 15.664L17.7148 14.4101C17.8782 15.1439 17.924 15.903 17.8427 16.6581C17.6995 17.9883 17.1746 19.2486 16.331 20.287C15.4872 21.3256 14.3608 22.0982 13.0878 22.5107C11.8149 22.9232 10.4497 22.9584 9.15718 22.6122L8.21578 22.3603L8.59371 21.4618L8.59468 21.4579C8.59576 21.4554 8.59738 21.4514 8.59957 21.4462C8.60403 21.4355 8.61132 21.4194 8.62007 21.3984C8.63765 21.3561 8.66365 21.2932 8.69625 21.2138C8.76145 21.0549 8.8535 20.8281 8.96089 20.5575C9.17641 20.0146 9.45121 19.3008 9.69234 18.6074C9.81689 18.2492 9.92752 17.9086 10.0166 17.6064C9.15274 17.8572 8.24422 17.9398 7.34175 17.8427C6.01158 17.6995 4.75122 17.1746 3.71285 16.331C2.67431 15.4872 1.90172 14.3608 1.48921 13.0878C1.07672 11.8149 1.04145 10.4497 1.38765 9.15716L1.60836 8.33587L6.28414 9.5888C6.12099 8.85538 6.07598 8.09638 6.15718 7.34173C6.30042 6.01158 6.82533 4.75119 7.6689 3.71282C8.51267 2.67432 9.63918 1.90171 10.9121 1.48919ZM13.5625 2.87884C12.8485 2.80846 12.1247 2.88338 11.4365 3.10638C10.4757 3.41772 9.62511 4.00124 8.98824 4.78509C8.35159 5.56885 7.95565 6.52038 7.84761 7.52435C7.75335 8.40063 7.88164 9.28478 8.21871 10.0947C8.53335 10.8513 7.87297 11.7744 6.96871 11.5322L2.87886 10.4365C2.80829 11.1507 2.88332 11.8749 3.1064 12.5634C3.41775 13.5242 4.00126 14.3748 4.78511 15.0117C5.56889 15.6483 6.52036 16.0442 7.52437 16.1523C8.52842 16.2603 9.54201 16.0755 10.4433 15.62C10.5888 15.5465 10.9086 15.4196 11.2763 15.5546C11.677 15.7019 11.8302 16.042 11.8828 16.2255C11.9359 16.4111 11.9377 16.5936 11.9316 16.7226C11.9249 16.863 11.9044 17.0093 11.8789 17.1513C11.7792 17.7053 11.5453 18.4541 11.2978 19.1659C11.0536 19.8681 10.7783 20.582 10.5615 21.1298C11.2351 21.1801 11.915 21.1036 12.5634 20.8935C13.5242 20.5822 14.3748 19.9995 15.0117 19.2158C15.6485 18.4319 16.0442 17.4797 16.1523 16.4755C16.2465 15.5994 16.1182 14.7159 15.7812 13.9062C15.486 13.1969 16.0478 12.3403 16.8642 12.4355L17.0312 12.4677L21.1201 13.5624C21.1905 12.8485 21.1165 12.1247 20.8935 11.4365C20.5822 10.4757 19.9996 9.62508 19.2158 8.98821C18.4319 8.35135 17.4797 7.95565 16.4755 7.84759C15.5995 7.75338 14.7159 7.88176 13.9062 8.21868C13.1495 8.53361 12.2254 7.87306 12.4677 6.96868L13.5625 2.87884ZM11.1503 12.0097V11.9999C11.1504 11.5306 11.5306 11.1504 12 11.1503C12.4694 11.1503 12.8495 11.5305 12.8496 11.9999V12.0097C12.8496 12.4791 12.4694 12.8603 12 12.8603C11.5598 12.8602 11.1976 12.5254 11.1543 12.0966L11.1503 12.0097Z" />
    </svg>
  );
}

// ── Fan Speed Select ─────────────────────────────────────────────────────────

function FanSelect({ value, speeds, onChange, className = "", accent = false }) {
  if (!speeds?.length) return null;
  const display = value ? (FAN_LABEL_MAP[value] ?? value) : "";
  return (
    <label className={`fan-select ${accent ? "fan-select--accent" : ""} ${className}`.trim()}>
      <FanIcon className="fan-select__icon" />
      {display && <span className="fan-select__value">{display}</span>}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {speeds.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}

// ── Zone Select ──────────────────────────────────────────────────────────────

function isAllZones(onoff, count) {
  if (!onoff) return true;
  for (let i = 0; i < count; i++) {
    if (!onoff[i]) return false;
  }
  return true;
}

function ZoneSelect({ zones, zoneInfo, onChange, className = "", accent = false, direction = "up" }) {
  const [open, setOpen] = useState(false);
  if (!zoneInfo) return null;
  const { count, names } = zoneInfo;
  const current = zones || Array(8).fill(1);

  const toggle = (idx) => {
    const next = [...current];
    while (next.length < 8) next.push(0);
    next[idx] = next[idx] ? 0 : 1;
    if (isAllZones(next, count)) {
      onChange(null);
    } else {
      onChange(next);
    }
  };

  const handleNativeChange = (e) => {
    const selected = new Set(Array.from(e.target.selectedOptions, (o) => Number(o.value)));
    const next = Array(8).fill(0);
    for (let i = 0; i < count; i++) next[i] = selected.has(i) ? 1 : 0;
    if (isAllZones(next, count)) {
      onChange(null);
    } else {
      onChange(next);
    }
  };

  const panelClass = `zone-select__panel zone-select__panel--${direction}`;
  const wrapClass = `zone-select ${accent ? "zone-select--accent" : ""} ${className}`.trim();

  if (IS_IOS) {
    const selectedIndices = [];
    for (let i = 0; i < count; i++) if (current[i]) selectedIndices.push(i);

    return (
      <label className={wrapClass}>
        <i className="ri-layout-grid-line" />
        <select
          multiple
          value={selectedIndices.map(String)}
          onChange={handleNativeChange}
          className="zone-select__native"
        >
          {names.slice(0, count).map((name, i) => (
            <option key={i} value={i}>{toTitleCase(name)}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={wrapClass}>
      <button
        type="button"
        className="zone-select__trigger"
        onClick={() => setOpen(!open)}
      >
        <i className="ri-layout-grid-line" />
      </button>
      {open && (
        <>
          <div className="zone-select__backdrop" onClick={() => setOpen(false)} />
          <div className={panelClass}>
            {names.slice(0, count).map((name, i) => (
              <button
                key={i}
                type="button"
                className={`zone-select__option ${current[i] ? "zone-select__option--on" : ""}`}
                onClick={() => toggle(i)}
              >
                {toTitleCase(name)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  status,
  setTemp,
  roomTemp,
  isOn,
  onTogglePower,
  onTempChange,
  nextSchedule,
  paused,
  onOpenSchedule,
  fanSpeed,
  fanSpeeds,
  onFanChange,
  zones,
  zoneInfo,
  onZoneChange,
}) {
  let scheduleIcon, scheduleLabel;
  if (paused) {
    scheduleIcon = "ri-time-line";
    scheduleLabel = "paused";
  } else if (!nextSchedule) {
    scheduleIcon = "ri-time-line";
    scheduleLabel = "schedule";
  } else {
    scheduleIcon =
      nextSchedule.action === "off"
        ? "ri-shut-down-line"
        : getModeIcon(nextSchedule.mode);
    scheduleLabel = formatTime12(nextSchedule.time);
  }

  return (
    <div className={`home ${!isOn ? "home--off" : ""}`}>
      <button
        className={`home__next-schedule ${!isOn ? "home__next-schedule--off" : ""}`}
        onClick={onOpenSchedule}
      >
        <i className={scheduleIcon} />
        {scheduleLabel}
      </button>

      <div className="home__body">
        <div className="home__left">
          <div className="home__temp-display">
            <span className="home__temp-num">{setTemp ?? "—"}</span>
            <span className="home__temp-unit">°</span>
          </div>
          {roomTemp != null && (
            <div className="home__room-temp">Room {roomTemp}°</div>
          )}
        </div>

        <div className="home__right">
          <NeuSlider
            value={setTemp ?? 22}
            min={16}
            max={30}
            step={1}
            onChange={onTempChange}
            trackHeight={280}
            showButtons
            aria-label="Temperature"
          />
        </div>
      </div>

      <div className="home__footer">
        {isOn && (fanSpeeds?.length > 0 || zoneInfo) && (
          <div className="home__controls">
            {fanSpeeds?.length > 0 && (
              <FanSelect
                value={fanSpeed}
                speeds={fanSpeeds}
                onChange={onFanChange}
              />
            )}
            {zoneInfo && (
              <ZoneSelect
                zones={zones}
                zoneInfo={zoneInfo}
                onChange={onZoneChange}
                accent={!isAllZones(zones, zoneInfo.count)}
              />
            )}
          </div>
        )}
        <NeuSwitch
          checked={isOn}
          onChange={onTogglePower}
          height={40}
          aria-label="Power"
        />
      </div>
    </div>
  );
}

// ── Schedule List (with FLIP reorder animation) ───────────────────────────────

function ScheduleList({ schedules, onEditItem }) {
  const itemRefs = useRef({});
  const prevPositionsRef = useRef({});
  const isFirstRender = useRef(true);

  useLayoutEffect(() => {
    const newPositions = {};
    schedules.forEach((s) => {
      const el = itemRefs.current[s.id];
      if (el) newPositions[s.id] = el.getBoundingClientRect().top;
    });

    if (!isFirstRender.current) {
      schedules.forEach((s) => {
        const el = itemRefs.current[s.id];
        if (!el) return;
        const oldTop = prevPositionsRef.current[s.id];
        const newTop = newPositions[s.id];

        if (oldTop === undefined) {
          // New item — slide + fade in
          el.animate(
            [
              { opacity: "0", transform: "translateY(20px)" },
              { opacity: "1", transform: "translateY(0)" },
            ],
            {
              duration: 320,
              easing: "cubic-bezier(0.32, 0.72, 0, 1)",
              fill: "backwards",
            },
          );
        } else {
          const dy = oldTop - newTop;
          if (Math.abs(dy) > 1) {
            // Existing item moved — FLIP to new position
            el.animate(
              [
                { transform: `translateY(${dy}px)` },
                { transform: "translateY(0)" },
              ],
              { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
            );
          }
        }
      });
    }

    prevPositionsRef.current = newPositions;
    isFirstRender.current = false;
  });

  return (
    <>
      {schedules.map((s) => (
        <div
          key={s.id}
          ref={(el) => {
            itemRefs.current[s.id] = el;
          }}
          className="schedule-item"
          onClick={() => onEditItem(s)}
        >
          <div className="schedule-item__left">
            <span className="schedule-item__icon">
              {s.action === "off" ? (
                <i className="ri-shut-down-line" />
              ) : (
                <i className={getModeIcon(s.mode)} />
              )}
            </span>
            <span className="schedule-item__time">{formatTime12(s.time)}</span>
          </div>
          <div className="schedule-item__right">
            {s.fan && (
              <span className="schedule-item__fan schedule-item__fan--set">
                <FanIcon className="schedule-item__fan-icon" />
                {FAN_LABEL_MAP[s.fan] ?? s.fan}
              </span>
            )}
            {s.zones && (
              <span className="schedule-item__zone schedule-item__zone--set">
                <i className="ri-layout-grid-line" />
              </span>
            )}
            {s.action === "setpoint" && s.temperature != null && (
              <span className="schedule-item__temp">{s.temperature}°</span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Schedule Screen ──────────────────────────────────────────────────────────

function ScheduleScreen({
  schedules,
  onDone,
  onEditItem,
  onAddItem,
  paused,
  onTogglePause,
}) {
  return (
    <div className="schedule-screen">
      <div className="schedule-list">
        <ScheduleList schedules={schedules} onEditItem={onEditItem} />
        <ActionButton
          className="schedule-add"
          variant="primary"
          onClick={onAddItem}
        >
          <i className="ri-add-line" />
          Add
        </ActionButton>
      </div>

      <div className="schedule-bar">
        <div className="schedule-bar__left">
          <NeuPushButton
            checked={paused}
            onChange={onTogglePause}
            aria-label="Pause schedule"
          />
        </div>
        <ActionButton
          className="schedule-bar__done"
          variant="secondary"
          onClick={onDone}
        >
          Done
        </ActionButton>
      </div>
    </div>
  );
}

// ── Edit / Add Modal ─────────────────────────────────────────────────────────

function EditModal({ item, onSave, onCancel, onRemove, fanSpeeds, zoneInfo }) {
  const [time, setTime] = useState(item?.time || "16:00");
  const [temp, setTemp] = useState(item?.temperature ?? 22);
  const [dialValue, setDialValue] = useState(
    item?.action === "off" ? "power" : (item?.mode || "cool"),
  );
  const [fan, setFan] = useState(item?.fan || null);
  const [zones, setZones] = useState(() => {
    if (!item?.zones) return null;
    return typeof item.zones === "string" ? JSON.parse(item.zones) : item.zones;
  });
  const [exiting, setExiting] = useState(false);
  const timeInputRef = useRef(null);

  const handleTimeClick = () => {
    try {
      timeInputRef.current?.showPicker();
    } catch {
      timeInputRef.current?.focus();
    }
  };

  const isOff = dialValue === "power";
  const tempDisabled = isOff || dialValue === "fan";

  const dismiss = (callback) => {
    setExiting(true);
    setTimeout(callback, 200);
  };

  const handleSave = () => {
    dismiss(() =>
      onSave({
        ...(item || {}),
        time,
        temperature: tempDisabled ? null : temp,
        mode: isOff ? null : dialValue,
        action: isOff ? "off" : "setpoint",
        fan: isOff ? null : fan,
        zones: isOff ? null : zones,
        enabled: true,
      })
    );
  };

  return (
    <div className={`edit-overlay${exiting ? " edit-overlay--exiting" : ""}`}>
      <div className="edit-overlay__backdrop" onClick={() => dismiss(onCancel)} />
      <div className="edit-sheet">
        <div className="edit-sheet__header">
          <div className="edit-sheet__header-left">
            {!isOff && fanSpeeds?.length > 0 && (
              <FanSelect
                value={fan}
                speeds={fanSpeeds}
                onChange={setFan}
                accent={!!fan}
              />
            )}
            {!isOff && zoneInfo && (
              <ZoneSelect
                zones={zones}
                zoneInfo={zoneInfo}
                onChange={setZones}
                accent={!!zones && !isAllZones(zones, zoneInfo.count)}
                direction="down"
              />
            )}
          </div>
          <div className="edit-sheet__header-right">
            <div className="time-input-wrapper" onClick={handleTimeClick}>
              <span className="edit-sheet__time">{formatTime12(time)}</span>
              <input
                ref={timeInputRef}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            {!tempDisabled && <span className="edit-sheet__temp">{temp}°</span>}
          </div>
        </div>

        <div className="edit-sheet__body">
          <ModeDial value={dialValue} onChange={(id) => setDialValue(id)} />
          <NeuSlider
            value={temp}
            min={16}
            max={30}
            step={1}
            onChange={setTemp}
            trackHeight={200}
            showButtons
            disabled={tempDisabled}
            aria-label="Temperature"
          />
        </div>

        <div className="edit-sheet__footer">
          {item?.id && (
            <button
              className="edit-sheet__remove"
              onClick={() => dismiss(onRemove)}
              aria-label="Remove"
            >
              <i className="ri-delete-bin-line" />
            </button>
          )}
          <div className="edit-sheet__actions">
            <ActionButton
              className="edit-sheet__cancel"
              variant="secondary"
              onClick={() => dismiss(onCancel)}
            >
              Cancel
            </ActionButton>
            <ActionButton
              className="edit-sheet__save"
              variant="primary"
              onClick={handleSave}
            >
              Done
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState(null);
  const [schedules, setSchedules] = useState(MOCK_SCHEDULES);
  const [screen, setScreen] = useState("home"); // "home" | "schedule"
  const [editItem, setEditItem] = useState(null); // null | schedule object | "new"
  const [paused, setPaused] = useState(false);

  const [localTemp, setLocalTemp] = useState(24);
  const [localPower, setLocalPower] = useState(true);
  const [localFan, setLocalFan] = useState("A");
  const [localZones, setLocalZones] = useState(null);
  const [fanSpeeds, setFanSpeeds] = useState([]);
  const [zoneInfo, setZoneInfo] = useState(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // After a user action, ignore device state echoes for a grace period so
  // optimistic UI isn't overwritten by a stale read-back from the Daikin.
  const lastActionRef = useRef(0);
  const GRACE_MS = 5000;

  const loadStatus = useCallback(async () => {
    try {
      const s = await api("/api/status");
      setStatus(s);
      const stale = Date.now() - lastActionRef.current < GRACE_MS;
      if (!stale) {
        if (s.set_temp != null) setLocalTemp(s.set_temp);
        if (s.power != null) setLocalPower(s.power);
        if (s.fan != null) setLocalFan(s.fan);
        if (s.zones) setLocalZones(s.zones);
      }
    } catch {
      setStatus(null);
    } finally {
      setInitialLoaded(true);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const data = await api("/api/schedules");
      if (data?.length)
        setSchedules([...data].sort((a, b) => a.time.localeCompare(b.time)));
    } catch {
      // keep mock data
    }
  }, []);

  const loadCapabilities = useCallback(async () => {
    try {
      const data = await api("/api/capabilities");
      if (data?.fan_speeds) setFanSpeeds(data.fan_speeds);
      if (data?.zones) setZoneInfo(data.zones);
    } catch {
      // keep empty
    }
  }, []);

  const loadPaused = useCallback(async () => {
    try {
      const data = await api("/api/scheduler");
      setPaused(data.paused);
    } catch {
      // keep local state
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadSchedules();
    loadPaused();
    loadCapabilities();
    const t = setInterval(loadStatus, 30_000);
    return () => clearInterval(t);
  }, [loadStatus, loadSchedules, loadPaused, loadCapabilities]);

  const togglePower = async (next) => {
    lastActionRef.current = Date.now();
    setLocalPower(next);
    try {
      await api("/api/control", {
        method: "POST",
        body: JSON.stringify({ power: next ? "1" : "0" }),
      });
    } catch {
      // keep local state
    }
  };

  const tempDebounceRef = useRef(null);
  const needsPowerOnRef = useRef(false);

  const changeTemperature = (temperature) => {
    lastActionRef.current = Date.now();
    setLocalTemp(temperature);
    if (!localPower) {
      setLocalPower(true);
      needsPowerOnRef.current = true;
    }

    clearTimeout(tempDebounceRef.current);
    tempDebounceRef.current = setTimeout(async () => {
      try {
        const body = needsPowerOnRef.current
          ? { power: "1", temperature }
          : { temperature };
        needsPowerOnRef.current = false;
        await api("/api/control", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch {
        // keep local state
      }
    }, 300);
  };

  const changeFanSpeed = async (fan) => {
    lastActionRef.current = Date.now();
    setLocalFan(fan);
    try {
      await api("/api/control", {
        method: "POST",
        body: JSON.stringify({ fan }),
      });
    } catch {
      // keep local state
    }
  };

  const changeZones = async (zones) => {
    lastActionRef.current = Date.now();
    setLocalZones(zones);
    try {
      await api("/api/zones", {
        method: "POST",
        body: JSON.stringify({ zones: zones || Array(8).fill(1) }),
      });
    } catch {
      // keep local state
    }
  };

  const togglePause = async (next) => {
    setPaused(next);
    try {
      await api("/api/scheduler", {
        method: "POST",
        body: JSON.stringify({ paused: next }),
      });
    } catch {
      // keep local state
    }
  };

  const sortByTime = (arr) =>
    [...arr].sort((a, b) => a.time.localeCompare(b.time));

  const saveScheduleItem = async (form) => {
    if (form.id) {
      setSchedules((prev) =>
        sortByTime(prev.map((s) => (s.id === form.id ? { ...s, ...form } : s))),
      );
      try {
        await api(`/api/schedules/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        await loadSchedules();
      } catch {
        // keep local
      }
    } else {
      const newItem = { ...form, id: Date.now() };
      setSchedules((prev) => sortByTime([...prev, newItem]));
      try {
        await api("/api/schedules", {
          method: "POST",
          body: JSON.stringify(form),
        });
        await loadSchedules();
      } catch {
        // keep local
      }
    }
    setEditItem(null);
  };

  const removeScheduleItem = async (id) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setEditItem(null);
    try {
      await api(`/api/schedules/${id}`, { method: "DELETE" });
    } catch {
      // keep local removal
    }
  };

  const nextSchedule = getNextSchedule(schedules);
  const roomTemp = status?.indoor_temp ?? null;
  const setTemp = localTemp;
  const isOn = localPower;

  const flipped = screen === "schedule";

  if (!initialLoaded) {
    return (
      <div className="interstitial">
        <div className="interstitial-spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      <div className={`card-flipper${flipped ? " card-flipper--flipped" : ""}`}>
        <div className="card-face card-face--front">
          <HomeScreen
            status={status}
            setTemp={setTemp}
            roomTemp={roomTemp}
            isOn={isOn}
            onTogglePower={togglePower}
            onTempChange={changeTemperature}
            nextSchedule={nextSchedule}
            paused={paused}
            onOpenSchedule={() => setScreen("schedule")}
            fanSpeed={localFan}
            fanSpeeds={fanSpeeds}
            onFanChange={changeFanSpeed}
            zones={localZones}
            zoneInfo={zoneInfo}
            onZoneChange={changeZones}
          />
        </div>
        <div className="card-face card-face--back">
          <ScheduleScreen
            schedules={schedules}
            onDone={() => setScreen("home")}
            onEditItem={(item) => setEditItem(item)}
            onAddItem={() => setEditItem("new")}
            paused={paused}
            onTogglePause={togglePause}
          />
          {editItem && (
            <EditModal
              item={editItem === "new" ? null : editItem}
              onSave={saveScheduleItem}
              onCancel={() => setEditItem(null)}
              onRemove={editItem !== "new" ? () => removeScheduleItem(editItem.id) : undefined}
              fanSpeeds={fanSpeeds}
              zoneInfo={zoneInfo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
