// Sapar Trade — задачи в приложениях водителя и ТП. Модуль: счётчик «мои невыполненные задачи» для значка на вкладке
// Сам экран задач — MgTasks (mg_tasks.jsx); сервер отдаёт исполнителю только его задачи

function useMyTasksCount(session, authLost) {
  const [n, setN] = useState(0);
  const load = () => {
    stApi("/api/tasks", { token: session.token })
      .then((rows) => setN((rows || []).filter((t) => t.assignee_id === session.user.id && ["Новая", "В работе"].includes(t.status)).length))
      .catch((e) => { if (e.status === 401 && authLost) authLost(e.message); });
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  return [n, load];
}
