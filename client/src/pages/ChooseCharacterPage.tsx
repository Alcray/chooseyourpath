import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { ChoiceCard } from "../components/ChoiceCard";
import { LoadingScene } from "../components/LoadingScene";
import { useOptions } from "../hooks/useOptions";
import { useSessionStore } from "../store/sessionStore";
import { useTranslation } from "../i18n";

export function ChooseCharacterPage() {
  const navigate = useNavigate();
  const { options, loading } = useOptions();
  const lesson = useSessionStore((s) => s.lesson);
  const customLesson = useSessionStore((s) => s.customLesson);
  const setCharacter = useSessionStore((s) => s.setCharacter);
  const { t } = useTranslation();

  if (!lesson && !customLesson) {
    navigate("/lesson", { replace: true });
    return null;
  }

  return (
    <PageShell title={t("pickers.character.title")} subtitle={t("pickers.character.subtitle")} step={{ current: 2, total: 3 }}>
      {loading && <LoadingScene label={t("loading.characters")} />}
      {options && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {options.characters.map((character, i) => (
            <ChoiceCard
              key={character.id}
              icon={character.emoji}
              label={character.name}
              color={character.color}
              index={i}
              onClick={() => {
                setCharacter(character);
                navigate("/setting");
              }}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
