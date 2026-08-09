import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageShell } from "../components/PageShell";
import { ChoiceCard } from "../components/ChoiceCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { LoadingScene } from "../components/LoadingScene";
import { useOptions } from "../hooks/useOptions";
import { useSessionStore } from "../store/sessionStore";
import { useTranslation } from "../i18n";

const MAX_LENGTH = 300;

export function ChooseLessonPage() {
  const navigate = useNavigate();
  const { options, loading, error } = useOptions();
  const setLesson = useSessionStore((s) => s.setLesson);
  const setCustomLesson = useSessionStore((s) => s.setCustomLesson);
  const { t } = useTranslation();

  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = text.trim();

  const submitCustom = () => {
    if (!trimmed) {
      setTouched(true);
      return;
    }
    setCustomLesson(trimmed);
    navigate("/character");
  };

  return (
    <PageShell title={t("pickers.lesson.title")} subtitle={t("pickers.lesson.subtitle")} step={{ current: 1, total: 3 }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex max-w-lg flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder={t("customLesson.placeholder")}
          rows={3}
          className="w-full rounded-[1.5rem] border-4 border-white bg-white/90 p-5 font-body text-lg text-slate-700 shadow-lg outline-none placeholder:text-slate-400 focus:border-indigo-300"
        />
        <div className="flex items-center justify-between px-1">
          {touched && !trimmed ? (
            <p className="font-body text-sm font-semibold text-rose-500">{t("errors.customLessonEmpty")}</p>
          ) : (
            <span />
          )}
          <span className="font-body text-sm text-slate-400">
            {text.length}/{MAX_LENGTH}
          </span>
        </div>
        <div className="flex justify-center">
          <PrimaryButton onClick={submitCustom}>{t("customLesson.submit")}</PrimaryButton>
        </div>
      </motion.div>

      <div className="mx-auto my-8 flex max-w-lg items-center gap-4 text-slate-400">
        <span className="h-px flex-1 bg-slate-300/60" />
        <span className="font-body text-sm font-bold">{t("pickers.lesson.or")}</span>
        <span className="h-px flex-1 bg-slate-300/60" />
      </div>

      {loading && <LoadingScene label={t("loading.options")} />}
      {error && <p className="text-center font-semibold text-rose-500">{t("errors.loadOptions")}</p>}
      {options && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {options.lessons.map((lesson, i) => (
            <ChoiceCard
              key={lesson.id}
              icon={lesson.icon}
              label={lesson.name}
              description={lesson.description}
              color={lesson.color}
              index={i}
              onClick={() => {
                setLesson(lesson);
                navigate("/character");
              }}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
