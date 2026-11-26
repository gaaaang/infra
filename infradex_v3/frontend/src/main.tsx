import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import { CatalogProvider, ToastProvider } from "./lib/hooks";
import Home from "./pages/Home";
import Glossary from "./pages/Glossary";
import TermDetail from "./pages/TermDetail";
import Quiz from "./pages/Quiz";
import Chat from "./pages/Chat";
import Dex from "./pages/Dex";
import Courses from "./pages/Courses";
import Diagnosis from "./pages/Diagnosis";
import Stats from "./pages/Stats";
import Session from "./pages/Session";
import Flashcards from "./pages/Flashcards";
import NotFound from "./pages/NotFound";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CatalogProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="terms" element={<Glossary />} />
              <Route path="terms/:id" element={<TermDetail />} />
              <Route path="quiz" element={<Quiz />} />
              <Route path="chat" element={<Chat />} />
              <Route path="dex" element={<Dex />} />
              <Route path="courses" element={<Courses />} />
              <Route path="diagnosis" element={<Diagnosis />} />
              <Route path="session" element={<Session />} />
              <Route path="flashcards" element={<Flashcards />} />
              <Route path="stats" element={<Stats />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </CatalogProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
