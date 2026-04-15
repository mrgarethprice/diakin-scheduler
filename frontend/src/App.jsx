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

// ── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  status,
  setTemp,
  roomTemp,
  isOn,
  onTogglePower,
  onTempChange,
  nextSchedule,
  onOpenSchedule,
}) {
  return (
    <div className={`home ${!isOn ? "home--off" : ""}`}>
      <button
        className={`home__next-schedule ${!isOn ? "home__next-schedule--off" : ""}`}
        onClick={onOpenSchedule}
      >
        <i className="ri-time-line" />
        {nextSchedule ? formatTime12(nextSchedule.time) : "No schedule"}
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
          {s.action === "setpoint" && s.temperature != null && (
            <span className="schedule-item__temp">{s.temperature}°</span>
          )}
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

function EditModal({ item, onSave, onCancel, onRemove }) {
  // "power" slot on the dial represents action:"off"; all other slots are modes
  const [time, setTime] = useState(item?.time || "16:00");
  const [temp, setTemp] = useState(item?.temperature ?? 22);
  const [dialValue, setDialValue] = useState(
    item?.action === "off" ? "power" : (item?.mode || "cool"),
  );
  const [exiting, setExiting] = useState(false);

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
        enabled: true,
      })
    );
  };

  return (
    <div className={`edit-overlay${exiting ? " edit-overlay--exiting" : ""}`}>
      <div className="edit-overlay__backdrop" onClick={() => dismiss(onCancel)} />
      <div className="edit-sheet">
        <div className="edit-sheet__header">
          <label className="time-input-wrapper">
            <span className="edit-sheet__time">{formatTime12(time)}</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {!tempDisabled && <span className="edit-sheet__temp">{temp}°</span>}
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
          <ActionButton
            className="edit-sheet__cancel"
            variant="secondary"
            onClick={() => dismiss(onCancel)}
          >
            Cancel
          </ActionButton>
          {item?.id && (
            <ActionButton
              className="edit-sheet__remove"
              variant="danger"
              onClick={() => dismiss(onRemove)}
            >
              Remove
            </ActionButton>
          )}
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

  const loadStatus = useCallback(async () => {
    try {
      const s = await api("/api/status");
      setStatus(s);
      if (s.set_temp != null) setLocalTemp(s.set_temp);
      if (s.power != null) setLocalPower(s.power);
    } catch {
      setStatus(null);
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
    const t = setInterval(loadStatus, 30_000);
    return () => clearInterval(t);
  }, [loadStatus, loadSchedules, loadPaused]);

  const togglePower = async (next) => {
    setLocalPower(next);
    try {
      await api("/api/control", {
        method: "POST",
        body: JSON.stringify({ power: next ? "1" : "0" }),
      });
      await loadStatus();
    } catch {
      // keep local state
    }
  };

  const changeTemperature = async (temperature) => {
    setLocalTemp(temperature);
    try {
      const body = localPower ? { temperature } : { power: "1", temperature };
      await api("/api/control", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadStatus();
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
  const roomTemp = status?.indoor_temp ?? 23;
  const setTemp = status?.set_temp ?? localTemp;
  const isOn = status?.power ?? localPower;

  const flipped = screen === "schedule";

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
            onOpenSchedule={() => setScreen("schedule")}
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
