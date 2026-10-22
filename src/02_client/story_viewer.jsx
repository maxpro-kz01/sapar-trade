// Sapar Trade — прототип. Модуль: Клиент: просмотр сторис
// Строки 1084–1136 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== CLIENT: STORY VIEWER ============================== */

function StoryViewer({ stories, onClose, onFinish }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (idx >= stories.length - 1) { clearInterval(t); onFinish(); return 100; }
          setIdx((i) => i + 1);
          return 0;
        }
        return p + 2;
      });
    }, 90);
    return () => clearInterval(t);
  }, [idx, paused]);

  const s = stories[idx];
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: s.grad }}
      onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)}>
      <div className="flex gap-1.5 px-3 pt-4">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.35)" }}>
            <div style={{ height: "100%", width: i < idx ? "100%" : i === idx ? progress + "%" : "0%", background: "#fff", transition: "width .05s linear" }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full flex items-center justify-center" style={{ width: 30, height: 30, background: "#fff" }}><Logo size={24} /></div>
          <div>
            <p className="font-body text-white font-bold" style={{ fontSize: 12.5 }}>Sapar Trade</p>
            <p className="font-body text-white" style={{ fontSize: 10.5, opacity: 0.8 }}>{s.hoursAgo} ч назад</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}><Ico name="x" size={18} color="#fff" /></button>
      </div>
      <div className="flex-1 flex items-end p-6">
        <p className="font-display text-white" style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.3 }}>{s.caption}</p>
      </div>
      <div className="absolute inset-0 flex" style={{ zIndex: -1 }}>
        <div className="w-1/3 h-full" onClick={() => { if (idx > 0) { setIdx(idx - 1); setProgress(0); } }} />
        <div className="w-2/3 h-full" onClick={() => { if (idx < stories.length - 1) { setIdx(idx + 1); setProgress(0); } else onFinish(); }} />
      </div>
    </div>
  );
}

