// Adaptive input components for each onboarding step.
// Each input is its OWN UX — text, scroll wheels, segmented chips, ruler.

const PRIMARY_GRADIENT = "linear-gradient(90deg, #9810fa 0%, #155dfc 100%)";

// ─── Text input bar (chat-style) ──────────────────────────────
const NomTextInput = ({ value, onChange, onSubmit, placeholder, autoFocus }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (autoFocus && ref.current) {
      const t = setTimeout(() => ref.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);
  const can = value.trim().length > 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
    }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && can && onSubmit()}
        placeholder={placeholder}
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          fontSize: 16, color: "#101828", padding: "4px 8px",
          fontFamily: "inherit",
        }}
      />
      <button
        onClick={() => can && onSubmit()}
        disabled={!can}
        style={{
          width: 36, height: 36, borderRadius: 999, border: "none",
          background: can ? PRIMARY_GRADIENT : "#d1d5dc",
          color: "#fff", cursor: can ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
};

// ─── Choice cards (goal, sex, activity) ───────────────────────
const NomChoiceList = ({ options, selected, onSelect }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {options.map((opt) => {
      const isSel = selected === opt.id;
      return (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          style={{
            textAlign: "left", padding: "12px 14px",
            background: "#fff",
            border: `1.5px solid ${isSel ? "#101828" : "#e5e7eb"}`,
            borderRadius: 14, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12,
            fontFamily: "inherit",
            transition: "border-color 0.15s, transform 0.1s",
            transform: isSel ? "scale(1.005)" : "scale(1)",
          }}
        >
          {opt.emoji && (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: opt.tint || "#f9fafb",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
            }}>{opt.emoji}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 600, color: "#101828",
              letterSpacing: -0.2,
            }}>{opt.label}</div>
            {opt.description && (
              <div style={{
                fontSize: 12.5, color: "#6a7282", marginTop: 2,
                lineHeight: 1.35,
              }}>{opt.description}</div>
            )}
          </div>
          <div style={{
            width: 22, height: 22, borderRadius: 999, flexShrink: 0,
            border: `2px solid ${isSel ? "#101828" : "#e5e7eb"}`,
            background: isSel ? "#101828" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}>
            {isSel && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l5 5L20 6" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </button>
      );
    })}
  </div>
);

// ─── Wheel column (used by DOB) ───────────────────────────────
const WheelCol = ({ items, value, onChange, width, formatter }) => {
  const scrollRef = React.useRef(null);
  const ITEM_H = 36;
  const idx = items.findIndex((x) => x === value);
  const scrollTimer = React.useRef(null);

  React.useEffect(() => {
    if (idx < 0 || !scrollRef.current) return;
    scrollRef.current.scrollTop = idx * ITEM_H;
  }, []);

  const onScroll = () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const i = Math.round(scrollRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, i));
      const newVal = items[clamped];
      if (newVal !== value) onChange(newVal);
      scrollRef.current.scrollTop = clamped * ITEM_H;
    }, 80);
  };

  return (
    <div style={{
      width, height: ITEM_H * 5, position: "relative", overflow: "hidden",
    }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory",
          scrollbarWidth: "none", msOverflowStyle: "none",
          padding: `${ITEM_H * 2}px 0`,
        }}
      >
        <style>{`.no-bar::-webkit-scrollbar{display:none}`}</style>
        {items.map((item, i) => {
          const isCenter = i === idx;
          return (
            <div key={i} style={{
              height: ITEM_H, display: "flex", alignItems: "center",
              justifyContent: "center", scrollSnapAlign: "center",
              fontSize: isCenter ? 22 : 18,
              fontWeight: isCenter ? 600 : 400,
              color: isCenter ? "#101828" : "#9ca3af",
              letterSpacing: -0.3,
              transition: "color 0.15s, font-size 0.15s",
            }}>{formatter ? formatter(item) : item}</div>
          );
        })}
      </div>
      {/* center band */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: ITEM_H * 2,
        height: ITEM_H, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(152,16,250,0.06), rgba(21,93,252,0.06))",
        borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb",
      }}/>
      {/* fade top/bottom */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0) 100%)",
        pointerEvents: "none",
      }}/>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: "linear-gradient(0deg, #fff 0%, rgba(255,255,255,0) 100%)",
        pointerEvents: "none",
      }}/>
    </div>
  );
};

// ─── DOB picker (3 wheels) ────────────────────────────────────
const NomDOBPicker = ({ value, onChange }) => {
  // value = {month, day, year}
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = Array.from({length: 31}, (_, i) => i + 1);
  const thisYear = new Date().getFullYear();
  const years = Array.from({length: thisYear - 1920 + 1}, (_, i) => thisYear - i);
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
      padding: "8px 12px", display: "flex", alignItems: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <WheelCol items={months} value={value.month} onChange={(m) => onChange({...value, month: m})} width={70}/>
      <WheelCol items={days} value={value.day} onChange={(d) => onChange({...value, day: d})} width={50}/>
      <WheelCol items={years} value={value.year} onChange={(y) => onChange({...value, year: y})} width={84}/>
    </div>
  );
};

// ─── Unit toggle ──────────────────────────────────────────────
const UnitToggle = ({ value, onChange, options }) => (
  <div style={{
    display: "inline-flex", padding: 3, background: "#f3f4f6",
    borderRadius: 999, gap: 2,
  }}>
    {options.map((o) => {
      const active = value === o.id;
      return (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{
            border: "none", padding: "6px 14px", borderRadius: 999,
            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            background: active ? "#fff" : "transparent",
            color: active ? "#101828" : "#6a7282",
            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}>{o.label}</button>
      );
    })}
  </div>
);

// ─── Height picker (ft/in OR cm) ──────────────────────────────
const NomHeightPicker = ({ value, onChange, unit, onUnitChange }) => {
  // value: { ft, in, cm } depending on unit
  if (unit === "cm") {
    const vals = Array.from({length: 71}, (_, i) => 140 + i);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <UnitToggle value={unit} onChange={onUnitChange} options={[
            {id: "ft", label: "ft / in"}, {id: "cm", label: "cm"}
          ]}/>
        </div>
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
          padding: "8px 12px", display: "flex", justifyContent: "center", gap: 4,
          alignItems: "center",
        }}>
          <WheelCol items={vals} value={value.cm || 170}
            onChange={(cm) => onChange({...value, cm})} width={90}/>
          <div style={{ fontSize: 16, color: "#6a7282", fontWeight: 500 }}>cm</div>
        </div>
      </div>
    );
  }
  const ftVals = [4,5,6,7];
  const inVals = Array.from({length: 12}, (_, i) => i);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <UnitToggle value={unit} onChange={onUnitChange} options={[
          {id: "ft", label: "ft / in"}, {id: "cm", label: "cm"}
        ]}/>
      </div>
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
        padding: "8px 12px", display: "flex", justifyContent: "center", gap: 8,
        alignItems: "center",
      }}>
        <WheelCol items={ftVals} value={value.ft || 5}
          onChange={(ft) => onChange({...value, ft})} width={50}/>
        <div style={{ fontSize: 14, color: "#6a7282", fontWeight: 500 }}>ft</div>
        <WheelCol items={inVals} value={value.in ?? 9}
          onChange={(i) => onChange({...value, in: i})} width={50}/>
        <div style={{ fontSize: 14, color: "#6a7282", fontWeight: 500 }}>in</div>
      </div>
    </div>
  );
};

// ─── Weight ruler (horizontal scrubber) ───────────────────────
const NomWeightRuler = ({ value, onChange, unit, onUnitChange }) => {
  const min = unit === "kg" ? 40 : 80;
  const max = unit === "kg" ? 200 : 400;
  const step = unit === "kg" ? 1 : 1;
  const v = value ?? (unit === "kg" ? 70 : 155);
  const TICK = 8; // px per unit
  const scrollRef = React.useRef(null);
  const scrollTimer = React.useRef(null);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const target = (v - min) * TICK;
    el.scrollLeft = target;
  }, [unit]);

  const handleScroll = () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const x = scrollRef.current.scrollLeft;
      const newV = Math.round(x / TICK / step) * step + min;
      const clamped = Math.max(min, Math.min(max, newV));
      if (clamped !== v) onChange(clamped);
    }, 60);
  };

  const ticks = [];
  for (let i = min; i <= max; i += step) {
    const major = i % (unit === "kg" ? 5 : 10) === 0;
    ticks.push(
      <div key={i} style={{
        width: TICK, height: major ? 22 : 12, flexShrink: 0,
        position: "relative",
        borderLeft: `1px solid ${major ? "#101828" : "#d1d5dc"}`,
      }}>
        {major && (
          <div style={{
            position: "absolute", top: 26, left: -10, width: 20,
            textAlign: "center", fontSize: 10, color: "#6a7282",
            fontVariantNumeric: "tabular-nums",
          }}>{i}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 32, fontWeight: 700, color: "#101828",
          letterSpacing: -0.5, fontVariantNumeric: "tabular-nums",
        }}>
          {v}<span style={{ fontSize: 16, fontWeight: 500, color: "#6a7282", marginLeft: 4 }}>{unit}</span>
        </div>
        <UnitToggle value={unit} onChange={onUnitChange} options={[
          {id: "lbs", label: "lbs"}, {id: "kg", label: "kg"}
        ]}/>
      </div>
      <div style={{
        position: "relative", background: "#fff",
        border: "1px solid #e5e7eb", borderRadius: 16, padding: "12px 0 22px",
        overflow: "hidden",
      }}>
        <div ref={scrollRef} onScroll={handleScroll} style={{
          overflowX: "scroll", overflowY: "hidden", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none", msOverflowStyle: "none",
        }}>
          <style>{`div::-webkit-scrollbar{display:none}`}</style>
          <div style={{
            display: "flex", paddingLeft: "50%", paddingRight: "50%",
            height: 38, alignItems: "flex-start",
          }}>{ticks}</div>
        </div>
        {/* center indicator */}
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
          width: 2, height: 30, background: "#9810fa", borderRadius: 2,
          pointerEvents: "none",
          boxShadow: "0 0 8px rgba(152,16,250,0.4)",
        }}/>
        <div style={{
          position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)",
          width: 0, height: 0, borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent", borderTop: "6px solid #9810fa",
          pointerEvents: "none",
        }}/>
      </div>
    </div>
  );
};

// ─── Confirm button ───────────────────────────────────────────
const NomPrimaryButton = ({ children, onClick, disabled, gradient = true }) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: "14px", borderRadius: 14, border: "none",
    background: disabled ? "#d1d5dc" : (gradient ? PRIMARY_GRADIENT : "#101828"),
    color: "#fff", fontSize: 16, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", letterSpacing: -0.2,
    boxShadow: disabled ? "none" : "0 4px 12px rgba(152,16,250,0.25)",
    transition: "transform 0.1s",
  }}>{children}</button>
);

Object.assign(window, {
  NomTextInput, NomChoiceList, NomDOBPicker, NomHeightPicker,
  NomWeightRuler, NomPrimaryButton, UnitToggle, PRIMARY_GRADIENT,
});
