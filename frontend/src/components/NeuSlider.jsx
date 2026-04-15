import React, { useCallback, useRef } from "react";
import "./NeuSlider.css";

const THUMB_H = 96;

export default function NeuSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  trackHeight = 280,
  showButtons = false,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}) {
  const trackRef = useRef(null);

  const clamp = useCallback(
    (raw) => {
      const stepped = Math.round((raw - min) / step) * step + min;
      return Math.max(min, Math.min(max, parseFloat(stepped.toFixed(10))));
    },
    [min, max, step],
  );

  const fraction = max > min ? (value - min) / (max - min) : 0;

  const resolveFromY = useCallback(
    (clientY) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const travel = rect.height - THUMB_H;
      const y = clientY - rect.top - THUMB_H / 2;
      const frac = 1 - Math.max(0, Math.min(1, y / travel));
      const next = clamp(min + frac * (max - min));
      onChange?.(next);
    },
    [clamp, min, max, onChange],
  );

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      resolveFromY(e.clientY);

      const onMove = (ev) => resolveFromY(ev.clientY);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [resolveFromY],
  );

  const handleKeyDown = useCallback(
    (e) => {
      let next;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        next = clamp(value + step);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        next = clamp(value - step);
      } else {
        return;
      }
      e.preventDefault();
      onChange?.(next);
    },
    [value, step, clamp, onChange],
  );

  return (
    <div
      className={`neu-slider ${className}`.trim()}
      style={{
        "--ns-track-height": `${trackHeight}px`,
        pointerEvents: disabled ? "none" : undefined,
      }}
      aria-disabled={disabled || undefined}
    >
      {showButtons && (
        <button
          type="button"
          className="neu-slider__btn"
          onClick={() => onChange?.(clamp(value + step))}
          aria-label="Increase"
          style={{ visibility: disabled ? "hidden" : undefined }}
        >
          <i className="ri-add-line" aria-hidden />
        </button>
      )}

      <div
        className="neu-slider__track-area"
        ref={trackRef}
        onPointerDown={handlePointerDown}
      >
        <div className="neu-slider__track" />
        <div
          className="neu-slider__thumb"
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
          style={{ "--ns-fraction": fraction }}
        >
          <div className="neu-slider__ridge-container">
            <div className="neu-slider__ridge" />
            <div className="neu-slider__ridge" />
            <div className="neu-slider__ridge" />
            <div className="neu-slider__ridge" />
          </div>
        </div>
      </div>

      {showButtons && (
        <button
          type="button"
          className="neu-slider__btn"
          onClick={() => onChange?.(clamp(value - step))}
          aria-label="Decrease"
          style={{ visibility: disabled ? "hidden" : undefined }}
        >
          <i className="ri-subtract-line" aria-hidden />
        </button>
      )}
    </div>
  );
}
