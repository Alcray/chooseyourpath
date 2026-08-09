// Hand-written story templates, one per lesson, in natural Eastern Armenian.
// Placeholders substituted at generation time (see templateProvider.ts):
//   {nameDef}  — character's Armenian definite/subject form, e.g. "Լեոն" / "Ալիքը"
//   {nameGen}  — character's Armenian genitive/possessive form, e.g. "Լեոյի" / "Ալիքի"
//   {placeLoc} — setting's Armenian locative form ("in the ..."), e.g. "Կախարդական անտառում"
// These are precomputed per character/setting (see data/options.ts) rather than
// concatenated, because Armenian definite/genitive suffixes depend on whether the
// name ends in a vowel or consonant.
//
// Each scene has TWO independent fields, kept deliberately separate:
//   narration — Armenian text shown as a caption and sent to narration TTS
//   action    — English verb-phrase describing what happens visually, consumed only
//               by VeoPromptBuilder (never shown to the child). It completes the
//               sentence "<character description> is ___", so it should NOT repeat
//               the subject — see promptBuilder.ts.
//
// Each lesson has one decision point with two branches: an "ideal" choice (3 stars)
// and an "alternative" choice that still resolves warmly and teaches the lesson (2
// stars). Nothing here ever punishes or shames the child's pick — every branch ends
// on a positive note.

export interface SceneTpl {
  narration: string;
  action: string;
  mood: "happy" | "curious" | "worried" | "excited" | "proud" | "calm";
}

export interface LessonTemplate {
  title: string;
  opening: SceneTpl[];
  decisionPrompt: string;
  choiceA: { label: string; icon: string; description: string };
  choiceB: { label: string; icon: string; description: string };
  branchA: {
    consequence: SceneTpl[];
    reflectionQuestion: string;
    reflectionOptions: { label: string; icon: string }[];
    insight: string;
    summaryTitle: string;
    summaryMessage: string;
    moralRecap: string;
  };
  branchB: {
    consequence: SceneTpl[];
    reflectionQuestion: string;
    reflectionOptions: { label: string; icon: string }[];
    insight: string;
    summaryTitle: string;
    summaryMessage: string;
    moralRecap: string;
  };
}

export const LESSON_TEMPLATES: Record<string, LessonTemplate> = {
  honesty: {
    title: "{nameGen} ազնիվ օրը",
    opening: [
      {
        narration: "Մի օր {nameDef} խաղում էր {placeLoc} և պատահաբար կոտրեց ընկերոջ սիրելի խաղալիքը։",
        action: "playing happily, then accidentally bumping into a friend's toy and knocking it over, looking startled",
        mood: "worried",
      },
      {
        narration: "Խաղալիքը կոտրվեց մի փոքրիկ ճայթյունով։ Ոչ ոք չտեսավ։ {nameGen} սիրտն արագ էր բաբախում։",
        action: "standing alone near the broken toy, looking around nervously with a worried, fast-beating-heart expression",
        mood: "worried",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Ասել ճշմարտությունը", icon: "🗣️", description: "Գնալ ընկերոջ մոտ ու պատմել, թե ինչ եղավ" },
    choiceB: { label: "Լռել", icon: "🤫", description: "Հուսալ, որ ոչ ոք չի իմանա" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} մոտեցավ ընկերոջը և ասաց․ «Ես պատահաբար կոտրեցի քո խաղալիքը։ Շատ եմ ցավում»։",
          action: "walking up to a friend character with a gentle apologetic expression, speaking softly with hands clasped",
          mood: "calm",
        },
        {
          narration: "Ընկերը զարմացավ, հետո ժպտաց․ «Շնորհակալ եմ, որ ասացիր ինձ։ Դա մեծ խիզախություն էր»։",
          action: "smiling warmly at a friend who gives a happy, reassuring nod, sunny cheerful mood",
          mood: "happy",
        },
      ],
      reflectionQuestion: "Ինչպե՞ս կարծում ես՝ ինչպես զգաց ընկերը, երբ {nameDef} ասաց ճշմարտությունը։",
      reflectionOptions: [
        { label: "Ուրախ ու հպարտ", icon: "🥰" },
        { label: "Մի քիչ տխուր խաղալիքի համար, բայց ուրախ ազնվության համար", icon: "🙂" },
      ],
      insight: "Ճշմարտությունն ասելը օգնում է ընկերներին ավելի շատ վստահել իրար, նույնիսկ երբ դա սկզբում վախեցնող է։",
      summaryTitle: "{nameDef} ընտրեց ազնվությունը",
      summaryMessage: "{nameDef} խիզախություն գտավ անմիջապես ասելու ճշմարտությունը, և դա ընկերությունն ավելի ամուր դարձրեց։",
      moralRecap: "Ազնվությունը ամրացնում է վստահությունը, նույնիսկ երբ ճշմարտությունն ասելը դժվար է։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} լռեց և հեռացավ ոտնաթաթերի վրա։",
          action: "quietly tiptoeing away from the broken toy, glancing back nervously",
          mood: "worried",
        },
        {
          narration: "Բայց գաղտնիքը ծանր էր զգացվում, ասես մի քար լիներ փորի մեջ, ամբողջ օրը։",
          action: "sitting alone looking troubled and heavy-hearted, slouched shoulders, a gray gloomy mood",
          mood: "worried",
        },
        {
          narration: "Վերջապես {nameDef} վերադարձավ և ասաց․ «Դա ես էի։ Պետք է ավելի շուտ ասեի»։ Ընկերը գրկեց իրեն ջերմորեն։",
          action: "returning to confess to a friend, who then gives a warm gentle hug, relieved happy mood",
          mood: "calm",
        },
      ],
      reflectionQuestion: "Ինչպե՞ս էր զգում {nameDef}, երբ պահում էր գաղտնիքը իր մեջ։",
      reflectionOptions: [
        { label: "Անհանգիստ ու ծանրացած", icon: "😟" },
        { label: "Թեթևացած՝ ճշմարտությունն ասելուց հետո", icon: "😌" },
      ],
      insight: "Գաղտնիքները կարող են ծանր զգացվել։ Ճշմարտությունն ասելը, նույնիսկ ուշացումով, միշտ մեզ ավելի թեթև է դարձնում։",
      summaryTitle: "{nameDef} սովորեց ազնվության մասին",
      summaryMessage: "Դա մի փոքր ժամանակ պահանջեց, բայց {nameDef} գտավ խիզախությունը ասելու ճշմարտությունը, և դա հպարտության արժանի է։",
      moralRecap: "Երբեք ուշ չէ ընտրելու ճշմարտությունը։",
    },
  },

  kindness: {
    title: "{nameGen} բարի գաղափարը",
    opening: [
      {
        narration: "{placeLoc} {nameDef} նկատեց մի փոքրիկ արարածի, որը մենակ նստած էր ու տխուր տեսք ուներ։",
        action: "noticing another small friendly cartoon creature sitting alone looking sad, curious concerned expression",
        mood: "curious",
      },
      {
        narration: "Արարածը գետնին էր գցել իր նախաճաշը, և նրան ուտելու ոչինչ չէր մնացել։",
        action: "watching a small sad creature look at its snack dropped in the mud, empty-handed and hungry",
        mood: "worried",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Կիսվել նախաճաշով", icon: "🍎", description: "Իմ սնունդի կեսը տալ նրան" },
    choiceB: { label: "Անցնել կողքով", icon: "🚶", description: "Դա իմ խնդիրը չէ, գնալ խաղալու" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} նստեց ու ասաց․ «Արի կիսվենք»։ Եվ բաժանեց նախաճաշը երկուսի։",
          action: "sitting down next to the sad creature and cheerfully sharing food, splitting a snack in half",
          mood: "happy",
        },
        {
          narration: "Նրանք միասին կերան ու ծիծաղեցին, և օրվա վերջում արդեն լավագույն ընկերներ էին։",
          action: "happily eating together with a new friend and laughing, a warm best-friends bonding moment",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ինչպե՞ս էր զգում նոր ընկերը, երբ {nameDef} կիսվեց նրա հետ։",
      reflectionOptions: [
        { label: "Սիրված ու ավելի քիչ մենակ", icon: "🥹" },
        { label: "Ուրախ, որ ընկեր ունի", icon: "😊" },
      ],
      insight: "Բարության մի փոքրիկ արարքը կարող է անծանոթին վերածել ընկերոջ։",
      summaryTitle: "{nameDef} ընտրեց բարությունը",
      summaryMessage: "{nameDef} նկատեց մեկին, ով կարիք ուներ օգնության, և արեց ինչ-որ բան դրա համար։ Հենց դա է բարությունը։",
      moralRecap: "Բարության փոքրիկ արարքները կարող են մեծ փոփոխություն բերել ուրիշի օրվա մեջ։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} հեռացավ խաղալու մենակ։",
          action: "walking away alone to play, leaving the sad creature behind",
          mood: "calm",
        },
        {
          narration: "Բայց խաղերն արդեն այնքան էլ զվարճալի չէին թվում, երբ մտածում էր տխուր արարածի մասին։",
          action: "playing alone but looking distracted and a little guilty, glancing back with concern",
          mood: "worried",
        },
        {
          narration: "{nameDef} վերադարձավ վազելով՝ նախաճաշով։ «Ներողություն, որ գնացի, արի կիսվենք»։ Արարածի դեմքը փայլեց։",
          action: "running back cheerfully with food to share, the small creature's face lighting up with joy",
          mood: "happy",
        },
      ],
      reflectionQuestion: "Ինչու՞ {nameDef} վերադարձավ ետ։",
      reflectionOptions: [
        { label: "Հոգատարությունը ուրիշների զգացմունքների հանդեպ", icon: "💛" },
        { label: "Նոր ընկերոջ հետ խաղալու ցանկությունը", icon: "🙂" },
      ],
      insight: "Լավ է մի պահ մտածել։ Կարևորն այն է, որ ի վերջո ընտրես բարությունը։",
      summaryTitle: "{nameDef} հայտնաբերեց բարությունը",
      summaryMessage: "{nameDef} մտածեց ու վերադարձավ օգնելու։ Մեր զգացմունքները լսելը կարող է մեզ բարության տանել։",
      moralRecap: "Երբեք ուշ չէ հետ շրջվել ու ընտրել բարությունը։",
    },
  },

  sharing: {
    title: "{nameGen} մեծ գյուտը",
    opening: [
      {
        narration: "{placeLoc}, {nameDef} գտավ մի հսկա փայլուն սնդուկ՝ լի փայլուն խաղալիքներով։",
        action: "excitedly discovering a huge sparkling treasure chest full of shiny toys, eyes wide with wonder",
        mood: "excited",
      },
      {
        narration: "Հենց այդ պահին երկու ընկեր վազեցին մոտ՝ մեծ աչքերով․ «Վա՜յ, մե՞նք էլ կարող ենք խաղալ»։",
        action: "watching two more small cartoon friends run up excitedly with wide curious eyes, pointing at the chest",
        mood: "curious",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Հերթով խաղալ", icon: "🔁", description: "Բոլորով հերթով խաղալ խաղալիքներով" },
    choiceB: { label: "Ամեն ինչ պահել", icon: "🙅", description: "Ես գտա, ուրեմն ամեն ինչ իմն է" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} ասաց․ «Արեք հերթով խաղանք, ես գտա, բայց բոլորիս համար բավական զվարճանք կա»։",
          action: "happily inviting two friends to take turns playing with the toys, warm generous gesture",
          mood: "happy",
        },
        {
          narration: "Նրանք կառուցեցին աշտարակներ, մրցարշավեցին խաղալիք մեքենաներով ու ամբողջ ցերեկը ծիծաղեցին միասին։",
          action: "playing together with two friends, building towers and racing toy cars, laughing joyfully",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Սնդուկը ավելի՞ զվարճալի էր կիսվելիս, թե՞ մենակ խաղալիս։",
      reflectionOptions: [
        { label: "Շատ ավելի զվարճալի կիսվելիս", icon: "🎉" },
        { label: "Մոտավորապես նույնը", icon: "🙂" },
      ],
      insight: "Կիսվելը լավ պահը դարձնում է հիանալի պահ, բոլորի, այդ թվում՝ քո համար։",
      summaryTitle: "{nameDef} ընտրեց կիսվելը",
      summaryMessage: "{nameDef} կիսվեց սնդուկով ու խաղը վերածեց ընկերների հետ տոնի։",
      moralRecap: "Կիսվելը լավ բաները դարձնում է ավելի լավ։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} վերցրեց սնդուկը ու ասաց․ «Իմն է»։ Ընկերները հանգիստ հեռացան։",
          action: "grabbing the treasure chest possessively and refusing to share, two friends sadly walking away",
          mood: "worried",
        },
        {
          narration: "Մենակ խաղալը հանգիստ էր։ Չափազանց հանգիստ։ Ոչ մի խաղալիք այնքան էլ զվարճալի չէր առանց ընկերների։",
          action: "playing alone with the toys, looking bored and lonely in a quiet, unexciting mood",
          mood: "calm",
        },
        {
          narration: "{nameDef} կանչեց ընկերներին ետ։ «Ես սխալվեցի, եկեք միասին խաղանք»։ Նրանք վազեցին ետ ժպիտներով։",
          action: "calling the friends back with an apologetic warm gesture, friends running back happily smiling",
          mood: "happy",
        },
      ],
      reflectionQuestion: "Ինչու՞ մենակ խաղալը այնքան էլ զվարճալի չէր։",
      reflectionOptions: [
        { label: "Ընկերների հետ ամեն ինչ ավելի զվարճալի է", icon: "🤝" },
        { label: "Չկար ոչ ոք տոնելու համար", icon: "🎊" },
      ],
      insight: "Այն, ինչ մենք սիրում ենք, ավելի լավն է դառնում, երբ կիսվում ենք ուրիշների հետ։",
      summaryTitle: "{nameDef} սովորեց կիսվել",
      summaryMessage: "{nameDef} հասկացավ, որ կիսվելը ավելի շատ ուրախություն է բերում, քան ամեն ինչ մենակ պահելը։",
      moralRecap: "Երբեք ուշ չէ բացել ձեռքերը ու կիսվել։",
    },
  },

  courage: {
    title: "{nameDef} ու բարձր կամուրջը",
    opening: [
      {
        narration: "{placeLoc} ճանապարհը տանում էր դեպի մի բարձր, երերացող կամուրջ՝ խոր անդունդի վրայով։",
        action: "looking at a tall wobbly wooden bridge stretching over a deep colorful canyon, dramatic but child-friendly",
        mood: "worried",
      },
      {
        narration: "{nameGen} ոտքերը դողում էին միայն նայելուց։ Կամրջի մյուս կողմում էր տան ճանապարհը։",
        action: "standing at the edge of the bridge looking nervous and small, legs shaking, wide worried eyes",
        mood: "worried",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Անել խիզախ քայլ", icon: "🦶", description: "Խորը շունչ քաշել ու դանդաղ անցնել" },
    choiceB: { label: "Ետ դառնալ", icon: "↩️", description: "Չափազանց վախեցնող է, փնտրել այլ ճանապարհ" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} խորը շունչ քաշեց, ամուր բռնվեց ու քայլ առ քայլ, զգուշորեն անցավ կամուրջը։",
          action: "bravely taking careful step-by-step across the wobbly bridge, holding on tight, focused determined expression",
          mood: "worried",
        },
        {
          narration: "Քայլ առ քայլ կամուրջն այլևս այնքան էլ վախեցնող չէր։ {nameDef} հասավ մյուս կողմը ու ուրախությամբ բացականչեց․ «Ես կարողացա»։",
          action: "reaching the other side of the bridge and cheering triumphantly, arms raised in victory, proud joyful moment",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ինչպե՞ս էր զգում {nameDef} կամուրջն անցնելուց հետո։",
      reflectionOptions: [
        { label: "Շատ հպարտ", icon: "🥳" },
        { label: "Դեռ մի քիչ դողդոջուն, բայց հպարտ", icon: "😅" },
      ],
      insight: "Խիզախությունը վախ չզգալը չէ, այլ քայլ անելը՝ նույնիսկ վախի մեջ։",
      summaryTitle: "{nameDef} ընտրեց խիզախությունը",
      summaryMessage: "{nameDef} վախեցած էր, բայց այնուամենայնիվ անցավ կամուրջը՝ քայլ առ քայլ, խիզախորեն։",
      moralRecap: "Խիզախ լինելը նշանակում է առաջ գնալ, նույնիսկ երբ վախենում ես։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} ետ դարձավ փնտրելու այլ ճանապարհ, բայց բոլոր արահետներն էլ տանում էին նույն երերացող կամրջին։",
          action: "looking around anxiously trying other paths, all leading back to the same wobbly bridge",
          mood: "worried",
        },
        {
          narration: "{nameDef} նստեց կամրջի մոտ ու հանգիստ շնչեց՝ դիտելով, թե ինչպես է այն թեթև օրորվում քամուց։",
          action: "sitting calmly near the bridge, taking slow deep breaths, watching it gently sway, peaceful moment",
          mood: "calm",
        },
        {
          narration: "Մի փոքր հանգստացած՝ {nameDef} որոշեց փորձել, քայլ առ քայլ, ու հասավ մյուս կողմը։",
          action: "calmly deciding to try, crossing step by step with growing confidence, reaching the other side happily",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ի՞նչն օգնեց, որ {nameDef} պատրաստ զգա փորձելու։",
      reflectionOptions: [
        { label: "Հանգիստ շնչելը ու հանգստանալը", icon: "🌬️" },
        { label: "Հասկանալը, որ այլ ճանապարհ չկա", icon: "🤔" },
      ],
      insight: "Կարելի է կանգ առնել, երբ վախենում ես։ Խիզախությունը կարող է աճել հենց այն պահին, երբ պատրաստ ես։",
      summaryTitle: "{nameDef} գտավ խիզախությունը",
      summaryMessage: "{nameDef} մի փոքր ժամանակ խնդրեց, և դա նորմալ է․ խիզախությունը եկավ հենց այն ժամանակ, երբ պետք էր։",
      moralRecap: "Բոլորը երբեմն վախենում են։ Խիզախությունը նշանակում է փորձել, նույնիսկ մի փոքր ուշ։",
    },
  },

  patience: {
    title: "{nameGen} աճող այգին",
    opening: [
      {
        narration: "{nameDef} {placeLoc} տնկեց մի փոքրիկ կախարդական սերմ՝ հուսալով գեղեցիկ ծաղիկ ստանալ։",
        action: "happily planting a tiny magical seed in the ground and sprinkling water on it, hopeful excited expression",
        mood: "excited",
      },
      {
        narration: "Հաջորդ առավոտ {nameDef} վազեց դուրս... բայց դեռ ոչինչ չէր բուսել։",
        action: "running outside eagerly to check the garden, then looking a little disappointed at the empty soil",
        mood: "curious",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Սպասել ու ջրել", icon: "💧", description: "Շարունակել հոգ տանել նրա մասին, քիչ-քիչ ամեն օր" },
    choiceB: { label: "Փորել հանել", icon: "🪏", description: "Հանել հողից ու տեսնել, թե ինչ է պատահել" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} ամեն օր քնքշորեն ջրում էր սերմը ու երգում նրա համար մի փոքրիկ երգ։",
          action: "gently watering a small seedling every day and singing softly, a caring peaceful daily ritual",
          mood: "calm",
        },
        {
          narration: "Համբերատար սպասելուց հետո՝ մի գեղեցիկ, հսկա ծաղիկ բացվեց՝ {placeLoc} ամենալավը։",
          action: "watching a beautiful giant colorful flower bloom magnificently in the garden, amazed delighted expression",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ինչու՞ համբերատար սպասելը օգնեց ծաղկին այդքան լավ աճել։",
      reflectionOptions: [
        { label: "Լավ բաները ժամանակ են պահանջում", icon: "🌸" },
        { label: "Սերմին պետք էր հոգատարություն, ոչ թե շտապողականություն", icon: "💧" },
      ],
      insight: "Համբերությունը թույլ է տալիս լավ բաներին աճել ճիշտ իրենց ժամանակին։",
      summaryTitle: "{nameDef} ընտրեց համբերությունը",
      summaryMessage: "{nameDef} ամեն օր հոգ էր տանում սերմի մասին ու սպասում, և այն վերածվեց մի հրաշալի բանի։",
      moralRecap: "Լավ բաներն արժե սպասել։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} հանեց սերմը հողից ստուգելու համար, ու նրա փոքրիկ արմատները մի քիչ վնասվեցին։",
          action: "digging up the seedling too early to check on it, roots getting slightly disturbed, worried expression",
          mood: "worried",
        },
        {
          narration: "{nameDef} ափսոսաց ու քնքշորեն վերադարձրեց այն հողի մեջ՝ խոստանալով այս անգամ սպասել։",
          action: "gently and carefully replanting the seedling back into the soil, apologetic caring gesture",
          mood: "calm",
        },
        {
          narration: "Հետագա հոգատար խնամքով սերմը ապաքինվեց ու դանդաղ վերածվեց մի սիրունիկ ծաղկի։",
          action: "watching the seedling slowly heal and grow into a lovely small flower over time, happily proud",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ի՞նչ սովորեց {nameDef} այն բանից, որ շուտ փորեց հողից։",
      reflectionOptions: [
        { label: "Ոմանք բաներ ժամանակ են ուզում, ոչ թե նայվածք", icon: "⏳" },
        { label: "Կարելի է նորից փորձել, ավելի քնքշորեն", icon: "🌱" },
      ],
      insight: "Մենք միշտ չէ, որ առաջին անգամից ճիշտ ենք անում։ Համբերությունը կարող է սկսվել, հենց երբ պատրաստ ենք։",
      summaryTitle: "{nameDef} սովորեց համբերությունը",
      summaryMessage: "{nameDef} հասկացավ, որ շտապելը կարող է դանդաղեցնել ամեն ինչ, իսկ քնքուշ սպասելը օգնում է բաներին աճել։",
      moralRecap: "Երբեք ուշ չէ դանդաղել ու համբերել։",
    },
  },

  teamwork: {
    title: "{nameDef} ու մեծ գլուխկոտրուկ պատը",
    opening: [
      {
        narration: "{placeLoc} խորքում {nameDef} գտավ մի հսկա քարե պատ՝ ծածկված գլուխկոտրուկի նշաններով, որը փակում էր ճանապարհը։",
        action: "discovering a huge stone wall covered in colorful puzzle symbols blocking the path, curious examining",
        mood: "curious",
      },
      {
        narration: "Այն չափազանց մեծ էր թվում մենակ լուծելու համար։ Երկու ընկեր մոտակայքում նույնպես նայում էին դրան։",
        action: "standing near two other small cartoon friends who are also puzzled at the huge wall, scratching heads",
        mood: "worried",
      },
    ],
    decisionPrompt: "Ի՞նչ պետք է անի {nameDef}։",
    choiceA: { label: "Միավորվել", icon: "🧩", description: "Խնդրել ընկերներին լուծել միասին" },
    choiceB: { label: "Փորձել մենակ", icon: "💪", description: "Փորձել լուծել ամբողջը մենակ" },
    branchA: {
      consequence: [
        {
          narration: "{nameDef} կանչեց․ «Արեք միասին լուծենք»։ Յուրաքանչյուր ընկեր նկատեց տարբեր հուշումներ։",
          action: "calling the friends together enthusiastically, each one pointing at different clues on the puzzle wall",
          mood: "happy",
        },
        {
          narration: "Բոլորի գաղափարները միասին բերելով՝ պատը արագորեն բացվեց։ «Մենք արեցինք դա, միասին»։",
          action: "celebrating together with friends as the stone wall dramatically opens, high-fiving, joyful triumphant moment",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ինչու՞ էր գլուխկոտրուկն ավելի հեշտ ընկերների հետ։",
      reflectionOptions: [
        { label: "Բոլորը տարբեր հուշումներ նկատեցին", icon: "🔎" },
        { label: "Ավելի զվարճալի էր միասին", icon: "🎉" },
      ],
      insight: "Թիմային աշխատանքը թույլ է տալիս բոլորի ուժեղ կողմերին աշխատել միասին. մեծ խնդիրներն ավելի հեշտ են դառնում, երբ օգնում ենք իրար։",
      summaryTitle: "{nameDef} ընտրեց համագործակցությունը",
      summaryMessage: "{nameDef} օգնություն խնդրեց ու միասին ընկերների հետ լուծեց գլուխկոտրուկը։",
      moralRecap: "Միասին աշխատելը դժվար բաները հեշտացնում է, ու ավելի զվարճալի։",
    },
    branchB: {
      consequence: [
        {
          narration: "{nameDef} երկար ժամանակ մենակ փորձեց ամեն նշան, բայց պատը չէր շարժվում։",
          action: "trying alone for a long time to solve the puzzle wall, frustrated and tired expression",
          mood: "worried",
        },
        {
          narration: "Հոգնած ու շփոթված՝ {nameDef} վերջապես ասաց․ «Միգուցե ինձ օգնություն է պետք»։",
          action: "sitting down tired and thinking, then having a hopeful realization moment",
          mood: "calm",
        },
        {
          narration: "Ընկերները անմիջապես միացան, ու միասին լուծեցին այն ընդամենը մի քանի րոպեում։",
          action: "friends joining in immediately, working together happily and solving the puzzle quickly, celebrating",
          mood: "proud",
        },
      ],
      reflectionQuestion: "Ի՞նչ փոխվեց, երբ {nameDef} օգնություն խնդրեց։",
      reflectionOptions: [
        { label: "Գլուխկոտրուկը լուծվեց շատ ավելի արագ", icon: "⚡" },
        { label: "Ավելի քիչ մենակ ու ավելի զվարճալի էր զգացվում", icon: "🤝" },
      ],
      insight: "Օգնություն խնդրելը հանձնվել չէ, դա թիմային աշխատանքի ամենախելացի քայլերից մեկն է։",
      summaryTitle: "{nameDef} սովորեց համագործակցությունը",
      summaryMessage: "{nameDef} սկզբում փորձեց մենակ, հետո հայտնաբերեց, թե որքան ավելի հեշտ է ընկերների հետ։",
      moralRecap: "Միշտ լավ ժամանակ է օգնություն խնդրելու ու թիմով աշխատելու համար։",
    },
  },
};
