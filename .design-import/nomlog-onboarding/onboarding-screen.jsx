// Main onboarding screen — chat-style conversation with adaptive inputs.

const OnboardingScreen = ({ tweaks, onComplete: onAllDone }) => {
  // Steps included based on tweaks (skip toggles)
  const enabledSteps = React.useMemo(() => {
    return ["name", "goal",
      ...(tweaks.skipAge ? [] : ["age"]),
      "height", "weight",
      ...(tweaks.skipSex ? [] : ["sex"]),
      ...(tweaks.skipActivity ? [] : ["activity"]),
      "review",
    ];
  }, [tweaks.skipAge, tweaks.skipSex, tweaks.skipActivity]);

  const [currentStep, setCurrentStep] = React.useState("name");
  const [completedSteps, setCompletedSteps] = React.useState(new Set());
  const [activeBotKey, setActiveBotKey] = React.useState("intro");
  const [isStreaming, setIsStreaming] = React.useState(true);

  // form state
  const [name, setName] = React.useState("");
  const [goal, setGoal] = React.useState(null);
  const [dob, setDob] = React.useState({ month: "Jun", day: 15, year: 1995 });
  const [heightUnit, setHeightUnit] = React.useState("ft");
  const [height, setHeight] = React.useState({ ft: 5, in: 9, cm: 170 });
  const [weightUnit, setWeightUnit] = React.useState("lbs");
  const [weight, setWeight] = React.useState(155);
  const [sex, setSex] = React.useState(null);
  const [activity, setActivity] = React.useState(null);

  // Editing target after review
  const [editingFromReview, setEditingFromReview] = React.useState(false);

  // Showing completion screen
  const [showComplete, setShowComplete] = React.useState(false);
  const targets = React.useMemo(() => {
    if (!goal || !sex || !activity) return { calories: 2100, protein: 130, carbs: 220, fat: 70 };
    return window.calculateTargets({ goal, sex: sex || "male", activity: activity || "moderately_active",
      dob, height, heightUnit, weight, weightUnit });
  }, [goal, sex, activity, dob, height, heightUnit, weight, weightUnit]);

  const scrollRef = React.useRef(null);
  const bottomRef = React.useRef(null);

  // Auto-scroll on new content
  React.useEffect(() => {
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(t);
  }, [currentStep, completedSteps.size, isStreaming, activeBotKey]);

  const tone = tweaks.tone || "playful";
  const COPY = window.COPY;

  const advanceTo = (next) => {
    setCompletedSteps((s) => new Set([...s, currentStep]));
    if (editingFromReview) {
      setEditingFromReview(false);
      setCurrentStep("review");
      setActiveBotKey("review");
      setIsStreaming(true);
    } else {
      setCurrentStep(next);
      setActiveBotKey(next);
      setIsStreaming(true);
    }
  };

  const onBotDone = (key) => {
    if (activeBotKey === key) setIsStreaming(false);
  };

  const handleEditFromReview = (field) => {
    setEditingFromReview(true);
    setCurrentStep(field);
    setActiveBotKey(field);
    setIsStreaming(true);
  };

  const handleComplete = () => {
    setShowComplete(true);
  };

  // Step ordering for progress
  const totalSteps = enabledSteps.length;
  const stepIndex = enabledSteps.indexOf(currentStep);
  const progressValue = currentStep === "review" ? totalSteps : Math.max(stepIndex, 0);

  if (showComplete) {
    return <window.NomComplete state={{ name, goal, sex, activity, dob, height, heightUnit, weight, weightUnit }}
      targets={targets} onFinish={onAllDone}/>;
  }

  const currentInputArea = renderInput({
    currentStep, name, setName, goal, setGoal, dob, setDob,
    height, setHeight, heightUnit, setHeightUnit,
    weight, setWeight, weightUnit, setWeightUnit,
    sex, setSex, activity, setActivity,
    isStreaming, advanceTo, enabledSteps, completedSteps,
    editingFromReview, setEditingFromReview, setCurrentStep, setActiveBotKey, setIsStreaming,
    handleEditFromReview, handleComplete,
  });

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#fff", paddingTop: 56,
    }}>
      {/* header with progress */}
      <div style={{
        padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 10,
        borderBottom: "1px solid #f3f4f6",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <window.NomTaco size={22}/>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#101828",
              letterSpacing: -0.2 }}>nomlog</div>
            <div style={{ fontSize: 11, color: "#9810fa", marginTop: 1, fontWeight: 500 }}>
              {isStreaming ? "typing…" : "online"}
            </div>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ fontSize: 11, color: "#6a7282", fontVariantNumeric: "tabular-nums" }}>
            step {Math.min(progressValue + 1, totalSteps)} of {totalSteps}
          </div>
        </div>
        <div style={{ height: 4, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${((progressValue + 1) / totalSteps) * 100}%`, height: "100%",
            background: window.PRIMARY_GRADIENT,
            transition: "width 0.5s cubic-bezier(.2,.8,.2,1)",
          }}/>
        </div>
      </div>

      {/* chat scroll area */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "16px 16px 0",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Step 1: Name */}
        <ConversationBlock
          show={true}
          botKey="intro"
          activeBotKey={activeBotKey}
          isStreaming={isStreaming}
          onDone={() => onBotDone("intro")}
          message={COPY.intro(tone)}
          userResponse={completedSteps.has("name") ? name : null}
        />

        {/* Step 2: Goal */}
        <ConversationBlock
          show={completedSteps.has("name") || (editingFromReview && currentStep === "goal")}
          botKey="goal"
          activeBotKey={activeBotKey}
          isStreaming={isStreaming}
          onDone={() => onBotDone("goal")}
          message={COPY.goal(name, tone)}
          userResponse={completedSteps.has("goal") && goal
            ? window.GOAL_OPTIONS.find((g) => g.id === goal)?.label : null}
        />

        {/* Step 3: Age (DOB) */}
        {!tweaks.skipAge && (
          <ConversationBlock
            show={completedSteps.has("goal") || (editingFromReview && currentStep === "age")}
            botKey="age"
            activeBotKey={activeBotKey}
            isStreaming={isStreaming}
            onDone={() => onBotDone("age")}
            message={COPY.age(tone)}
            userResponse={completedSteps.has("age") ? window.formatDOB(dob) : null}
          />
        )}

        {/* Step 4: Height */}
        <ConversationBlock
          show={completedSteps.has(tweaks.skipAge ? "goal" : "age") || (editingFromReview && currentStep === "height")}
          botKey="height"
          activeBotKey={activeBotKey}
          isStreaming={isStreaming}
          onDone={() => onBotDone("height")}
          message={COPY.height(tone)}
          userResponse={completedSteps.has("height") ? window.formatHeight(height, heightUnit) : null}
        />

        {/* Step 5: Weight */}
        <ConversationBlock
          show={completedSteps.has("height") || (editingFromReview && currentStep === "weight")}
          botKey="weight"
          activeBotKey={activeBotKey}
          isStreaming={isStreaming}
          onDone={() => onBotDone("weight")}
          message={COPY.weight(tone)}
          userResponse={completedSteps.has("weight") ? `${weight} ${weightUnit}` : null}
        />

        {/* Step 6: Sex */}
        {!tweaks.skipSex && (
          <ConversationBlock
            show={completedSteps.has("weight") || (editingFromReview && currentStep === "sex")}
            botKey="sex"
            activeBotKey={activeBotKey}
            isStreaming={isStreaming}
            onDone={() => onBotDone("sex")}
            message={COPY.sex(tone)}
            userResponse={completedSteps.has("sex") && sex
              ? window.SEX_OPTIONS.find((s) => s.id === sex)?.label : null}
          />
        )}

        {/* Step 7: Activity */}
        {!tweaks.skipActivity && (
          <ConversationBlock
            show={completedSteps.has(tweaks.skipSex ? "weight" : "sex") || (editingFromReview && currentStep === "activity")}
            botKey="activity"
            activeBotKey={activeBotKey}
            isStreaming={isStreaming}
            onDone={() => onBotDone("activity")}
            message={COPY.activity(tone)}
            userResponse={completedSteps.has("activity") && activity
              ? window.ACTIVITY_OPTIONS.find((a) => a.id === activity)?.label : null}
          />
        )}

        {/* Review step header */}
        {currentStep === "review" && !editingFromReview && (
          <ConversationBlock
            show={true}
            botKey="review"
            activeBotKey={activeBotKey}
            isStreaming={isStreaming}
            onDone={() => onBotDone("review")}
            message={COPY.review(tone)}
            userResponse={null}
          />
        )}

        <div ref={bottomRef} style={{ height: 16 }}/>
      </div>

      {/* Adaptive input area at bottom */}
      <div style={{
        padding: "12px 16px 16px",
        background: "#fff",
        borderTop: currentStep === "name" || currentStep === "weight" ? "1px solid #f3f4f6" : "none",
      }}>
        {currentInputArea}
      </div>
    </div>
  );
};

// Conversation block — bot message + optional user response
const ConversationBlock = ({ show, botKey, activeBotKey, isStreaming, onDone, message, userResponse }) => {
  if (!show) return null;
  const isActive = activeBotKey === botKey;
  return (
    <>
      <window.BotRow>
        <window.NomBotMessage
          text={message}
          animate={isActive && isStreaming}
          onDone={onDone}
        />
      </window.BotRow>
      {userResponse && (!isActive || !isStreaming) && (
        <window.UserBubble>{userResponse}</window.UserBubble>
      )}
    </>
  );
};

// Renders the current step's adaptive input
function renderInput(p) {
  if (p.isStreaming) return <ChatTypingHint/>;

  switch (p.currentStep) {
    case "name":
      return <window.NomTextInput
        value={p.name}
        onChange={p.setName}
        onSubmit={() => p.name.trim() && p.advanceTo("goal")}
        placeholder="your name or nickname"
        autoFocus
      />;

    case "goal":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomChoiceList
          options={window.GOAL_OPTIONS}
          selected={p.goal}
          onSelect={(id) => p.setGoal(id)}
        />
        <window.NomPrimaryButton
          disabled={!p.goal}
          onClick={() => p.advanceTo("age")}
        >Continue</window.NomPrimaryButton>
      </div>;

    case "age":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomDOBPicker value={p.dob} onChange={p.setDob}/>
        <window.NomPrimaryButton onClick={() => p.advanceTo("height")}>
          Continue
        </window.NomPrimaryButton>
      </div>;

    case "height":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomHeightPicker
          value={p.height} onChange={p.setHeight}
          unit={p.heightUnit} onUnitChange={p.setHeightUnit}
        />
        <window.NomPrimaryButton onClick={() => p.advanceTo("weight")}>
          Continue
        </window.NomPrimaryButton>
      </div>;

    case "weight":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomWeightRuler
          value={p.weight} onChange={p.setWeight}
          unit={p.weightUnit} onUnitChange={p.setWeightUnit}
        />
        <window.NomPrimaryButton onClick={() => p.advanceTo("sex")}>
          Continue
        </window.NomPrimaryButton>
      </div>;

    case "sex":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomChoiceList
          options={window.SEX_OPTIONS}
          selected={p.sex}
          onSelect={(id) => p.setSex(id)}
        />
        <window.NomPrimaryButton
          disabled={!p.sex}
          onClick={() => p.advanceTo("activity")}
        >Continue</window.NomPrimaryButton>
      </div>;

    case "activity":
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <window.NomChoiceList
          options={window.ACTIVITY_OPTIONS}
          selected={p.activity}
          onSelect={(id) => p.setActivity(id)}
        />
        <window.NomPrimaryButton
          disabled={!p.activity}
          onClick={() => p.advanceTo("review")}
        >Continue</window.NomPrimaryButton>
      </div>;

    case "review":
      return <window.NomReview
        state={{
          name: p.name, goal: p.goal, dob: p.dob, height: p.height, heightUnit: p.heightUnit,
          weight: p.weight, weightUnit: p.weightUnit, sex: p.sex, activity: p.activity,
        }}
        onEdit={p.handleEditFromReview}
        onComplete={p.handleComplete}
      />;
    default:
      return null;
  }
}

const ChatTypingHint = () => (
  <div style={{
    height: 44, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#9810fa", fontSize: 12, fontWeight: 500,
  }}>
    <div style={{ display: "flex", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: 999, background: "#9810fa",
          animation: `nomDot 1.2s ${i * 0.15}s infinite ease-in-out`,
        }}/>
      ))}
    </div>
  </div>
);

window.OnboardingScreen = OnboardingScreen;
