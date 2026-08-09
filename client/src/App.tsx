import { Route, Routes } from "react-router-dom";
import { OptionsProvider } from "./hooks/useOptions";
import { HomePage } from "./pages/HomePage";
import { ChooseLessonPage } from "./pages/ChooseLessonPage";
import { ChooseCharacterPage } from "./pages/ChooseCharacterPage";
import { ChooseSettingPage } from "./pages/ChooseSettingPage";
import { StoryPage } from "./pages/StoryPage";

export default function App() {
  return (
    <OptionsProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lesson" element={<ChooseLessonPage />} />
        <Route path="/character" element={<ChooseCharacterPage />} />
        <Route path="/setting" element={<ChooseSettingPage />} />
        <Route path="/story" element={<StoryPage />} />
      </Routes>
    </OptionsProvider>
  );
}
