import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { ChoiceCard } from "../components/ChoiceCard";
import { LoadingScene } from "../components/LoadingScene";
import { useOptions } from "../hooks/useOptions";
import { useSessionStore } from "../store/sessionStore";
import { useTranslation } from "../i18n";

export function ChooseSettingPage() {
  const navigate = useNavigate();
  const { options, loading } = useOptions();
  const character = useSessionStore((s) => s.character);
  const setSetting = useSessionStore((s) => s.setSetting);
  const { t } = useTranslation();

  if (!character) {
    navigate("/character", { replace: true });
    return null;
  }

  return (
    <PageShell title={t("pickers.setting.title")} subtitle={t("pickers.setting.subtitle")} step={{ current: 3, total: 3 }}>
      {loading && <LoadingScene label={t("loading.settings")} />}
      {options && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {options.settings.map((setting, i) => (
            <ChoiceCard
              key={setting.id}
              icon={setting.emoji}
              label={setting.name}
              color={setting.color}
              index={i}
              onClick={() => {
                setSetting(setting);
                navigate("/story");
              }}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
