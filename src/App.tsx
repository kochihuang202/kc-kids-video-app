import { Navigate, Route, Routes } from "react-router-dom";
import { CategoryPage, HomePage, WatchPage } from "./KidApp";
import ParentApp from "./ParentApp";

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/category/:categoryId" element={<CategoryPage />} />
    <Route path="/watch/:videoId" element={<WatchPage />} />
    <Route path="/parent/*" element={<ParentApp />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
