"use client";

import { useEffect, useState } from "react";
import { getLearningModules, completeLearningLesson } from "@/lib/api";
import type { LearningModule, Lesson } from "@/lib/api";

const TYPE_ICON: Record<string, React.ReactNode> = {
  video: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  article: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  quiz: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const CATEGORY_COLORS: Record<string, string> = {
  Basics:     "bg-green-100 text-green-700",
  Templates:  "bg-purple-100 text-purple-700",
  Automation: "bg-orange-100 text-orange-700",
  Workflow:   "bg-blue-100 text-blue-700",
  Data:       "bg-teal-100 text-teal-700",
  General:    "bg-gray-100 text-gray-600",
};

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ModuleDetail({
  module: initial,
  onBack,
  onUpdated,
}: {
  module: LearningModule;
  onBack: () => void;
  onUpdated: (m: LearningModule) => void;
}) {
  const [module, setModule] = useState<LearningModule>(initial);
  const [toggling, setToggling] = useState<string | null>(null);

  const completedCount = module.lessons.filter((l) => l.completed).length;
  const total = module.lessons.length;

  const handleToggle = async (lesson: Lesson) => {
    setToggling(lesson.id);
    const res = await completeLearningLesson(module.id, lesson.id, !lesson.completed);
    if (res.success && res.data) { setModule(res.data); onUpdated(res.data); }
    setToggling(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 mt-0.5 transition-colors flex-shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[module.category] ?? CATEGORY_COLORS.General}`}>
              {module.category}
            </span>
            <span className="text-xs text-gray-400">{module.duration_minutes} min</span>
          </div>
          <h3 className="font-semibold text-gray-800 text-lg">{module.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{module.description}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-blue-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-gray-700">Your Progress</span>
          <span className="text-blue-700 font-semibold">{completedCount}/{total} lessons</span>
        </div>
        <ProgressBar value={completedCount} max={total} />
        {completedCount === total && total > 0 && (
          <p className="text-xs text-green-700 font-medium">✓ Module complete!</p>
        )}
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {module.lessons.map((lesson, idx) => (
          <div key={lesson.id}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-all
              ${lesson.completed ? "bg-green-50 border-green-100" : "bg-white border-gray-100 hover:border-blue-200"}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
              ${lesson.completed ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>
              {lesson.completed ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${lesson.completed ? "text-green-800 line-through" : "text-gray-800"}`}>
                {lesson.title}
              </p>
              <div className={`flex items-center gap-1 mt-0.5 ${lesson.completed ? "text-green-600" : "text-gray-400"}`}>
                {TYPE_ICON[lesson.type] ?? TYPE_ICON.article}
                <span className="text-[10px] capitalize">{lesson.type}</span>
              </div>
            </div>
            <button
              disabled={toggling === lesson.id}
              onClick={() => handleToggle(lesson)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex-shrink-0
                ${lesson.completed
                  ? "border border-green-300 text-green-700 hover:bg-green-100"
                  : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {toggling === lesson.id ? "…" : lesson.completed ? "Undo" : "Mark done"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────

export default function LearningDashboard() {
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LearningModule | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getLearningModules();
    if (res.success && res.data) setModules(res.data);
    setLoading(false);
  };

  const handleUpdated = (mod: LearningModule) => {
    setModules((prev) => prev.map((m) => m.id === mod.id ? mod : m));
    setSelected(mod);
  };

  const categories = ["All", ...Array.from(new Set(modules.map((m) => m.category)))];
  const filtered = activeCategory === "All" ? modules : modules.filter((m) => m.category === activeCategory);

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);
  const completedLessons = modules.reduce((s, m) => s + m.lessons.filter((l) => l.completed).length, 0);
  const completedModules = modules.filter((m) => m.lessons.length > 0 && m.lessons.every((l) => l.completed)).length;

  if (selected) {
    return <ModuleDetail module={selected} onBack={() => setSelected(null)} onUpdated={handleUpdated} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-gray-800">Learning Module Dashboard</h3>
        <p className="text-xs text-gray-400 mt-0.5">Track your progress through platform training modules.</p>
      </div>

      {/* Overall progress */}
      {!loading && modules.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{completedModules}/{modules.length}</p>
            <p className="text-xs text-gray-500 mt-1">Modules complete</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completedLessons}</p>
            <p className="text-xs text-gray-500 mt-1">Lessons done</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">
              {totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Overall progress</p>
          </div>
        </div>
      )}

      {/* Overall progress bar */}
      {!loading && totalLessons > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Overall completion</span>
            <span>{completedLessons}/{totalLessons} lessons</span>
          </div>
          <ProgressBar value={completedLessons} max={totalLessons} />
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
              ${activeCategory === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Module grid */}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mod) => {
            const done = mod.lessons.filter((l) => l.completed).length;
            const total = mod.lessons.length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const isComplete = total > 0 && done === total;

            return (
              <div key={mod.id}
                onClick={() => setSelected(mod)}
                className={`border rounded-xl bg-white p-5 hover:shadow-md transition-all cursor-pointer
                  ${isComplete ? "border-green-200 bg-green-50/30" : "hover:border-blue-200"}`}>
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[mod.category] ?? CATEGORY_COLORS.General}`}>
                    {mod.category}
                  </span>
                  {isComplete && (
                    <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>

                <h4 className="font-semibold text-gray-800 text-sm leading-snug">{mod.title}</h4>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{mod.description}</p>

                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{done}/{total} lessons</span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar value={done} max={total} />
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {mod.duration_minutes} min
                  </div>
                  <div className="flex items-center gap-1">
                    {mod.lessons.slice(0, 3).map((l) => (
                      <span key={l.id} className={`w-4 h-4 rounded-full border flex items-center justify-center
                        ${l.completed ? "bg-green-400 border-green-400" : "bg-white border-gray-200"}`}>
                        {l.completed && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    ))}
                    {mod.lessons.length > 3 && (
                      <span className="text-gray-300">+{mod.lessons.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
