// Splash, Review, and Completion screens.

const NomSplash = ({ onStart }) => {
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "space-between",
      padding: "80px 28px 40px", boxSizing: "border-box",
      background: "linear-gradient(180deg, #fff 0%, #faf5ff 60%, #f3e8ff 100%)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, marginTop: 60 }}>
        <div style={{
          width: 120, height: 120, borderRadius: 28,
          background: "#fff",
          boxShadow: "0 12px 32px rgba(152,16,250,0.18), 0 2px 6px rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "nomBob 3s ease-in-out infinite",
        }}>
          <img src="assets/nomlog-logo.png" alt="" style={{ width: 92, height: 92, objectFit: "contain" }}/>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 40, fontWeight: 700, color: "#101828",
            letterSpacing: -1.2, lineHeight: 1.05,
          }}>nomlog</div>
          <div style={{
            fontSize: 16, color: "#4a5565", marginTop: 8,
            letterSpacing: -0.2, lineHeight: 1.4, maxWidth: 280,
          }}>the friendliest way to track what you're nomming on.</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
        <div style={{
          display: "flex", flexDirection: "column", gap: 10, marginBottom: 8,
        }}>
          {[
            { emoji: "💬", text: "Tell us what you ate. We do the math." },
            { emoji: "📊", text: "See macros, calories, and trends in one tap." },
            { emoji: "🔥", text: "Custom daily targets, shaped to your goal." },
          ].map((row, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", background: "rgba(255,255,255,0.7)",
              borderRadius: 14, backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.8)",
            }}>
              <div style={{ fontSize: 20 }}>{row.emoji}</div>
              <div style={{ fontSize: 14, color: "#101828", letterSpacing: -0.15 }}>{row.text}</div>
            </div>
          ))}
        </div>
        <window.NomPrimaryButton onClick={onStart}>Let's nom on in →</window.NomPrimaryButton>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "#6a7282", marginTop: 4 }}>
          takes about a minute · pinky promise
        </div>
      </div>
    </div>
  );
};

const ReviewRow = ({ label, value, onEdit }) => (
  <button onClick={onEdit} style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: 14, cursor: "pointer", width: "100%", textAlign: "left",
    fontFamily: "inherit",
  }}>
    <div>
      <div style={{ fontSize: 11, color: "#6a7282", textTransform: "uppercase",
        letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, color: "#101828", fontWeight: 500, marginTop: 3,
        letterSpacing: -0.2 }}>{value || "—"}</div>
    </div>
    <div style={{ fontSize: 12, color: "#9810fa", fontWeight: 600 }}>Edit</div>
  </button>
);

const NomReview = ({ state, onEdit, onComplete }) => {
  const goal = window.GOAL_OPTIONS.find((g) => g.id === state.goal);
  const sex = window.SEX_OPTIONS.find((s) => s.id === state.sex);
  const activity = window.ACTIVITY_OPTIONS.find((a) => a.id === state.activity);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ReviewRow label="Name"     value={state.name}                            onEdit={() => onEdit("name")}/>
      <ReviewRow label="Goal"     value={goal?.label}                           onEdit={() => onEdit("goal")}/>
      <ReviewRow label="Birthday" value={window.formatDOB(state.dob)}           onEdit={() => onEdit("age")}/>
      <ReviewRow label="Height"   value={window.formatHeight(state.height, state.heightUnit)} onEdit={() => onEdit("height")}/>
      <ReviewRow label="Weight"   value={state.weight ? `${state.weight} ${state.weightUnit}` : ""} onEdit={() => onEdit("weight")}/>
      <ReviewRow label="Sex"      value={sex?.label}                            onEdit={() => onEdit("sex")}/>
      <ReviewRow label="Activity" value={activity?.label}                       onEdit={() => onEdit("activity")}/>
      <div style={{ marginTop: 16 }}>
        <window.NomPrimaryButton onClick={onComplete}>Crunch the nomz →</window.NomPrimaryButton>
      </div>
    </div>
  );
};

const NomComplete = ({ state, targets, onFinish }) => {
  const [reveal, setReveal] = React.useState(0);
  React.useEffect(() => {
    const timers = [180, 480, 760, 1040].map((d, i) =>
      setTimeout(() => setReveal((r) => Math.max(r, i + 1)), d)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  React.useLayoutEffect(() => {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }, [reveal]);
  const macros = [
    { label: "Protein", value: `${targets.protein}g`, color: "#dc2626", bg: "#ffe2e2", icon: "dumbbell" },
    { label: "Carbs",   value: `${targets.carbs}g`,   color: "#ca8a04", bg: "#fef9c2", icon: "wheat" },
    { label: "Fat",     value: `${targets.fat}g`,     color: "#9810fa", bg: "#e9d5ff", icon: "flame" },
  ];
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      padding: "80px 24px 32px", boxSizing: "border-box",
      background: "linear-gradient(180deg, #fff 0%, #faf5ff 100%)",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div style={{
          opacity: reveal >= 1 ? 1 : 0,
          transform: reveal >= 1 ? "scale(1)" : "scale(0.8)",
          transition: "all 0.4s cubic-bezier(.2,.8,.2,1)",
        }}>
          <window.NomTaco size={48}/>
        </div>
        <div style={{
          textAlign: "center",
          opacity: reveal >= 1 ? 1 : 0,
          transform: reveal >= 1 ? "translateY(0)" : "translateY(8px)",
          transition: "all 0.4s 0.1s cubic-bezier(.2,.8,.2,1)",
        }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#101828", letterSpacing: -0.6 }}>
            you're in, {state.name?.trim() || "friend"}!
          </div>
          <div style={{ fontSize: 14, color: "#4a5565", marginTop: 6, lineHeight: 1.4 }}>
            here's your custom nom-budget for the day.
          </div>
        </div>

        {/* Calorie ring */}
        <div style={{
          opacity: reveal >= 2 ? 1 : 0,
          transform: reveal >= 2 ? "scale(1)" : "scale(0.92)",
          transition: "all 0.5s cubic-bezier(.2,.8,.2,1)",
          width: 168, height: 168, borderRadius: 999,
          background: "conic-gradient(#9810fa 0deg, #155dfc 280deg, #f3e8ff 280deg)",
          padding: 6, marginTop: 8,
        }}>
          <div style={{
            width: "100%", height: "100%", borderRadius: 999, background: "#fff",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: 11, color: "#6a7282", textTransform: "uppercase",
              letterSpacing: 0.8, fontWeight: 600 }}>daily target</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: "#101828",
              letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>{targets.calories}</div>
            <div style={{ fontSize: 12, color: "#6a7282" }}>calories</div>
          </div>
        </div>

        <div style={{
          display: "flex", gap: 8, width: "100%",
          opacity: reveal >= 3 ? 1 : 0,
          transform: reveal >= 3 ? "translateY(0)" : "translateY(8px)",
          transition: "all 0.4s cubic-bezier(.2,.8,.2,1)",
        }}>
          {macros.map((m) => (
            <div key={m.label} style={{
              flex: 1, padding: "12px 8px", borderRadius: 14,
              border: "1px solid #e5e7eb", background: "#fff",
              textAlign: "center",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: m.bg,
                color: m.color, margin: "0 auto 6px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i data-lucide={m.icon} style={{ width: 16, height: 16, strokeWidth: 2.2 }}/>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#101828",
                letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
              <div style={{ fontSize: 11, color: "#6a7282", marginTop: 1 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        opacity: reveal >= 4 ? 1 : 0,
        transform: reveal >= 4 ? "translateY(0)" : "translateY(12px)",
        transition: "all 0.4s cubic-bezier(.2,.8,.2,1)",
      }}>
        <window.NomPrimaryButton onClick={onFinish}>Start nomming →</window.NomPrimaryButton>
        <div style={{ textAlign: "center", fontSize: 12, color: "#6a7282", marginTop: 10 }}>
          you can tweak these any time in settings.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { NomSplash, NomReview, NomComplete });
