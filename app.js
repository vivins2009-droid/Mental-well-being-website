const STORAGE_KEY = "goallab-user-tracker-v1";
const LOCAL_MIGRATION_KEY = `${STORAGE_KEY}-supabase-imported`;
const SUPABASE_TABLE = "user_tracker_states";
const DEFAULT_CATEGORIES = ["Health", "School", "Money", "Friends", "Hobbies", "Home", "Adventure", "Community"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CALENDAR_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MS_PER_DAY = 86400000;

let selectedHabitDateKey = dateKey();
let editingCategoryName = "";
let pendingCategoryRemoval = "";
let pendingDeleteAction = null;
let editingRoutineLinkKey = "";
let openReflectionKey = "";
let supabaseClient = null;
let authSession = null;
let currentUser = null;
let syncStatus = "Checking account...";
let syncTimer = 0;
let authInitialized = false;

if (new URLSearchParams(window.location.search).get("reset") === "1") {
  localStorage.removeItem(STORAGE_KEY);
  window.history.replaceState({}, "", window.location.pathname);
}

const state = createEmptyState();

function createEmptyState() {
  return { goals: [], habits: [], tasks: [], categories: [...DEFAULT_CATEGORIES] };
}

function normalizeStateSnapshot(raw) {
  const storedHasCategories = Object.prototype.hasOwnProperty.call(raw || {}, "categories");
  return {
    goals: Array.isArray(raw?.goals) ? raw.goals.map(normalizeGoal) : [],
    habits: Array.isArray(raw?.habits) ? raw.habits.map(normalizeHabit) : [],
    tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(normalizeTask) : [],
    categories: storedHasCategories ? normalizeCategories(raw.categories, { allowEmpty: true }) : [...DEFAULT_CATEGORIES]
  };
}

function currentStatePayload() {
  return {
    goals: state.goals,
    habits: state.habits,
    tasks: state.tasks,
    categories: state.categories
  };
}

function applyState(nextState) {
  const normalized = normalizeStateSnapshot(nextState);
  state.goals = normalized.goals;
  state.habits = normalized.habits;
  state.tasks = normalized.tasks;
  state.categories = normalized.categories;
}

function stateHasUserData(snapshot) {
  const normalized = normalizeStateSnapshot(snapshot);
  return Boolean(
    normalized.goals.length ||
    normalized.habits.length ||
    normalized.tasks.length ||
    Object.prototype.hasOwnProperty.call(snapshot || {}, "categories")
  );
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeStateSnapshot(stored);
  } catch {
    return createEmptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStatePayload()));
  queueRemoteSave();
}

function supabaseSettings() {
  const settings = window.PLANWELL_SUPABASE || {};
  const url = String(settings.url || "").trim();
  const anonKey = String(settings.anonKey || "").trim();
  const configured =
    url.startsWith("https://") &&
    anonKey.length > 20 &&
    !url.includes("PASTE_") &&
    !anonKey.includes("PASTE_");
  return { url, anonKey, configured };
}

function initSupabaseClient() {
  const settings = supabaseSettings();
  if (!settings.configured || !window.supabase?.createClient) {
    supabaseClient = null;
    syncStatus = settings.configured ? "Auth library unavailable" : "Supabase setup needed";
    return false;
  }
  supabaseClient = window.supabase.createClient(settings.url, settings.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return true;
}

function migrationKeyForUser(userId) {
  return `${LOCAL_MIGRATION_KEY}-${userId}`;
}

function setSyncStatus(message) {
  syncStatus = message;
  document.querySelectorAll("[data-sync-status]").forEach((element) => {
    element.textContent = message;
  });
  document.querySelectorAll("[data-account-chip] small").forEach((element) => {
    element.textContent = userEmail() || message;
  });
}

function queueRemoteSave() {
  if (!authInitialized || !currentUser || !supabaseClient) return;
  window.clearTimeout(syncTimer);
  setSyncStatus("Saving...");
  syncTimer = window.setTimeout(() => {
    void saveUserState();
  }, 350);
}

async function loadRemoteState(userId) {
  if (!supabaseClient || !userId) return null;
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return data?.data || null;
}

async function saveUserState() {
  if (!supabaseClient || !currentUser) return;
  const payload = currentStatePayload();
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert({
      user_id: currentUser.id,
      data: payload,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (error) {
    setSyncStatus("Saved locally - sync failed");
    return;
  }
  setSyncStatus("Saved to account");
}

async function bootstrapUserState(session) {
  authSession = session;
  currentUser = session?.user || null;
  window.clearTimeout(syncTimer);

  if (!currentUser) {
    applyState(createEmptyState());
    setSyncStatus("Signed out");
    return;
  }

  setSyncStatus("Loading account...");
  const localSnapshot = loadState();
  try {
    const remoteSnapshot = await loadRemoteState(currentUser.id);
    const importKey = migrationKeyForUser(currentUser.id);
    const shouldImportLocal =
      !remoteSnapshot &&
      stateHasUserData(localSnapshot) &&
      localStorage.getItem(importKey) !== "1";

    if (remoteSnapshot) {
      applyState(remoteSnapshot);
      setSyncStatus("Loaded from account");
    } else if (shouldImportLocal) {
      applyState(localSnapshot);
      localStorage.setItem(importKey, "1");
      await saveUserState();
      setSyncStatus("Imported local data");
    } else {
      applyState(createEmptyState());
      await saveUserState();
      setSyncStatus("New account ready");
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStatePayload()));
  } catch (error) {
    applyState(localSnapshot);
    setSyncStatus("Using local cache - sync failed");
    console.error("Plan Well sync failed", error);
  }
}

function authDisplayName() {
  const meta = currentUser?.user_metadata || {};
  return meta.full_name || meta.name || currentUser?.email || "Account";
}

function userEmail() {
  return currentUser?.email || currentUser?.user_metadata?.email || "";
}

function setAuthVisibility() {
  const isConfigured = Boolean(supabaseClient);
  document.body.classList.toggle("is-authenticated", Boolean(currentUser));
  document.body.classList.toggle("is-logged-out", !currentUser);
  document.body.classList.toggle("is-auth-unconfigured", !isConfigured);
  document.body.classList.remove("is-auth-loading");

  const authScreen = document.querySelector("[data-auth-screen]");
  if (authScreen) {
    authScreen.hidden = Boolean(currentUser);
    authScreen.querySelector("[data-auth-setup]").hidden = isConfigured;
    authScreen.querySelectorAll("[data-auth-google], [data-auth-submit], [data-auth-magic]").forEach((control) => {
      control.disabled = !isConfigured;
    });
  }

  renderAccountControls();
}

function startOfLocalDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = startOfLocalDay(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function dateKey(date = new Date()) {
  return dateToValue(startOfLocalDay(date));
}

function todayKey() {
  return dateKey(new Date());
}

function dateForKey(key) {
  return dateFromValue(key) || startOfLocalDay(new Date());
}

function recentHabitDateKeys() {
  const today = startOfLocalDay(new Date());
  return Array.from({ length: 7 }, (_, index) => dateKey(addDays(today, -index)));
}

function selectedHabitDate() {
  const recent = recentHabitDateKeys();
  if (!recent.includes(selectedHabitDateKey)) selectedHabitDateKey = recent[0];
  return selectedHabitDateKey;
}

function isTodayKey(key) {
  return key === todayKey();
}

function isPastKey(key) {
  return key < todayKey();
}

function isEndOfDayWindow(now = new Date()) {
  return now.getHours() >= 21;
}

function reminderStorageKey(key = todayKey()) {
  return `goallab-end-day-dismissed-${key}`;
}

function formatHabitDay(key) {
  if (isTodayKey(key)) return "Today";
  if (key === dateKey(addDays(new Date(), -1))) return "Yesterday";
  return dateForKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatHabitButtonDay(key) {
  if (isTodayKey(key)) return "Today";
  if (key === dateKey(addDays(new Date(), -1))) return "Yesterday";
  return dateForKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function formatTodayReadout() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function normalizeGoal(goal) {
  const steps = Array.isArray(goal?.steps)
    ? goal.steps.map(normalizeStep).filter((step) => step.text)
    : [];
  return {
    id: goal?.id || uid("goal"),
    title: String(goal?.title || "").trim() || "Untitled goal",
    category: String(goal?.category || DEFAULT_CATEGORIES[0]),
    deadline: String(goal?.deadline || ""),
    why: String(goal?.why || "").trim(),
    measure: String(goal?.measure || "").trim(),
    reward: String(goal?.reward || "").trim(),
    steps,
    complete: Boolean(goal?.complete)
  };
}

function normalizeStep(step) {
  const source = typeof step === "object" && step !== null ? step : { text: step };
  const target = Math.max(1, Math.min(30, Number(source.linkedHabitTarget || 7)));
  return {
    id: source.id || uid("step"),
    text: String(source.text || "").trim(),
    done: Boolean(source.done),
    routineIdea: String(source.routineIdea || "").trim(),
    linkedHabitId: String(source.linkedHabitId || ""),
    linkedAt: String(source.linkedAt || ""),
    linkedHabitTarget: target
  };
}

function normalizeHabit(habit) {
  const weeklyGoal = Math.max(1, Math.min(7, Number(habit?.weeklyGoal || 7)));
  const checks = DAYS.map((_, index) => Boolean(habit?.checks?.[index]));
  const normalized = {
    id: habit?.id || uid("habit"),
    name: String(habit?.name || "").trim() || "Untitled habit",
    weeklyGoal,
    category: String(habit?.category || DEFAULT_CATEGORIES[0]),
    checks,
    history: normalizeHabitHistory(habit?.history)
  };

  migrateWeeklyChecks(normalized, checks);
  return normalized;
}

function normalizeTask(task) {
  return {
    id: task?.id || uid("task"),
    title: String(task?.title || "").trim() || "Untitled task",
    subtext: String(task?.subtext || "").trim(),
    linkedHabitId: String(task?.linkedHabitId || ""),
    done: Boolean(task?.done),
    createdAt: String(task?.createdAt || new Date().toISOString()),
    completedAt: String(task?.completedAt || "")
  };
}

function normalizeHabitHistory(history) {
  const normalized = {};
  if (!history || typeof history !== "object") return normalized;

  Object.entries(history).forEach(([key, record]) => {
    if (!dateFromValue(key)) return;
    const source = typeof record === "object" && record !== null ? record : { done: Boolean(record) };
    normalized[key] = {
      done: Boolean(source.done),
      reflection: String(source.reflection || ""),
      updatedAt: String(source.updatedAt || "")
    };
  });
  return normalized;
}

function migrateWeeklyChecks(habit, checks) {
  const mondayOffset = (new Date().getDay() + 6) % 7;
  const monday = addDays(new Date(), -mondayOffset);
  checks.forEach((done, index) => {
    if (!done) return;
    const key = dateKey(addDays(monday, index));
    if (!habit.history[key]) {
      habit.history[key] = { done: true, reflection: "", updatedAt: new Date().toISOString() };
    }
  });
}

function habitRecord(habit, key = selectedHabitDate()) {
  return habit.history?.[key] || { done: false, reflection: "", updatedAt: "" };
}

function ensureHabitRecord(habit, key = selectedHabitDate()) {
  if (!habit.history) habit.history = {};
  if (!habit.history[key]) habit.history[key] = { done: false, reflection: "", updatedAt: "" };
  return habit.history[key];
}

function habitDoneOn(habit, key = selectedHabitDate()) {
  return Boolean(habitRecord(habit, key).done);
}

function setHabitDone(habit, key, done) {
  const record = ensureHabitRecord(habit, key);
  record.done = done;
  record.updatedAt = new Date().toISOString();
}

function setHabitReflection(habit, key, reflection) {
  const record = ensureHabitRecord(habit, key);
  record.reflection = String(reflection || "").trim();
  record.updatedAt = new Date().toISOString();
}

function habitStreak(habit, fromKey = todayKey()) {
  let streak = 0;
  let cursor = dateForKey(fromKey);
  while (habitDoneOn(habit, dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function habitDoneRecordCount() {
  return state.habits.reduce((sum, habit) => {
    return sum + Object.values(habit.history || {}).filter((record) => record.done).length;
  }, 0);
}

function todayMissedHabits() {
  const key = todayKey();
  return state.habits.filter((habit) => !habitDoneOn(habit, key));
}

function shouldShowReflection(key) {
  return isPastKey(key) || (isTodayKey(key) && isEndOfDayWindow());
}

function normalizeCategories(value, options = {}) {
  const source = Array.isArray(value) ? value : DEFAULT_CATEGORIES;
  const seen = new Set();
  const categories = source
    .map((category) => String(category || "").trim())
    .filter(Boolean)
    .filter((category) => {
      const key = category.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return categories.length || options.allowEmpty ? categories : [...DEFAULT_CATEGORIES];
}

function categoryList() {
  state.categories = normalizeCategories(state.categories, { allowEmpty: true });
  return state.categories;
}

function fallbackCategory() {
  return categoryList()[0] || "Uncategorized";
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setBar(name, value) {
  document.querySelectorAll(`[data-bar="${name}"]`).forEach((element) => {
    element.style.width = `${Math.max(0, Math.min(100, value))}%`;
  });
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function setCommandRing(name, value) {
  const percent = clampPercent(value);
  document.querySelectorAll(`[data-command-ring="${name}"]`).forEach((element) => {
    element.style.setProperty("--metric-angle", `${percent * 3.6}deg`);
  });
}

function setCommandCells(name, value) {
  const percent = clampPercent(value);
  document.querySelectorAll(`[data-command-grid="${name}"]`).forEach((element) => {
    const cells = [...element.querySelectorAll("span")];
    const activeCount = percent > 0 ? Math.max(1, Math.round((percent / 100) * cells.length)) : 0;
    cells.forEach((cell, index) => {
      cell.classList.toggle("is-active", index < activeCount);
    });
  });
}

function setCommandTower(name, activeCount) {
  document.querySelectorAll(`[data-command-tower="${name}"]`).forEach((element) => {
    const levels = [...element.querySelectorAll("span")];
    levels.forEach((level, index) => {
      level.classList.toggle("is-active", index < activeCount);
    });
  });
}

function syncCommandVisuals(data) {
  setCommandRing("overallProgress", data.overallProgress);
  setCommandRing("goalCompletion", data.averageGoalProgress);
  setCommandRing("habitScore", data.habitScore);
  setCommandCells("habitScore", data.habitScore);

  const streakLevels = Math.min(4, data.bestHabit.streak);
  const stepProgress = data.totalSteps ? Math.ceil((data.stepsDone / data.totalSteps) * 4) : 0;
  setCommandTower("bestStreak", streakLevels);
  setCommandTower("stepsFinished", stepProgress);
}

function goalProgress(goal) {
  if (!goal.steps.length) return goal.complete ? 100 : 0;
  const complete = goal.steps.filter((step) => step.done).length;
  return Math.round((complete / goal.steps.length) * 100);
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  return Math.ceil((due - today) / 86400000);
}

function totals() {
  const goalCount = state.goals.length;
  const taskCount = state.tasks.length;
  const tasksDone = state.tasks.filter((task) => task.done).length;
  const linkedTasks = state.tasks.filter((task) => task.linkedHabitId && findHabitById(task.linkedHabitId)).length;
  const openTasks = Math.max(0, taskCount - tasksDone);
  const goalProgressValues = state.goals.map(goalProgress);
  const achievedGoals = goalProgressValues.filter((progress) => progress === 100).length;
  const averageGoalProgress = goalCount
    ? Math.round(goalProgressValues.reduce((sum, value) => sum + value, 0) / goalCount)
    : 0;
  const totalSteps = state.goals.reduce((sum, goal) => sum + goal.steps.length, 0);
  const stepsDone = state.goals.reduce((sum, goal) => sum + goal.steps.filter((step) => step.done).length, 0);
  const today = todayKey();
  const plannedChecks = state.habits.length;
  const checksDone = state.habits.filter((habit) => habitDoneOn(habit, today)).length;
  const missedToday = Math.max(0, plannedChecks - checksDone);
  const totalHabitCompletions = habitDoneRecordCount();
  const habitScore = plannedChecks ? Math.round((checksDone / plannedChecks) * 100) : 0;
  const overallProgress = goalCount || state.habits.length
    ? Math.round((averageGoalProgress + habitScore) / ((goalCount ? 1 : 0) + (state.habits.length ? 1 : 0)))
    : 0;
  const dueSoon = state.goals.filter((goal) => {
    const left = daysLeft(goal.deadline);
    return left !== null && left >= 0 && left <= 7 && goalProgress(goal) < 100;
  }).length;
  const bestHabit = state.habits
    .map((habit) => ({ name: habit.name, streak: habitStreak(habit) }))
    .sort((a, b) => b.streak - a.streak)[0] || { name: "No habits yet", streak: 0 };
  const strongestHabit = bestHabit.streak > 0 ? bestHabit.name : "None";
  const xp = totalHabitCompletions * 10 + stepsDone * 40 + achievedGoals * 300 + tasksDone * 15;

  return {
    achievedGoals,
    averageGoalProgress,
    bestHabit,
    checksDone,
    dueSoon,
    goalCount,
    habitCount: state.habits.length,
    habitScore,
    missedToday,
    overallProgress,
    plannedChecks,
    stepsDone,
    taskCount,
    tasksDone,
    linkedTasks,
    openTasks,
    totalSteps,
    totalHabitCompletions,
    strongestHabit,
    xp
  };
}

function syncMetrics() {
  const data = totals();
  const level = Math.floor(data.xp / 1000) + 1;

  setText('[data-profile-level]', `Level ${level}`);
  setText('[data-profile-xp]', `${data.xp} XP`);
  setText('[data-metric="overallProgress"]', `${data.overallProgress}%`);
  setText('[data-metric="goalCompletion"]', `${data.averageGoalProgress}%`);
  setText('[data-metric="goalsAchieved"]', `${data.achievedGoals} / ${data.goalCount}`);
  setText('[data-metric="activeGoals"]', data.goalCount);
  setText('[data-metric="dueSoon"]', data.dueSoon);
  setText('[data-metric="stepsFinished"]', `${data.stepsDone} / ${data.totalSteps}`);
  setText('[data-metric="stepsFinishedShort"]', data.stepsDone);
  setText('[data-metric="habitScore"]', `${data.habitScore}%`);
  setText('[data-metric="checksCompleted"]', data.checksDone);
  setText('[data-metric="missedToday"]', data.missedToday);
  setText('[data-metric="habitCount"]', data.habitCount);
  setText('[data-metric="taskCount"]', data.taskCount);
  setText('[data-metric="tasksDone"]', data.tasksDone);
  setText('[data-metric="linkedTasks"]', data.linkedTasks);
  setText('[data-metric="openTasks"]', data.openTasks);
  setText('[data-metric="bestStreak"]', `${data.bestHabit.streak} days`);
  setText('[data-metric="strongestHabit"]', data.strongestHabit);
  setText('[data-metric="strongestStreak"]', `${data.bestHabit.streak} day streak`);
  setText('[data-copy="strongestStreak"]', `${data.bestHabit.streak} day streak`);
  setText('[data-metric="recoveryHabit"]', data.habitCount ? findRecoveryHabit() : "None");
  setText('[data-metric="weeklyChecks"]', `${data.checksDone} / ${data.plannedChecks} habits done today`);
  setText('[data-metric="rewardProgress"]', `${data.xp} XP earned`);
  setText('[data-metric="weeklyXp"]', data.xp);
  setText('[data-metric="nextUnlock"]', `${Math.min(100, Math.round((data.xp / 300) * 100))}%`);
  syncDashboardSummary(data);

  setText('[data-copy="goalLeft"]', data.goalCount ? `${data.goalCount - data.achievedGoals} still in motion` : "No goals yet");
  setText('[data-copy="habitChecks"]', `${data.checksDone} done today`);
  setText('[data-copy="goalAreas"]', `Across ${new Set(state.goals.map((goal) => goal.category)).size} life areas`);
  setText('[data-copy="habitPlanned"]', `Out of ${data.plannedChecks} daily habits`);
  setText('[data-copy="bestHabit"]', data.bestHabit.streak > 0 ? data.bestHabit.name : "No habits yet");

  setBar("overallProgress", data.overallProgress);
  setBar("goalCompletion", data.averageGoalProgress);
  setBar("habitScore", data.habitScore);
  setBar("nextUnlock", Math.min(100, Math.round((data.xp / 300) * 100)));
  syncCommandVisuals(data);
}

function syncDashboardSummary(data) {
  const topGoal = state.goals.find((goal) => goalProgress(goal) < 100) || state.goals[0];
  const nextTask = state.tasks.find((task) => !task.done) || state.tasks[0];
  const unlockProgress = Math.min(100, Math.round((data.xp / 300) * 100));

  setText("[data-summary-top-goal]", topGoal ? topGoal.title : "No goals yet");
  setText("[data-summary-goal-note]", topGoal ? goalSummaryNote(topGoal) : "Waiting for your first goal");
  setText("[data-summary-habit-note]", data.habitCount ? `${data.checksDone} / ${data.plannedChecks} done today` : "No habits yet");
  setText("[data-summary-next-task]", nextTask ? nextTask.title : "No tasks yet");
  setText("[data-summary-task-note]", nextTask ? taskSummaryNote(nextTask) : "Add one-off work here");
  setText("[data-summary-reward-status]", data.xp ? `${unlockProgress}% toward next unlock` : "No XP yet");
}

function taskSummaryNote(task) {
  if (task.done) return "Finished";
  const habit = findHabitById(task.linkedHabitId);
  return habit ? `Linked to ${habit.name}` : "Not linked to a habit";
}

function goalSummaryNote(goal) {
  const progress = goalProgress(goal);
  const left = daysLeft(goal.deadline);
  const due = left === null ? "No deadline" : left < 0 ? "Overdue" : left === 0 ? "Due today" : `${left} days left`;
  return `${goal.category} | ${progress}% | ${due}`;
}

function findRecoveryHabit() {
  return todayMissedHabits()[0]?.name || "None";
}

function routineEditKey(goalId, stepId) {
  return `${goalId}:${stepId}`;
}

function reflectionEditKey(habitId, key) {
  return `${habitId}:${key}`;
}

function findHabitById(id) {
  return state.habits.find((habit) => habit.id === id);
}

function findGoalStep(goalId, stepId) {
  const goal = state.goals.find((item) => item.id === goalId);
  const step = goal?.steps.find((item) => item.id === stepId);
  return { goal, step };
}

function makeHabit(name, category) {
  return {
    id: uid("habit"),
    name: String(name || "").trim() || "Untitled habit",
    weeklyGoal: 7,
    category: String(category || fallbackCategory()),
    checks: [false, false, false, false, false, false, false],
    history: {}
  };
}

function makeTask(title, subtext, linkedHabitId = "") {
  const habit = findHabitById(linkedHabitId);
  return {
    id: uid("task"),
    title: String(title || "").trim() || "Untitled task",
    subtext: String(subtext || "").trim(),
    linkedHabitId: habit ? habit.id : "",
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: ""
  };
}

function tasksForHabit(habitId) {
  return state.tasks.filter((task) => task.linkedHabitId === habitId);
}

function taskHabitOptionsMarkup(selectedId = "") {
  return `
    <option value="">No linked habit</option>
    ${state.habits.map((habit) => `
      <option value="${escapeHtml(habit.id)}" ${habit.id === selectedId ? "selected" : ""}>${escapeHtml(habit.name)}</option>
    `).join("")}
  `;
}

function createHabitFromRoutine(stepText, category) {
  const habit = makeHabit(stepText, category);
  state.habits.push(habit);
  return habit;
}

function linkStepToHabit(step, habitId) {
  step.linkedHabitId = habitId;
  step.linkedAt = step.linkedAt || new Date().toISOString();
  step.linkedHabitTarget = step.linkedHabitTarget || 7;
}

function unlinkStepRoutine(step) {
  step.linkedHabitId = "";
  step.linkedAt = "";
  step.linkedHabitTarget = 7;
}

function routineProgress(habit, target = 7) {
  const keys = recentHabitDateKeys().slice(0, target);
  return keys.filter((key) => habitDoneOn(habit, key)).length;
}

function habitLinkHref() {
  return document.body.dataset.page === "dashboard" ? "#habits-section" : "habits.html";
}

function habitOptionsMarkup(selectedId = "") {
  if (!state.habits.length) return `<option value="">No habits yet</option>`;
  return `
    <option value="">Choose a habit</option>
    ${state.habits.map((habit) => `
      <option value="${escapeHtml(habit.id)}" ${habit.id === selectedId ? "selected" : ""}>${escapeHtml(habit.name)}</option>
    `).join("")}
  `;
}

function renderGoals() {
  document.querySelectorAll("[data-goal-list]").forEach((list) => {
    const limit = list.dataset.goalList === "dashboard" ? 3 : state.goals.length;
    list.innerHTML = "";
    state.goals.slice(0, limit).forEach((goal, index) => {
      list.append(goalRow(goal, index));
    });
  });

  toggleEmpty("dashboardGoals", state.goals.length === 0);
  toggleEmpty("goalsPage", state.goals.length === 0);
  renderTinyWins();
}

function goalRow(goal, index) {
  const row = document.createElement("div");
  row.className = "goal-row wide";
  const progress = goalProgress(goal);
  const left = daysLeft(goal.deadline);
  const leftLabel = left === null ? "No deadline" : left < 0 ? "Overdue" : `${left} days left`;
  row.innerHTML = `
    <div class="goal-icon ${categoryClass(goal.category)}">${String(index + 1).padStart(2, "0")}</div>
    <div class="goal-copy">
      <strong>${escapeHtml(goal.title)}</strong>
      <span>${escapeHtml(goal.category)}${goal.deadline ? ` | deadline: ${formatDate(goal.deadline)}` : ""}</span>
      <div class="progress-track"><span style="width: ${progress}%"></span></div>
      ${goal.why ? `<small>Why: ${escapeHtml(goal.why)}</small>` : ""}
      ${goal.measure ? `<small>Success: ${escapeHtml(goal.measure)}</small>` : ""}
      ${goal.reward ? `<small>Reward: ${escapeHtml(goal.reward)}</small>` : ""}
      ${stepsMarkup(goal)}
    </div>
    <div class="goal-meta">
      <strong>${progress}%</strong>
      <span>${leftLabel}</span>
      <button class="delete-button" type="button" data-delete-goal="${goal.id}">Delete</button>
    </div>
  `;
  row.querySelectorAll("[data-step]").forEach((input) => {
    input.addEventListener("change", () => {
      const step = goal.steps.find((item) => item.id === input.dataset.step);
      if (step) step.done = input.checked;
      saveAndRender();
    });
  });
  row.querySelectorAll("[data-start-routine-link]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRoutineLinkKey = routineEditKey(goal.id, button.dataset.startRoutineLink);
      render();
    });
  });
  row.querySelectorAll("[data-cancel-routine-link]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRoutineLinkKey = "";
      render();
    });
  });
  row.querySelectorAll("[data-unlink-routine]").forEach((button) => {
    button.addEventListener("click", () => {
      const { step } = findGoalStep(goal.id, button.dataset.unlinkRoutine);
      if (step) unlinkStepRoutine(step);
      editingRoutineLinkKey = "";
      saveAndRender();
    });
  });
  row.querySelectorAll("[data-save-routine-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const { step } = findGoalStep(goal.id, button.dataset.saveRoutineLink);
      const picker = row.querySelector(`[data-routine-picker="${button.dataset.saveRoutineLink}"]`);
      const habit = findHabitById(picker?.value);
      if (step && habit) {
        linkStepToHabit(step, habit.id);
        editingRoutineLinkKey = "";
        saveAndRender();
      }
    });
  });
  row.querySelectorAll("[data-create-routine-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const { goal: matchGoal, step } = findGoalStep(goal.id, button.dataset.createRoutineLink);
      if (matchGoal && step) {
        const habit = createHabitFromRoutine(step.text, matchGoal.category);
        linkStepToHabit(step, habit.id);
        editingRoutineLinkKey = "";
        saveAndRender();
      }
    });
  });
  row.querySelectorAll("[data-routine-habit-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href?.startsWith("#")) return;
      event.preventDefault();
      scrollToHashSection(href, link);
    });
  });
  row.querySelector("[data-delete-goal]").addEventListener("click", () => {
    openDeleteConfirm({
      eyebrow: "Confirm delete",
      title: "Delete goal?",
      copy: `This will delete "${goal.title}" and its micro steps. Linked habits will stay in your habit tracker.`,
      confirmLabel: "Delete goal",
      onConfirm: () => {
        state.goals = state.goals.filter((item) => item.id !== goal.id);
        saveAndRender();
      }
    });
  });
  return row;
}

function stepsMarkup(goal) {
  if (!goal.steps.length) return "";
  const completed = goal.steps.filter((step) => step.done).length;
  return `
    <div class="step-list">
      <div class="micro-step-summary">
        <strong>Micro steps</strong>
        <span>${completed} / ${goal.steps.length} steps complete</span>
      </div>
      ${goal.steps.map((step) => `
        <div class="micro-step-item ${step.done ? "is-complete" : ""}">
          <label class="step-check">
            <input type="checkbox" data-step="${step.id}" ${step.done ? "checked" : ""}>
            <span>${escapeHtml(step.text)}</span>
          </label>
          ${step.routineIdea ? `<div class="routine-idea-note"><span>Daily routine idea</span><strong>${escapeHtml(step.routineIdea)}</strong></div>` : ""}
          ${routineStepMarkup(goal, step)}
        </div>
      `).join("")}
    </div>
  `;
}

function routineStepMarkup(goal, step) {
  const key = routineEditKey(goal.id, step.id);
  const linkedHabit = step.linkedHabitId ? findHabitById(step.linkedHabitId) : null;
  const isEditing = editingRoutineLinkKey === key;

  if (isEditing) {
    return `
      <div class="routine-link-editor">
        <div>
          <strong>Routine link</strong>
          <span>Choose an existing habit that supports this step.</span>
        </div>
        <select data-routine-picker="${step.id}" aria-label="Choose linked habit">
          ${habitOptionsMarkup(step.linkedHabitId)}
        </select>
        <div class="routine-link-actions">
          <button class="ghost-button" type="button" data-save-routine-link="${step.id}" ${state.habits.length ? "" : "disabled"}>Save link</button>
          <button class="ghost-button" type="button" data-cancel-routine-link="${step.id}">Cancel</button>
        </div>
      </div>
    `;
  }

  if (!step.linkedHabitId) {
    return `
      <div class="routine-link-status is-unlinked">
        <span>Use habits separately when this needs repeated practice.</span>
      </div>
    `;
  }

  if (!linkedHabit) {
    return `
      <div class="routine-link-status is-missing">
        <span>Linked habit is missing</span>
        <div class="routine-link-actions">
          <button class="ghost-button" type="button" data-unlink-routine="${step.id}">Unlink</button>
        </div>
      </div>
    `;
  }

  const target = step.linkedHabitTarget || 7;
  const doneCount = routineProgress(linkedHabit, target);
  const doneToday = habitDoneOn(linkedHabit, todayKey());
  return `
    <div class="routine-link-status is-linked">
      <div>
        <span>Routine: ${escapeHtml(linkedHabit.name)}</span>
        <strong>${doneToday ? "Done today" : "Open today"} | ${doneCount} / ${target} routine checks</strong>
      </div>
      <div class="routine-link-actions">
        <a class="ghost-button link-button" href="${habitLinkHref()}" data-routine-habit-link>Habits</a>
        <button class="ghost-button" type="button" data-unlink-routine="${step.id}">Unlink</button>
      </div>
    </div>
  `;
}

function renderTinyWins() {
  const target = document.querySelector("[data-tiny-wins]");
  if (!target) return;
  target.innerHTML = "";
  const pending = state.goals.flatMap((goal) =>
    goal.steps.filter((step) => !step.done).slice(0, 1).map((step) => ({ goal, step }))
  ).slice(0, 4);
  pending.forEach(({ goal, step }) => {
    const label = document.createElement("label");
    label.className = "task-item";
    label.innerHTML = `<input type="checkbox" data-tiny-step="${step.id}" data-goal-id="${goal.id}"> ${escapeHtml(step.text)}`;
    label.querySelector("input").addEventListener("change", (event) => {
      const matchGoal = state.goals.find((item) => item.id === event.target.dataset.goalId);
      const matchStep = matchGoal?.steps.find((item) => item.id === event.target.dataset.tinyStep);
      if (matchStep) matchStep.done = event.target.checked;
      saveAndRender();
    });
    target.append(label);
  });
  toggleEmpty("tinyWins", pending.length === 0);
}

function renderCategories() {
  const categories = categoryList();
  document.querySelectorAll("[data-category-list]").forEach((categoryList) => {
    categoryList.innerHTML = "";
    categories.forEach((category) => {
      const goals = state.goals.filter((goal) => goal.category === category);
      const achieved = goals.filter((goal) => goalProgress(goal) === 100).length;
      const percent = goals.length ? Math.round((achieved / goals.length) * 100) : 0;
      const row = document.createElement("div");
      row.className = "category-row";
      if (editingCategoryName === category) {
        row.classList.add("is-editing");
        row.innerHTML = categoryEditMarkup(category);
        bindCategoryEditControls(row, category);
      } else {
        row.innerHTML = `
          <button class="category-progress-trigger" type="button" data-edit-category="${escapeHtml(category)}" aria-label="Edit ${escapeHtml(category)}">
            <span class="category-progress-name">${escapeHtml(category)}</span>
            <div class="progress-track"><span style="width: ${percent}%"></span></div>
            <strong class="category-progress-value">${percent}% complete</strong>
            <span class="category-hover-label" aria-hidden="true">Edit</span>
          </button>
        `;
        row.querySelector("[data-edit-category]").addEventListener("click", () => {
          editingCategoryName = category;
          render();
        });
      }
      categoryList.append(row);
    });
  });

  const lifeGrid = document.querySelector("[data-life-grid]");
  if (lifeGrid) {
    lifeGrid.innerHTML = "";
    categories.forEach((category) => {
      const goals = state.goals.filter((goal) => goal.category === category);
      const achieved = goals.filter((goal) => goalProgress(goal) === 100).length;
      const tile = document.createElement("div");
      tile.className = "life-tile";
      if (editingCategoryName === category) {
        tile.classList.add("is-editing");
        tile.innerHTML = categoryEditMarkup(category);
        bindCategoryEditControls(tile, category);
      } else {
        tile.innerHTML = `
          <button class="life-tile-trigger" type="button" data-edit-category="${escapeHtml(category)}" aria-label="Edit ${escapeHtml(category)}">
            <strong>${escapeHtml(category)}</strong>
            <span>${achieved} / ${goals.length}</span>
            <em class="category-hover-label" aria-hidden="true">Edit</em>
          </button>
        `;
        tile.querySelector("[data-edit-category]").addEventListener("click", () => {
          editingCategoryName = category;
          render();
        });
      }
      lifeGrid.append(tile);
    });
  }

  renderCategoryManager();
  renderGoalSignalMaps(categories);
}

function categoryEditMarkup(category) {
  return `
    <label class="category-rename-field">
      Rename area
      <input type="text" value="${escapeHtml(category)}" data-rename-category-input="${escapeHtml(category)}">
    </label>
    <div class="category-actions">
      <button class="ghost-button" type="button" data-save-category="${escapeHtml(category)}">Save</button>
      <button class="ghost-button" type="button" data-cancel-category-edit>Cancel</button>
      <button class="delete-button category-remove-button" type="button" data-remove-category="${escapeHtml(category)}">Delete</button>
    </div>
  `;
}

function bindCategoryEditControls(container, category) {
  const input = container.querySelector("[data-rename-category-input]");
  container.querySelector("[data-save-category]")?.addEventListener("click", () => {
    renameCategory(category, input.value);
  });
  container.querySelector("[data-cancel-category-edit]")?.addEventListener("click", () => {
    editingCategoryName = "";
    render();
  });
  container.querySelector("[data-remove-category]")?.addEventListener("click", () => {
    openCategoryRemoveConfirm(category);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renameCategory(category, input.value);
    if (event.key === "Escape") {
      editingCategoryName = "";
      render();
    }
  });
  window.setTimeout(() => {
    input?.focus();
    input?.select();
  }, 0);
}

function renderGoalSignalMaps(categories = categoryList()) {
  document.querySelectorAll("[data-goal-signal-map]").forEach((map) => {
    const total = categories.length || 1;
    map.dataset.density = total > 6 ? "dense" : "calm";
    map.innerHTML = `
      <span class="signal-orbit orbit-one"></span>
      <span class="signal-orbit orbit-two"></span>
      <span class="signal-core"></span>
      ${categories.map((category, index) => {
        const angle = -150 + (300 / Math.max(1, total - 1)) * index;
        const radius = total > 6 ? 38 : 44;
        const radians = angle * Math.PI / 180;
        const x = 50 + Math.cos(radians) * radius;
        const y = 52 + Math.sin(radians) * (radius * 0.56);
        const progress = state.goals.filter((goal) => goal.category === category && goalProgress(goal) === 100).length;
        const active = state.goals.filter((goal) => goal.category === category).length;
        return `
          <span class="signal-node" style="--node-x: ${x.toFixed(2)}%; --node-y: ${y.toFixed(2)}%; --node-z: ${18 + (index % 3) * 12}px; --node-float-z: ${28 + (index % 3) * 12}px; --node-delay: ${(index % 3) * -0.8}s;">
            <i></i>
            <b>${escapeHtml(category)}</b>
            <em>${progress}/${active}</em>
          </span>
        `;
      }).join("")}
    `;
  });
}

function renderCategoryOptions() {
  const categories = categoryList();
  const formCategories = categories.length ? categories : [fallbackCategory()];
  document.querySelectorAll('select[name="category"]').forEach((select) => {
    const previous = select.value;
    select.innerHTML = formCategories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join("");
    select.value = formCategories.includes(previous) ? previous : fallbackCategory();
  });
  renderCategoryPickers(formCategories);
}

function renderCategoryPickers(categories = categoryList()) {
  document.querySelectorAll("[data-category-picker]").forEach((picker) => {
    const label = picker.closest("label");
    const select = label?.querySelector('select[name="category"]');
    if (!select) return;
    picker.innerHTML = "";
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.className = "category-choice";
      button.type = "button";
      button.textContent = category;
      button.dataset.categoryChoice = category;
      button.setAttribute("aria-pressed", String(select.value === category));
      button.addEventListener("click", () => {
        select.value = category;
        picker.querySelectorAll("[data-category-choice]").forEach((choice) => {
          choice.classList.toggle("is-selected", choice.dataset.categoryChoice === category);
          choice.setAttribute("aria-pressed", String(choice.dataset.categoryChoice === category));
        });
      });
      button.classList.toggle("is-selected", select.value === category);
      picker.append(button);
    });
  });
}

function renderCategoryManager() {
  const categories = categoryList();
  document.querySelectorAll("[data-category-manager]").forEach((manager) => {
    manager.innerHTML = "";
    categories.forEach((category) => {
      const goalCount = state.goals.filter((goal) => goal.category === category).length;
      const habitCount = state.habits.filter((habit) => habit.category === category).length;
      const row = document.createElement("div");
      row.className = "category-edit-row";

      if (editingCategoryName === category) {
        row.classList.add("is-editing");
        row.innerHTML = `
          <label class="category-rename-field">
            Rename area
            <input type="text" value="${escapeHtml(category)}" data-rename-category-input="${escapeHtml(category)}">
          </label>
          <div class="category-actions">
            <button class="ghost-button" type="button" data-save-category="${escapeHtml(category)}">Save</button>
            <button class="ghost-button" type="button" data-cancel-category-edit>Cancel</button>
            <button class="delete-button category-remove-button" type="button" data-remove-category="${escapeHtml(category)}">Delete</button>
          </div>
        `;
        const input = row.querySelector("[data-rename-category-input]");
        row.querySelector("[data-save-category]").addEventListener("click", () => {
          renameCategory(category, input.value);
        });
        row.querySelector("[data-cancel-category-edit]").addEventListener("click", () => {
          editingCategoryName = "";
          renderCategoryManager();
        });
        row.querySelector("[data-remove-category]").addEventListener("click", () => {
          openCategoryRemoveConfirm(category);
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") renameCategory(category, input.value);
          if (event.key === "Escape") {
            editingCategoryName = "";
            renderCategoryManager();
          }
        });
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      } else {
        row.innerHTML = `
          <button class="category-edit-trigger" type="button" data-edit-category="${escapeHtml(category)}" aria-label="Edit ${escapeHtml(category)}">
            <span class="category-display">
              <strong>${escapeHtml(category)}</strong>
              <small>${goalCount} goals | ${habitCount} habits</small>
            </span>
            <span class="category-hover-label" aria-hidden="true">Edit</span>
          </button>
        `;
        row.querySelector("[data-edit-category]").addEventListener("click", () => {
          editingCategoryName = category;
          renderCategoryManager();
        });
      }

      manager.append(row);
    });
  });
}

function renderTaskHabitOptions() {
  document.querySelectorAll("[data-habit-link-select]").forEach((select) => {
    const previous = select.value;
    select.innerHTML = taskHabitOptionsMarkup(previous);
    select.value = findHabitById(previous) ? previous : "";
  });
}

function renderTasks() {
  document.querySelectorAll("[data-task-list]").forEach((list) => {
    list.innerHTML = "";
    state.tasks.forEach((task) => list.append(taskRow(task)));
  });
  renderTaskHabitOptions();
  toggleEmpty("tasks", state.tasks.length === 0);
}

function taskRow(task) {
  const row = document.createElement("div");
  const habit = findHabitById(task.linkedHabitId);
  row.className = `task-row ${task.done ? "is-done" : ""}`;
  row.innerHTML = `
    <div class="task-status-orb" aria-hidden="true">${task.done ? "✓" : ""}</div>
    <div class="task-copy">
      <strong>${escapeHtml(task.title)}</strong>
      ${task.subtext ? `<p>${escapeHtml(task.subtext)}</p>` : ""}
      <span>${habit ? `Linked habit: ${escapeHtml(habit.name)}` : "Not linked to a habit"}</span>
    </div>
    <div class="task-actions">
      <button class="daily-done-button ${task.done ? "is-done" : ""}" type="button" data-toggle-task="${task.id}">
        ${task.done ? "Mark open" : "Mark done"}
      </button>
      <button class="delete-button" type="button" data-delete-task="${task.id}">Delete</button>
    </div>
  `;
  row.querySelector("[data-toggle-task]")?.addEventListener("click", () => {
    const match = state.tasks.find((item) => item.id === task.id);
    if (match) {
      match.done = !match.done;
      match.completedAt = match.done ? new Date().toISOString() : "";
    }
    saveAndRender();
  });
  row.querySelector("[data-delete-task]")?.addEventListener("click", () => {
    openDeleteConfirm({
      eyebrow: "Confirm delete",
      title: "Delete task?",
      copy: `This will delete "${task.title}" from your task board.`,
      confirmLabel: "Delete task",
      onConfirm: () => {
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        saveAndRender();
      }
    });
  });
  return row;
}

function linkedTaskMarkup(habit) {
  const tasks = tasksForHabit(habit.id);
  if (!tasks.length) return "";
  return `
    <div class="habit-linked-tasks">
      <span>Linked tasks</span>
      ${tasks.map((task) => `
        <div class="habit-linked-task ${task.done ? "is-done" : ""}">
          <strong>${escapeHtml(task.title)}</strong>
          ${task.subtext ? `<p>${escapeHtml(task.subtext)}</p>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function categoryRemovalFallback(name) {
  return categoryList().find((category) => category !== name) || "Uncategorized";
}

function ensureDeleteConfirmDialog() {
  let dialog = document.querySelector("[data-delete-confirm]");
  if (dialog) return dialog;

  dialog = document.createElement("aside");
  dialog.className = "category-confirm-overlay";
  dialog.dataset.deleteConfirm = "";
  dialog.hidden = true;
  dialog.innerHTML = `
    <div class="category-confirm-card" role="dialog" aria-modal="true" aria-labelledby="category-confirm-title">
      <p class="eyebrow" data-delete-confirm-eyebrow>Confirm delete</p>
      <h2 id="category-confirm-title" data-delete-confirm-title>Delete item?</h2>
      <p data-delete-confirm-copy></p>
      <div class="category-confirm-actions">
        <button class="delete-button confirm-delete-button" type="button" data-confirm-delete>Confirm delete</button>
        <button class="ghost-button" type="button" data-cancel-delete>Cancel</button>
      </div>
    </div>
  `;
  document.body.append(dialog);

  dialog.querySelector("[data-confirm-delete]").addEventListener("click", () => {
    const action = pendingDeleteAction?.onConfirm;
    closeDeleteConfirm();
    if (typeof action === "function") action();
  });
  dialog.querySelector("[data-cancel-delete]").addEventListener("click", closeDeleteConfirm);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDeleteConfirm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) closeDeleteConfirm();
  });
  return dialog;
}

function openDeleteConfirm({ eyebrow = "Confirm delete", title = "Delete item?", copy = "", confirmLabel = "Confirm delete", onConfirm }) {
  pendingDeleteAction = { onConfirm };
  const dialog = ensureDeleteConfirmDialog();
  const eyebrowTarget = dialog.querySelector("[data-delete-confirm-eyebrow]");
  const titleTarget = dialog.querySelector("[data-delete-confirm-title]");
  const copyTarget = dialog.querySelector("[data-delete-confirm-copy]");
  const confirmTarget = dialog.querySelector("[data-confirm-delete]");
  if (eyebrowTarget) eyebrowTarget.textContent = eyebrow;
  if (titleTarget) titleTarget.textContent = title;
  if (copyTarget) copyTarget.textContent = copy;
  if (confirmTarget) confirmTarget.textContent = confirmLabel;
  dialog.hidden = false;
  document.body.classList.add("has-category-confirm");
  window.setTimeout(() => {
    confirmTarget?.focus();
  }, 0);
}

function closeDeleteConfirm() {
  pendingDeleteAction = null;
  pendingCategoryRemoval = "";
  const dialog = document.querySelector("[data-delete-confirm]");
  if (dialog) dialog.hidden = true;
  document.body.classList.remove("has-category-confirm");
}

function openCategoryRemoveConfirm(category) {
  pendingCategoryRemoval = category;
  const fallback = categoryRemovalFallback(category);
  openDeleteConfirm({
    eyebrow: "Confirm delete",
    title: "Delete category?",
    copy: `This will remove "${category}". Existing goals and habits in this area will move to ${fallback}.`,
    confirmLabel: "Delete category",
    onConfirm: () => removeCategory(category)
  });
}

function setCategoryStatus(message) {
  document.querySelectorAll("[data-category-status]").forEach((status) => {
    status.textContent = message;
  });
}

function addCategory(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    setCategoryStatus("Name an area first.");
    return;
  }
  if (categoryList().some((category) => category.toLowerCase() === trimmed.toLowerCase())) {
    setCategoryStatus(`${trimmed} already exists.`);
    return;
  }
  state.categories.push(trimmed);
  saveAndRender();
  setCategoryStatus(`${trimmed} added.`);
}

function removeCategory(name) {
  const categories = categoryList();
  const remaining = categories.filter((category) => category !== name);
  const fallback = remaining[0] || "Uncategorized";
  state.categories = remaining;
  state.goals.forEach((goal) => {
    if (goal.category === name) goal.category = fallback;
  });
  state.habits.forEach((habit) => {
    if (habit.category === name) habit.category = fallback;
  });
  if (editingCategoryName === name) editingCategoryName = "";
  saveAndRender();
  setCategoryStatus(remaining.length ? `${name} removed. Existing items moved to ${fallback}.` : `${name} removed. Add a new area when you are ready.`);
}

function renameCategory(currentName, nextName) {
  const trimmed = String(nextName || "").trim();
  if (!trimmed) {
    setCategoryStatus("Name the area before saving.");
    return;
  }
  if (trimmed.toLowerCase() === currentName.toLowerCase()) {
    setCategoryStatus(`${currentName} is unchanged.`);
    return;
  }
  if (categoryList().some((category) => category.toLowerCase() === trimmed.toLowerCase())) {
    setCategoryStatus(`${trimmed} already exists.`);
    return;
  }

  state.categories = categoryList().map((category) => category === currentName ? trimmed : category);
  state.goals.forEach((goal) => {
    if (goal.category === currentName) goal.category = trimmed;
  });
  state.habits.forEach((habit) => {
    if (habit.category === currentName) habit.category = trimmed;
  });
  editingCategoryName = "";
  saveAndRender();
  setCategoryStatus(`${currentName} renamed to ${trimmed}.`);
}

function renderHabits() {
  document.querySelectorAll("[data-habit-table]").forEach((table) => {
    table.innerHTML = "";
    table.classList.add("daily-habit-table");
    table.append(dailyDateControl());
    if (!state.habits.length) return;

    const list = document.createElement("div");
    list.className = "daily-habit-list";
    state.habits.forEach((habit) => list.append(dailyHabitRow(habit, selectedHabitDate())));
    table.append(list);
  });

  renderStreaks();
  renderEndOfDayReminders();
  toggleEmpty("dashboardHabits", state.habits.length === 0);
  toggleEmpty("habitsPage", state.habits.length === 0);
}

function dailyDateControl() {
  const control = document.createElement("div");
  control.className = "daily-date-control";
  const selected = selectedHabitDate();
  const selectedLabel = formatHabitDay(selected);
  control.innerHTML = `
    <div class="daily-date-copy">
      <span>Editing</span>
      <strong>${selectedLabel}</strong>
    </div>
    <div class="daily-date-strip" aria-label="Recent days">
      ${recentHabitDateKeys().map((key) => `
        <button class="daily-date-button ${key === selected ? "is-active" : ""}" type="button" data-date-select="${key}" aria-pressed="${key === selected}">
          <span title="${formatHabitDay(key)}">${formatHabitButtonDay(key)}</span>
          <small>${dateForKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
        </button>
      `).join("")}
    </div>
  `;
  control.querySelectorAll("[data-date-select]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedHabitDateKey = button.dataset.dateSelect;
      render();
    });
  });
  return control;
}

function dailyHabitRow(habit, key) {
  const row = document.createElement("div");
  const record = habitRecord(habit, key);
  const done = Boolean(record.done);
  const isReflecting = openReflectionKey === reflectionEditKey(habit.id, key);
  const canReflect = !done && (shouldShowReflection(key) || isReflecting);
  row.className = `daily-habit-row ${done ? "is-done" : ""}`;
  row.innerHTML = `
    <div class="daily-habit-main">
      <strong>${escapeHtml(habit.name)}</strong>
      <span>${escapeHtml(habit.category || fallbackCategory())} | ${formatHabitDay(key)}</span>
      ${linkedTaskMarkup(habit)}
    </div>
    <div class="daily-habit-actions">
      <button class="daily-done-button ${done ? "is-done" : ""}" type="button" data-toggle-habit="${habit.id}" aria-pressed="${done}">
        ${done ? "Mark not done" : "Mark done"}
      </button>
      ${!done ? `<button class="ghost-button missed-button" type="button" data-reflect-missed="${habit.id}">Reflect missed</button>` : ""}
      <button class="delete-button habit-delete-button" type="button" data-delete-habit="${habit.id}" aria-label="Delete ${escapeHtml(habit.name)}">Delete</button>
    </div>
    ${canReflect || record.reflection ? `
      <div class="reflection-box">
        <label>
          Reflection
          <textarea data-reflection-input="${habit.id}" rows="2" placeholder="What got in the way? What will you try next?">${escapeHtml(record.reflection)}</textarea>
        </label>
        <button class="ghost-button" type="button" data-save-reflection="${habit.id}">${record.reflection ? "Update reflection" : "Save reflection"}</button>
      </div>
    ` : ""}
  `;
  row.querySelector("[data-toggle-habit]")?.addEventListener("click", () => {
    const match = state.habits.find((item) => item.id === habit.id);
    if (match) {
      setHabitDone(match, key, !done);
      openReflectionKey = done ? reflectionEditKey(habit.id, key) : "";
    }
    saveAndRender();
  });
  row.querySelector("[data-reflect-missed]")?.addEventListener("click", () => {
    openReflectionKey = reflectionEditKey(habit.id, key);
    render();
    window.setTimeout(() => {
      document.querySelector(`[data-reflection-input="${habit.id}"]`)?.focus();
    }, 0);
  });
  row.querySelector("[data-delete-habit]").addEventListener("click", () => {
    openDeleteConfirm({
      eyebrow: "Confirm delete",
      title: "Delete habit?",
      copy: `This will delete "${habit.name}" and its daily check history. Any goal steps linked to it will show a missing routine link.`,
      confirmLabel: "Delete habit",
      onConfirm: () => {
        state.habits = state.habits.filter((item) => item.id !== habit.id);
        saveAndRender();
      }
    });
  });
  row.querySelector("[data-save-reflection]")?.addEventListener("click", () => {
    const match = state.habits.find((item) => item.id === habit.id);
    const input = row.querySelector("[data-reflection-input]");
    if (match && input) setHabitReflection(match, key, input.value);
    openReflectionKey = "";
    saveAndRender();
  });
  return row;
}

function renderStreaks() {
  document.querySelectorAll("[data-streak-list]").forEach((list) => {
    list.innerHTML = "";
    state.habits.forEach((habit) => {
      const row = document.createElement("div");
      row.className = "streak-row";
      row.innerHTML = `<strong>${escapeHtml(habit.name)}</strong><span>${habitStreak(habit)} days</span>`;
      list.append(row);
    });
  });
  toggleEmpty("streaks", state.habits.length === 0);
}

function renderTodayReadouts() {
  document.querySelectorAll("[data-today-readout]").forEach((readout) => {
    readout.innerHTML = `<span>Today</span><strong>${formatTodayReadout()}</strong><small>${formatCurrentTimeReadout()}</small>`;
  });
}

function formatCurrentTimeReadout() {
  return new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ensureAuthScreen() {
  if (document.querySelector("[data-auth-screen]")) return;
  const screen = document.createElement("section");
  screen.className = "auth-screen";
  screen.dataset.authScreen = "";
  screen.innerHTML = `
    <div class="auth-hud" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <article class="auth-card">
      <div class="auth-copy">
        <p class="eyebrow">Plan well</p>
        <h1>Your progress, saved to your account.</h1>
        <p>Log in or sign up to keep goals, habits, tasks, categories, reflections, and XP connected to you across devices.</p>
      </div>

      <div class="auth-tabs" role="tablist" aria-label="Account mode">
        <button class="auth-tab is-active" type="button" data-auth-mode="login">Login</button>
        <button class="auth-tab" type="button" data-auth-mode="signup">Sign up</button>
      </div>

      <div class="auth-setup" data-auth-setup hidden>
        <strong>Supabase setup needed</strong>
        <span>Add your project URL and anon key in <code>supabase-config.js</code>, then run <code>supabase/schema.sql</code> in Supabase.</span>
      </div>

      <button class="auth-provider-button" type="button" data-auth-google>Continue with Google</button>

      <form class="auth-form" data-auth-email-form>
        <label>
          Email
          <input name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" placeholder="Minimum 6 characters">
        </label>
        <div class="auth-actions">
          <button class="text-button" type="submit" data-auth-submit>Login with email</button>
          <button class="ghost-button" type="button" data-auth-magic>Send magic link</button>
        </div>
      </form>

      <p class="auth-status" data-auth-status aria-live="polite"></p>
    </article>
  `;
  document.body.prepend(screen);
}

function bindAuthControls() {
  const screen = document.querySelector("[data-auth-screen]");
  if (!screen || screen.dataset.bound === "1") return;
  screen.dataset.bound = "1";
  let mode = "login";

  const setMode = (nextMode) => {
    mode = nextMode;
    screen.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authMode === mode);
    });
    const submit = screen.querySelector("[data-auth-submit]");
    const password = screen.querySelector('input[name="password"]');
    if (submit) submit.textContent = mode === "signup" ? "Create account" : "Login with email";
    if (password) password.autocomplete = mode === "signup" ? "new-password" : "current-password";
    setAuthStatus("");
  };

  screen.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.authMode));
  });

  screen.querySelector("[data-auth-google]")?.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase is not configured yet.");
      return;
    }
    setAuthStatus("Opening Google...");
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href.split("#")[0] }
    });
    if (error) setAuthStatus(error.message);
  });

  screen.querySelector("[data-auth-email-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) {
      setAuthStatus("Supabase is not configured yet.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (!email || !password) {
      setAuthStatus("Enter an email and password.");
      return;
    }

    setAuthStatus(mode === "signup" ? "Creating account..." : "Logging in...");
    const response = mode === "signup"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (response.error) {
      setAuthStatus(response.error.message);
      return;
    }
    setAuthStatus(mode === "signup" ? "Account created. Check your email if confirmation is enabled." : "Logged in.");
  });

  screen.querySelector("[data-auth-magic]")?.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase is not configured yet.");
      return;
    }
    const email = String(screen.querySelector('input[name="email"]')?.value || "").trim();
    if (!email) {
      setAuthStatus("Enter your email first.");
      return;
    }
    setAuthStatus("Sending magic link...");
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] }
    });
    setAuthStatus(error ? error.message : "Magic link sent. Check your email.");
  });

  setMode("login");
}

function setAuthStatus(message) {
  document.querySelectorAll("[data-auth-status]").forEach((status) => {
    status.textContent = message;
  });
}

function renderAccountControls() {
  document.querySelectorAll(".top-actions").forEach((actions) => {
    let chip = actions.querySelector("[data-account-chip]");
    if (!currentUser) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "account-chip";
      chip.dataset.accountChip = "";
      actions.append(chip);
    }
    chip.innerHTML = `
      <div>
        <span>${escapeHtml(authDisplayName())}</span>
        <small>${escapeHtml(userEmail() || syncStatus)}</small>
      </div>
      <em data-sync-status>${escapeHtml(syncStatus)}</em>
      <button class="ghost-button" type="button" data-sign-out>Sign out</button>
    `;
    chip.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      authSession = null;
      currentUser = null;
      applyState(createEmptyState());
      render();
      setAuthVisibility();
    });
  });
}

function renderEndOfDayReminders() {
  const key = todayKey();
  const missed = todayMissedHabits();
  const dismissed = localStorage.getItem(reminderStorageKey(key)) === "1";
  const shouldShow = isEndOfDayWindow() && missed.length > 0 && !dismissed;

  document.querySelectorAll("[data-end-day-reminder]").forEach((panel) => {
    panel.hidden = !shouldShow;
    panel.innerHTML = "";
    if (!shouldShow) return;

    panel.innerHTML = `
      <div>
        <p class="eyebrow">End-of-day check</p>
        <h2>${missed.length} habit${missed.length === 1 ? "" : "s"} still open today.</h2>
        <p>${missed.map((habit) => escapeHtml(habit.name)).join(", ")}</p>
      </div>
      <div class="reminder-actions">
        <button class="text-button" type="button" data-review-habits>Review habits</button>
        <button class="ghost-button" type="button" data-dismiss-reminder>Dismiss tonight</button>
      </div>
    `;

    panel.querySelector("[data-review-habits]")?.addEventListener("click", () => {
      const target = document.querySelector("#habits-section") || document.querySelector("[data-habit-table]");
      target?.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
    });
    panel.querySelector("[data-dismiss-reminder]")?.addEventListener("click", () => {
      localStorage.setItem(reminderStorageKey(key), "1");
      renderEndOfDayReminders();
    });
  });
}

function showSaveStatus(type) {
  const panel = document.querySelector(`[data-save-status="${type}"]`);
  if (!panel) return;
  document.querySelectorAll("[data-save-status]").forEach((item) => {
    item.hidden = item !== panel;
    item.classList.remove("is-visible");
  });
  panel.hidden = false;
  void panel.offsetWidth;
  panel.classList.add("is-visible");
}

function bindSaveGuidance() {
  document.querySelectorAll("[data-add-another]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.addAnother;
      const panel = document.querySelector(`[data-save-status="${type}"]`);
      const form = document.querySelector(`[data-${type}-form]`);
      if (panel) {
        panel.hidden = true;
        panel.classList.remove("is-visible");
      }
      if (form) {
        form.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
        window.setTimeout(() => {
          form.querySelector("input, select, textarea")?.focus();
        }, REDUCED_MOTION ? 0 : 320);
      }
    });
  });
}

function dateFromValue(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateToValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  const date = dateFromValue(value);
  if (!date) return "Pick a deadline";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function calendarViewDate(field) {
  const year = Number(field.dataset.calendarYear);
  const month = Number(field.dataset.calendarMonth);
  if (Number.isInteger(year) && Number.isInteger(month)) return new Date(year, month, 1);
  const input = field.querySelector("[data-date-input]");
  const selected = dateFromValue(input?.value);
  const today = new Date();
  const base = selected || today;
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

function setCalendarView(field, date) {
  field.dataset.calendarYear = String(date.getFullYear());
  field.dataset.calendarMonth = String(date.getMonth());
}

function closeDateCalendar(field) {
  const popover = field.querySelector("[data-date-popover]");
  const trigger = field.querySelector("[data-date-trigger]");
  if (popover) popover.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  field.classList.remove("is-open");
}

function closeAllDateCalendars(exceptField = null) {
  document.querySelectorAll("[data-date-field]").forEach((field) => {
    if (field !== exceptField) closeDateCalendar(field);
  });
}

function renderDateCalendar(field) {
  const popover = field.querySelector("[data-date-popover]");
  const input = field.querySelector("[data-date-input]");
  if (!popover || !input) return;

  const view = calendarViewDate(field);
  const selectedValue = input.value;
  const todayValue = dateToValue(new Date());
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  const dayButtons = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = dateToValue(date);
    const classes = [
      "date-day",
      date.getMonth() !== month ? "is-muted" : "",
      value === todayValue ? "is-today" : "",
      value === selectedValue ? "is-selected" : ""
    ].filter(Boolean).join(" ");
    return `<button class="${classes}" type="button" data-date-day="${value}" aria-label="${formatDisplayDate(value)}">${date.getDate()}</button>`;
  }).join("");

  popover.innerHTML = `
    <div class="date-calendar-head">
      <button class="date-nav" type="button" data-date-nav="-1" aria-label="Previous month">&lt;</button>
      <strong>${MONTH_NAMES[month]} ${year}</strong>
      <button class="date-nav" type="button" data-date-nav="1" aria-label="Next month">&gt;</button>
    </div>
    <div class="date-calendar-grid">
      ${CALENDAR_DAYS.map((day) => `<span class="date-weekday">${day}</span>`).join("")}
      ${dayButtons}
    </div>
  `;
}

function openDateCalendar(field) {
  closeAllDateCalendars(field);
  const popover = field.querySelector("[data-date-popover]");
  const trigger = field.querySelector("[data-date-trigger]");
  if (!popover || !trigger) return;
  setCalendarView(field, calendarViewDate(field));
  renderDateCalendar(field);
  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  field.classList.add("is-open");
}

function syncDateHints() {
  document.querySelectorAll("[data-date-field]").forEach((field) => {
    const input = field.querySelector("[data-date-input]");
    const value = field.querySelector("[data-date-value]");
    if (value) value.textContent = formatDisplayDate(input?.value);
    field.classList.toggle("has-date", Boolean(input?.value));
  });
}

function bindDateHints() {
  document.querySelectorAll("[data-date-field]").forEach((field) => {
    const input = field.querySelector("[data-date-input]");
    const trigger = field.querySelector("[data-date-trigger]");
    const popover = field.querySelector("[data-date-popover]");
    if (!input || !trigger || !popover) return;

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (field.classList.contains("is-open")) {
        closeDateCalendar(field);
      } else {
        openDateCalendar(field);
      }
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openDateCalendar(field);
    });

    popover.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nav = event.target.closest("[data-date-nav]");
      if (nav) {
        const view = calendarViewDate(field);
        view.setMonth(view.getMonth() + Number(nav.dataset.dateNav));
        setCalendarView(field, view);
        renderDateCalendar(field);
        popover.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        field.classList.add("is-open");
        return;
      }

      const day = event.target.closest("[data-date-day]");
      if (!day) return;
      input.value = day.dataset.dateDay;
      setCalendarView(field, dateFromValue(input.value) || calendarViewDate(field));
      syncDateHints();
      renderDateCalendar(field);
      closeDateCalendar(field);
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-date-field]")) return;
    closeAllDateCalendars();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllDateCalendars();
  });

  syncDateHints();
}

function microStepLines(form) {
  const textarea = form.querySelector('textarea[name="steps"]');
  return String(textarea?.value || "")
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);
}

function collectRoutinePlannerChoices(form) {
  const existing = Array.isArray(form._routineLinkChoices) ? form._routineLinkChoices : [];
  const rows = [...form.querySelectorAll("[data-routine-step-index]")];
  if (!rows.length) return existing;

  const choices = rows.map((row, index) => {
    const mode = row.querySelector("[data-routine-mode]")?.value || "none";
    const habitId = row.querySelector("[data-routine-existing-habit]")?.value || "";
    const routineIdea = row.querySelector("[data-routine-idea]")?.value || "";
    return {
      text: row.dataset.routineStepText || "",
      mode,
      habitId,
      routineIdea,
      index
    };
  });
  form._routineLinkChoices = choices;
  return choices;
}

function routineChoiceForLine(form, text, index) {
  const choices = collectRoutinePlannerChoices(form);
  const exact = choices.find((choice) => choice.index === index && choice.text === text);
  if (exact) return exact;
  return choices.find((choice) => choice.text === text) || { text, mode: "none", habitId: "", index };
}

function renderRoutineLinkPlanner(form) {
  const planner = form.querySelector("[data-routine-link-planner]");
  if (!planner) return;

  const lines = microStepLines(form);
  if (!lines.length) {
    form._routineLinkChoices = [];
    planner.innerHTML = `
      <div class="routine-planner-empty">
        <strong>Daily routine support</strong>
        <span>Add micro steps above, then describe what daily routine could help you make progress.</span>
      </div>
    `;
    return;
  }

  const nextChoices = lines.map((line, index) => {
    const choice = routineChoiceForLine(form, line, index);
    return { text: line, routineIdea: choice.routineIdea || choice.habitIdea || "", index };
  });
  form._routineLinkChoices = nextChoices;

  planner.innerHTML = `
    <div class="routine-planner-heading">
      <div>
        <strong>Daily routine support</strong>
        <span>Micro steps measure success. Habits describe what you can repeat in real life to get there.</span>
      </div>
      <small>${lines.length} step${lines.length === 1 ? "" : "s"} planned</small>
    </div>
    <div class="routine-planner-list">
      ${nextChoices.map((choice, index) => `
        <div class="routine-planner-row" data-routine-step-index="${index}" data-routine-step-text="${escapeHtml(choice.text)}">
          <div class="routine-step-copy">
            <span>Step ${index + 1}</span>
            <strong>${escapeHtml(choice.text)}</strong>
          </div>
          <label class="routine-idea-field">
            Daily routine idea
            <textarea data-routine-idea rows="2" placeholder="Example: Practice English for 30 minutes after school.">${escapeHtml(choice.routineIdea)}</textarea>
          </label>
          <p>Optional. Add the actual routine in the habit tracker when you want it checked daily.</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRoutineLinkPlanners() {
  document.querySelectorAll("[data-goal-form]").forEach(renderRoutineLinkPlanner);
}

function bindRoutinePlanner(form) {
  const textarea = form.querySelector('textarea[name="steps"]');
  const categorySelect = form.querySelector('select[name="category"]');
  const planner = form.querySelector("[data-routine-link-planner]");

  textarea?.addEventListener("input", () => renderRoutineLinkPlanner(form));
  categorySelect?.addEventListener("change", () => renderRoutineLinkPlanner(form));
  planner?.addEventListener("input", (event) => {
    collectRoutinePlannerChoices(form);
    if (event.target.matches("[data-routine-idea]")) return;
    renderRoutineLinkPlanner(form);
  });
  planner?.addEventListener("change", () => collectRoutinePlannerChoices(form));
}

function stepsFromGoalForm(form, category) {
  const lines = microStepLines(form);
  const choices = collectRoutinePlannerChoices(form);
  return lines.map((text, index) => {
    const choice = choices[index] || { routineIdea: "" };
    return normalizeStep({ id: uid("step"), text, done: false, routineIdea: choice.routineIdea || "", linkedHabitTarget: 7 });
  });
}

function bindForms() {
  document.querySelectorAll("[data-category-form]").forEach((categoryForm) => {
    categoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(categoryForm);
      addCategory(form.get("categoryName"));
      categoryForm.reset();
      categoryForm.querySelector("input")?.focus();
    });
  });

  document.querySelectorAll("[data-goal-form]").forEach((goalForm) => {
    bindRoutinePlanner(goalForm);
    goalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(goalForm);
      const category = String(form.get("category") || fallbackCategory());
      const steps = stepsFromGoalForm(goalForm, category);
      state.goals.push({
        id: uid("goal"),
        title: String(form.get("title") || "").trim(),
        category,
        deadline: String(form.get("deadline") || ""),
        why: String(form.get("why") || "").trim(),
        measure: String(form.get("measure") || "").trim(),
        reward: String(form.get("reward") || "").trim(),
        steps,
        complete: false
      });
      goalForm.reset();
      goalForm._routineLinkChoices = [];
      renderRoutineLinkPlanner(goalForm);
      window.setTimeout(syncDateHints, 0);
      saveAndRender();
      showSaveStatus("goal");
    });
  });

  document.querySelectorAll("[data-habit-form]").forEach((habitForm) => {
    habitForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(habitForm);
      state.habits.push(makeHabit(form.get("name"), form.get("category")));
      habitForm.reset();
      const weeklyInput = habitForm.querySelector('[name="weeklyGoal"]');
      if (weeklyInput) weeklyInput.value = 7;
      saveAndRender();
      showSaveStatus("habit");
    });
  });

  document.querySelectorAll("[data-task-form]").forEach((taskForm) => {
    taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(taskForm);
      state.tasks.push(makeTask(form.get("title"), form.get("subtext"), form.get("linkedHabitId")));
      taskForm.reset();
      saveAndRender();
      taskForm.querySelector("input, textarea, select")?.focus();
    });
  });
}

function saveAndRender() {
  saveState();
  render();
}

function render() {
  renderTodayReadouts();
  syncMetrics();
  renderCategoryOptions();
  renderRoutineLinkPlanners();
  renderGoals();
  renderCategories();
  renderTasks();
  renderHabits();
}

function toggleEmpty(name, shouldShow) {
  document.querySelectorAll(`[data-empty="${name}"]`).forEach((element) => {
    element.hidden = !shouldShow;
  });
}

function categoryClass(category) {
  const map = {
    Health: "health",
    School: "study",
    Hobbies: "creative"
  };
  return map[category] || "study";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Session storage can be unavailable in some browser modes.
  }
}

function safeSessionTake(key) {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

function pulseControl(control) {
  if (!control || REDUCED_MOTION) return;
  control.classList.remove("is-activating");
  void control.offsetWidth;
  control.classList.add("is-activating");
  window.setTimeout(() => control.classList.remove("is-activating"), 420);
}

function pulseSection(section) {
  if (!section || REDUCED_MOTION) return;
  section.classList.remove("section-arriving");
  void section.offsetWidth;
  section.classList.add("section-arriving");
  window.setTimeout(() => section.classList.remove("section-arriving"), 1100);
}

function scrollToHashSection(hash, control) {
  const target = document.querySelector(hash);
  if (!target) return false;
  pulseControl(control);
  history.pushState(null, "", hash);
  target.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
  pulseSection(target);
  return true;
}

function runPageArrival() {
  if (REDUCED_MOTION) return;
  const source = safeSessionTake("planwell-transition-source");
  document.body.dataset.transitionSource = source || "direct";
  document.body.classList.add("page-arriving");
  window.setTimeout(() => {
    document.body.classList.remove("page-arriving");
    delete document.body.dataset.transitionSource;
  }, 900);
}

function bindLinkMotion() {
  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target && link.target !== "_self" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(link.getAttribute("href"), window.location.href);
      if (destination.origin !== window.location.origin) return;

      const sameDocument = destination.pathname === window.location.pathname && destination.search === window.location.search;
      if (sameDocument && destination.hash) {
        if (!document.querySelector(destination.hash)) return;
        event.preventDefault();
        scrollToHashSection(destination.hash, link);
        return;
      }

      if (destination.href === window.location.href) {
        event.preventDefault();
        pulseControl(link);
        return;
      }

      event.preventDefault();
      pulseControl(link);
      safeSessionSet("planwell-transition-source", link.textContent.trim() || "link");
      document.body.classList.add("page-exiting");
      window.setTimeout(() => {
        window.location.href = destination.href;
      }, REDUCED_MOTION ? 0 : 280);
    });
  });
}

function bindDashboardSectionLinks() {
  document.querySelectorAll("[data-dashboard-section-link]").forEach((link) => {
    const heading = link.closest(".summary-lane-heading");
    if (!heading) return;
    heading.addEventListener("click", (event) => {
      const rect = link.getBoundingClientRect();
      const buffer = 12;
      const clickIsInsideButton =
        event.clientX >= rect.left - buffer &&
        event.clientX <= rect.right + buffer &&
        event.clientY >= rect.top - buffer &&
        event.clientY <= rect.bottom + buffer;

      if (!clickIsInsideButton) return;
      event.preventDefault();
      event.stopPropagation();
      scrollToHashSection(link.getAttribute("href"), link);
    }, true);
  });
}

function bindButtonMotion() {
  document.querySelectorAll("button, .text-button, .ghost-button, .check").forEach((control) => {
    control.addEventListener("pointerdown", () => pulseControl(control));
  });
}

function bindScrollNav() {
  const links = [...document.querySelectorAll('.nav-list a[href^="#"]')];
  if (!links.length) return;
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  let ticking = false;
  const updateSectionMotion = () => {
    const viewportCenter = window.innerHeight / 2;
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.max(-1, Math.min(1, (sectionCenter - viewportCenter) / window.innerHeight));
      const intensity = Math.abs(distance);
      section.style.setProperty("--section-depth", `${Math.round(-170 * intensity)}px`);
      section.style.setProperty("--section-shift", `${Math.round(distance * 46)}px`);
      section.style.setProperty("--section-tilt", `${(distance * -8.5).toFixed(2)}deg`);
      section.style.setProperty("--section-scale", (1 - intensity * 0.055).toFixed(3));
      section.style.setProperty("--section-opacity", (1 - intensity * 0.2).toFixed(3));
      section.style.setProperty("--section-saturation", (1 + (1 - intensity) * 0.38).toFixed(3));
    });
  };
  const updateActive = () => {
    let current = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.42) current = section;
    });
    links.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
    });
    updateSectionMotion();
    ticking = false;
  };
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateActive);
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  updateActive();
}

async function initializeApp() {
  document.body.classList.add("is-auth-loading");
  ensureAuthScreen();
  bindAuthControls();
  runPageArrival();
  bindForms();
  bindDateHints();
  bindSaveGuidance();
  bindDashboardSectionLinks();
  bindLinkMotion();
  bindButtonMotion();
  bindScrollNav();
  initSupabaseClient();

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      await bootstrapUserState(data.session);
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (!authInitialized && event === "INITIAL_SESSION") return;
        await bootstrapUserState(session);
        render();
        setAuthVisibility();
      });
    } catch (error) {
      applyState(loadState());
      setSyncStatus("Using local cache - auth failed");
      console.error("Plan Well auth failed", error);
    }
  } else {
    applyState(createEmptyState());
  }

  authInitialized = true;
  render();
  setAuthVisibility();
  window.setInterval(() => {
    renderTodayReadouts();
    renderEndOfDayReminders();
  }, 60000);
}

void initializeApp();
