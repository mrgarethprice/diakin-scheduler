import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API = process.env.REACT_APP_API_URL || '';

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = { mon:'Mo', tue:'Tu', wed:'We', thu:'Th', fri:'Fr', sat:'Sa', sun:'Su' };
const MODES = ['heat','cool','fan','auto'];
const MODE_ICONS = { heat:'🔥', cool:'❄️', fan:'💨', auto:'⟳' };
const MODE_LABELS = { heat:'Heat', cool:'Cool', fan:'Fan', auto:'Auto' };

function api(path, opts = {}) {
  return fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (r.status === 204) return null;
    return r.json();
  });
}

const DEFAULT_FORM = {
  label: '',
  time: '07:00',
  days: ['mon','tue','wed','thu','fri'],
  temperature: 20,
  mode: 'heat',
  enabled: true,
};

// ── Components ────────────────────────────────────────────────────────────────

function StatusCard({ status, onTogglePower, onTempChange }) {
  const [nudging, setNudging] = useState(false);

  const handlePower = async () => {
    setNudging(true);
    await onTogglePower();
    setNudging(false);
  };

  if (!status) {
    return (
      <div className="status-card status-loading">
        <div className="status-spinner" />
        <span>Connecting to unit…</span>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="status-card status-error">
        <div className="status-error-icon">⚠</div>
        <div>
          <p className="status-error-title">Unit unreachable</p>
          <p className="status-error-sub">{status.error}</p>
        </div>
      </div>
    );
  }

  const isOn = status.power;
  const modeKey = status.mode || 'heat';

  return (
    <div className={`status-card ${isOn ? 'status-on' : 'status-off'}`}>
      <div className="status-top">
        <div className="status-temps">
          <div className="status-set-temp">
            <span className="temp-num">{status.set_temp ?? '—'}</span>
            <span className="temp-unit">°</span>
          </div>
          {status.indoor_temp != null && (
            <div className="status-indoor">
              Room <strong>{status.indoor_temp}°</strong>
            </div>
          )}
          {status.outdoor_temp != null && (
            <div className="status-outdoor">Outside {status.outdoor_temp}°</div>
          )}
        </div>

        <button
          className={`power-btn ${isOn ? 'power-on' : 'power-off'} ${nudging ? 'nudging' : ''}`}
          onClick={handlePower}
          aria-label="Toggle power"
        >
          ⏻
        </button>
      </div>

      <div className="status-bottom">
        <span className="status-mode-badge">
          {MODE_ICONS[modeKey]} {MODE_LABELS[modeKey] || modeKey}
        </span>
        <span className="status-state">{isOn ? 'Running' : 'Standby'}</span>
      </div>
    </div>
  );
}

function ScheduleItem({ schedule, onEdit, onDelete, onToggle }) {
  const dayStr = schedule.days.map(d => DAY_LABELS[d]).join(' ');

  return (
    <div className={`schedule-item ${schedule.enabled ? 'sched-enabled' : 'sched-disabled'}`}>
      <button
        className={`sched-toggle ${schedule.enabled ? 'tog-on' : 'tog-off'}`}
        onClick={() => onToggle(schedule)}
        aria-label="Toggle schedule"
      />

      <div className="sched-body" onClick={() => onEdit(schedule)}>
        <div className="sched-time">{schedule.time}</div>
        <div className="sched-meta">
          <span className="sched-label">{schedule.label}</span>
          <span className="sched-days">{dayStr}</span>
        </div>
        <div className="sched-right">
          <span className="sched-temp">{schedule.temperature}°</span>
          <span className="sched-mode">{MODE_ICONS[schedule.mode]}</span>
        </div>
      </div>

      <button className="sched-delete" onClick={() => onDelete(schedule.id)} aria-label="Delete">
        ✕
      </button>
    </div>
  );
}

function Sheet({ open, onClose, children }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

function ScheduleForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = d =>
    set('days', form.days.includes(d) ? form.days.filter(x => x !== d) : [...form.days, d]);

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const tempStep = (delta) =>
    set('temperature', Math.max(16, Math.min(30, +(form.temperature + delta).toFixed(1))));

  return (
    <div className="form">
      <div className="form-header">
        <h2>{initial?.id ? 'Edit' : 'New'} Schedule</h2>
        <button className="form-close" onClick={onClose}>✕</button>
      </div>

      <div className="form-field">
        <label>Label</label>
        <input
          className="form-input"
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder="e.g. Morning warmup"
          maxLength={40}
        />
      </div>

      <div className="form-field">
        <label>Time</label>
        <input
          className="form-input form-time"
          type="time"
          value={form.time}
          onChange={e => set('time', e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>Days</label>
        <div className="day-picker">
          {DAYS.map(d => (
            <button
              key={d}
              className={`day-btn ${form.days.includes(d) ? 'day-active' : ''}`}
              onClick={() => toggleDay(d)}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-field">
        <label>Temperature</label>
        <div className="temp-picker">
          <button className="temp-step" onClick={() => tempStep(-0.5)}>−</button>
          <span className="temp-display">{form.temperature}<small>°C</small></span>
          <button className="temp-step" onClick={() => tempStep(+0.5)}>+</button>
        </div>
        <input
          type="range" min="16" max="30" step="0.5"
          value={form.temperature}
          onChange={e => set('temperature', parseFloat(e.target.value))}
          className="temp-slider"
        />
      </div>

      <div className="form-field">
        <label>Mode</label>
        <div className="mode-picker">
          {MODES.map(m => (
            <button
              key={m}
              className={`mode-btn ${form.mode === m ? 'mode-active' : ''}`}
              onClick={() => set('mode', m)}
            >
              <span>{MODE_ICONS[m]}</span>
              <span>{MODE_LABELS[m]}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        className="save-btn"
        onClick={handleSave}
        disabled={saving || !form.label.trim() || form.days.length === 0}
      >
        {saving ? 'Saving…' : 'Save Schedule'}
      </button>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [status,    setStatus]    = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [sheet,     setSheet]     = useState(null);   // null | {mode:'add'} | {mode:'edit', schedule}
  const [error,     setError]     = useState(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api('/api/status')); }
    catch { setStatus({ connected: false, error: 'Cannot reach backend' }); }
  }, []);

  const loadSchedules = useCallback(async () => {
    try { setSchedules(await api('/api/schedules')); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    loadStatus();
    loadSchedules();
    const t = setInterval(loadStatus, 30_000);
    return () => clearInterval(t);
  }, [loadStatus, loadSchedules]);

  const togglePower = async () => {
    if (!status) return;
    await api('/api/control', {
      method: 'POST',
      body: JSON.stringify({ power: status.power ? '0' : '1' }),
    });
    await loadStatus();
  };

  const saveSchedule = async (form) => {
    if (form.id) {
      await api(`/api/schedules/${form.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
    } else {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(form),
      });
    }
    await loadSchedules();
    setSheet(null);
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    await api(`/api/schedules/${id}`, { method: 'DELETE' });
    await loadSchedules();
  };

  const toggleSchedule = async (s) => {
    await api(`/api/schedules/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await loadSchedules();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <h1 className="app-title">Heat</h1>
          <span className="app-sub">Daikin Scheduler</span>
        </div>
      </header>

      <main className="app-main">
        <StatusCard status={status} onTogglePower={togglePower} />

        <section className="schedule-section">
          <div className="section-header">
            <h2 className="section-title">Schedule</h2>
            <button className="add-btn" onClick={() => setSheet({ mode: 'add' })}>
              + Add
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {schedules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⏱</div>
              <p>No schedules yet</p>
              <p className="empty-sub">Tap + Add to create your first temperature setpoint</p>
            </div>
          ) : (
            <div className="schedule-list">
              {schedules.map(s => (
                <ScheduleItem
                  key={s.id}
                  schedule={s}
                  onEdit={(s) => setSheet({ mode: 'edit', schedule: s })}
                  onDelete={deleteSchedule}
                  onToggle={toggleSchedule}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
      >
        <ScheduleForm
          initial={sheet?.mode === 'edit' ? sheet.schedule : null}
          onSave={saveSchedule}
          onClose={() => setSheet(null)}
        />
      </Sheet>
    </div>
  );
}
