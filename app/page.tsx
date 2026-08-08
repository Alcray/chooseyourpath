"use client";

import { useState } from "react";

type Stage = "story" | "choice" | "success" | "lesson";

const stepFor = (stage: Stage) => {
  if (stage === "story") return 1;
  if (stage === "choice") return 2;
  return 3;
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("story");
  const currentStep = stepFor(stage);

  return (
    <main className="lesson-shell">
      <div className="sun-glow" aria-hidden="true" />
      <section className="lesson-card" aria-labelledby="lesson-title">
        <header className="lesson-header">
          <div className="brand-mark" aria-hidden="true">
            <span>♥</span>
          </div>
          <div>
            <p className="eyebrow">Փոքրիկ ընտրություն · մեծ դաս</p>
            <h1 id="lesson-title">Կիսվել նշանակում է հոգ տանել</h1>
          </div>
        </header>

        <ol className="progress" aria-label="Դասի ընթացքը">
          {["Պատմություն", "Ընտրություն", "Հետևանք"].map((label, index) => {
            const step = index + 1;
            const state = step < currentStep ? "done" : step === currentStep ? "active" : "todo";

            return (
              <li className={state} key={label} aria-current={state === "active" ? "step" : undefined}>
                <span>{state === "done" ? "✓" : step}</span>
                {label}
              </li>
            );
          })}
        </ol>

        <div className="stage" aria-live="polite">
          {stage === "story" && (
            <div className="story-layout">
              <div className="video-frame">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src="/sharing-is-caring-armenian-final.mp4"
                  aria-label="Փիփ աղվեսի և Մոմո նապաստակի պատմությունը"
                />
              </div>

              <div className="story-copy">
                <span className="stage-number">01 · Պատմությունը</span>
                <h2>Չորս կեքս, երկու ընկեր</h2>
                <p>
                  Փիփ աղվեսը զբոսանքի է բերել չորս համեղ կեքս։ Նրա ընկեր Մոմոն մոռացել է իր ուտելիքը և
                  քաղցած է։
                </p>
                <div className="context-note">
                  <span aria-hidden="true">🧁</span>
                  <p>
                    Փիփը կարող է բոլոր կեքսերը պահել իրեն կամ բաժանել դրանք՝ <strong>երկուական</strong>։
                  </p>
                </div>
                <button className="primary-button" onClick={() => setStage("choice")}>
                  Կատարել ընտրություն
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}

          {stage === "choice" && (
            <div className="choice-stage">
              <span className="stage-number">02 · Քո ընտրությունը</span>
              <h2>Ի՞նչ պետք է անի Փիփը։</h2>
              <p className="choice-prompt">Ընտրիր այն քայլը, որն ամենալավն է երկու ընկերների համար։</p>

              <div className="choices">
                <button className="choice-card share-choice" onClick={() => setStage("success")}>
                  <span className="choice-icon" aria-hidden="true">🧁🤝🧁</span>
                  <span className="choice-title">Կիսել Մոմոյի հետ</span>
                  <span className="choice-detail">Փիփը տալիս է երկու կեքս, երկուսը պահում իրեն։</span>
                  <span className="choice-action">Ընտրել այս տարբերակը →</span>
                </button>

                <button className="choice-card keep-choice" onClick={() => setStage("lesson")}>
                  <span className="choice-icon" aria-hidden="true">🧺</span>
                  <span className="choice-title">Պահել բոլոր կեքսերը</span>
                  <span className="choice-detail">Փիփը ոչինչ չի տալիս և մենակ է ուտում։</span>
                  <span className="choice-action">Ընտրել այս տարբերակը →</span>
                </button>
              </div>

              <button className="text-button" onClick={() => setStage("story")}>
                ← Վերադառնալ պատմությանը
              </button>
            </div>
          )}

          {stage === "success" && (
            <div className="result-stage success-stage">
              <div className="result-illustration" aria-hidden="true">
                <span>🦊</span>
                <span className="shared-muffins">🧁 🧁</span>
                <span>🐰</span>
              </div>
              <span className="result-badge">Հոգատար ընտրություն</span>
              <h2>Ճի՛շտ ուղղություն</h2>
              <p>
                Փիփն ու Մոմոն ստանում են երկուական կեքս։ Երկուսն էլ կուշտ են, ուրախ և պատրաստ միասին խաղալու։
              </p>
              <div className="moral-box">
                <strong>Ինչո՞ւ է սա լավ ընտրություն։</strong>
                <span>Փիփը բավական ուտելիք ունի, իսկ կիսվելով՝ նա նաև օգնում է ընկերոջը։ Ուրախությունը կրկնապատկվում է։</span>
              </div>
              <button className="primary-button" onClick={() => setStage("story")}>
                Կրկնել պատմությունը ↻
              </button>
            </div>
          )}

          {stage === "lesson" && (
            <div className="result-stage lesson-stage">
              <div className="result-illustration quiet" aria-hidden="true">
                <span>🦊🧺</span>
                <span className="dotted-path">······</span>
                <span>🐰</span>
              </div>
              <span className="result-badge">Եկե՛ք մտածենք</span>
              <h2>Այս ճանապարհը լավ չի ավարտվում</h2>
              <p>
                Փիփը մենակ է ուտում, իսկ Մոմոն մնում է քաղցած ու տխուր։ Կեքսերը չեն շատանում, բայց ընկերների ուրախությունը պակասում է։
              </p>
              <div className="comparison" role="note" aria-label="Ավելի լավ ընտրության բացատրություն">
                <div>
                  <span aria-hidden="true">✕</span>
                  <p><strong>Պահել բոլորը</strong><br />Մեկը կուշտ է, մյուսը՝ տխուր։</p>
                </div>
                <div>
                  <span aria-hidden="true">♥</span>
                  <p><strong>Կիսվել երկուական</strong><br />Երկուսն էլ կուշտ են և ուրախ։</p>
                </div>
              </div>
              <p className="gentle-lesson">
                Սխալվելը սովորելու մի մասն է։ Կիսվելը հիմա էլ ավելի լավ ընտրություն է։
              </p>
              <button className="primary-button" onClick={() => setStage("choice")}>
                Փորձել նորից
                <span aria-hidden="true">↻</span>
              </button>
            </div>
          )}
        </div>

        <footer>
          <p>Մի փոքր բան կիսելիս՝ մեծ բարություն ենք ստեղծում։</p>
        </footer>
      </section>
    </main>
  );
}
