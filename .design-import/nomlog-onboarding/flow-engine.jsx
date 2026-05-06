// Onboarding flow engine + bot streaming + chat primitives.

const NomBotMessage = ({ text, animate = true, onDone, fontSize = 15 }) => {
  const [displayed, setDisplayed] = React.useState(animate ? "" : text);
  const doneRef = React.useRef(false);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  React.useEffect(() => {
    if (!animate) {
      setDisplayed(text);
      onDoneRef.current && onDoneRef.current();
      return;
    }
    setDisplayed("");
    doneRef.current = false;
    if (!text) return;
    const total = text.length;
    const dur = Math.max(280, Math.min(900, total * 14));
    const start = Date.now();
    const ease = (t) => 1 - (1 - t) * (1 - t);
    let raf;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / dur);
      const chars = Math.max(1, Math.floor(ease(t) * total));
      setDisplayed(text.slice(0, chars));
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current && onDoneRef.current();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { doneRef.current = true; cancelAnimationFrame(raf); };
  }, [text, animate]);

  // split paragraphs on blank lines
  const paragraphs = displayed.split(/\n\n/);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingRight: 28 }}>
      {paragraphs.map((p, i) => (
        <div key={i} style={{
          fontSize, lineHeight: 1.4, color: "#101828",
          letterSpacing: -0.15, whiteSpace: "pre-wrap",
        }}>{p}{i === paragraphs.length - 1 && animate && displayed.length < text.length && (
          <span style={{
            display: "inline-block", width: 8, height: 16,
            background: "#9810fa", marginLeft: 2, verticalAlign: "text-bottom",
            animation: "nomCaret 0.8s steps(2) infinite",
          }}/>
        )}</div>
      ))}
    </div>
  );
};

const NomTaco = ({ size = 22 }) => (
  <div style={{
    width: size + 6, height: size + 6, borderRadius: 999,
    background: "linear-gradient(180deg, #d4f5b8 0%, #ffd86b 50%, #ff8a3d 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    flexShrink: 0,
  }}>
    <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none">
      <path d="M3 14 Q12 4 21 14 L19 18 Q12 20 5 18 Z" fill="#fff8d6" stroke="#7a4a1a" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="9" cy="14" r="0.9" fill="#dc2626"/>
      <circle cx="13" cy="13" r="0.9" fill="#16a34a"/>
      <circle cx="16" cy="14.5" r="0.9" fill="#eab308"/>
    </svg>
  </div>
);

const BotRow = ({ children, showAvatar = true }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
    {showAvatar ? <NomTaco size={22}/> : <div style={{ width: 28, flexShrink: 0 }}/>}
    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>{children}</div>
  </div>
);

const UserBubble = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", marginLeft: 40 }}>
    <div style={{
      background: "#101828", color: "#fff",
      padding: "10px 14px", borderRadius: 18, borderBottomRightRadius: 6,
      fontSize: 15, lineHeight: 1.35, maxWidth: "82%",
      letterSpacing: -0.15,
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    }}>{children}</div>
  </div>
);

// ─── Progress bar (gradient, thin) ────────────────────────────
const NomProgress = ({ value, total }) => {
  const pct = Math.max(0, Math.min(1, value / total)) * 100;
  return (
    <div style={{
      height: 4, background: "#f3f4f6", borderRadius: 999,
      margin: "0 16px", overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: "linear-gradient(90deg, #9810fa 0%, #155dfc 100%)",
        borderRadius: 999, transition: "width 0.45s cubic-bezier(.2,.8,.2,1)",
      }}/>
    </div>
  );
};

Object.assign(window, { NomBotMessage, BotRow, UserBubble, NomTaco, NomProgress });
