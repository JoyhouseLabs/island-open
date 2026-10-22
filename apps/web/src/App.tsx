import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { subSceneIds } from "@island/contracts";
import { pageTitles, paths } from "./routes";
const HomeSession = lazy(() => import("./HomeSession"));
const VisitSession = lazy(() => import("./VisitSession"));
const GameChrome = lazy(() => import("./GameChrome"));
const LearningLayout = lazy(() => import("./learning/LearningLayout"));
const LearningHome = lazy(() => import("./learning/LearningHome"));
const TrainingCenter = lazy(() => import("./learning/TrainingCenter"));
const TrainingPlan = lazy(() => import("./learning/TrainingPlan"));
const TrainingPlayer = lazy(() => import("./learning/TrainingPlayer"));
const LearningPlayer = lazy(() => import("./learning/LearningPlayer"));
const WildernessPage = lazy(() => import("./pages/WildernessPage"));
const IslandPage = lazy(() => import("./pages/IslandPage"));
const SubScenePage = lazy(() => import("./pages/SubScenePage"));
const PlacePage = lazy(() => import("./pages/PlacePage"));
const BooksPage = lazy(() => import("./pages/BooksPage"));
const BookReaderPage = lazy(() => import("./pages/BookReaderPage"));
const StudioPage = lazy(() => import("./pages/StudioPage"));
const VisitIslandPage = lazy(() => import("./pages/VisitIslandPage"));
const VisitScenePage = lazy(() => import("./pages/VisitScenePage"));

class PageBoundary extends Component<
  { children: ReactNode; path: string },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // In dev, hot-reload of a half-edited module graph (or stale chunks
    // after a server restart) breaks the open page; one fresh reload heals
    // it without losing any local draft. Only module-flavoured failures or
    // errors right after load auto-heal — genuine interaction bugs surface
    // here with their message instead of reloading in a loop.
    const moduleish =
      /dynamically imported module|module script failed|error loading dynamically|Importing a module|is not defined|does not provide an export|has no exported member|Failed to fetch/i.test(
        message,
      );
    if (moduleish || performance.now() < 10_000) {
      try {
        if (!sessionStorage.getItem("island-page-reload")) {
          sessionStorage.setItem("island-page-reload", "1");
          window.location.reload();
        }
      } catch {
        /* Private browsing just shows the manual reload button. */
      }
    }
    return { failed: true, message };
  }
  componentDidCatch(error: unknown) {
    console.error("页面渲染失败：", error);
  }
  componentDidUpdate(previous: { path: string }) {
    if (previous.path !== this.props.path && this.state.failed)
      this.setState({ failed: false, message: "" });
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading" role="alert">
        <h1>页面暂时没有打开</h1>
        <p>可以重新加载，本地草稿会保留。</p>
        {this.state.message && (
          <p className="tiny-note">{this.state.message.slice(0, 300)}</p>
        )}
        <button
          className="small-button"
          onClick={() => window.location.reload()}
        >
          重新加载
        </button>
        <Link to={paths.island}>返回主岛</Link>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const location = useLocation();
  // After a pointer click, buttons give up focus: otherwise Space (jump,
  // talk, enter doorway) would re-trigger the last-clicked button instead.
  useEffect(() => {
    const blur = (e: Event) => {
      const btn = (e.target as HTMLElement)?.closest?.("button");
      if (btn) btn.blur();
    };
    document.addEventListener("pointerup", blur);
    return () => document.removeEventListener("pointerup", blur);
  }, []);
  useEffect(() => {
    document.title = location.pathname.startsWith("/visit/")
      ? "朋友的家园 · 心灵家园"
      : location.pathname.startsWith("/learn") ? "学习中心 · 心灵家园"
      : (pageTitles[location.pathname.replace(/\/+$/, "")] ??
        "页面未找到 · 心灵家园");
    // A fresh mount means the last reload (if any) succeeded.
    try {
      sessionStorage.removeItem("island-page-reload");
    } catch {
      /* Ignore private-browsing failures. */
    }
  }, [location.pathname]);
  return (
    <PageBoundary path={location.pathname}>
      {/* One chat panel for every mode: host or visitor, any scene. */}
      {!location.pathname.startsWith("/learn") && location.pathname.replace(/\/+$/, "") !== paths.wilderness && <Suspense fallback={null}><GameChrome /></Suspense>}
      <Suspense
        fallback={
          <div className="scene-loading" role="status">
            <span>正在打开这处小天地…</span>
            <Link to={paths.island}>返回主岛</Link>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Navigate to={paths.island} replace />} />
          <Route element={<LearningLayout />}>
            <Route path="/learn/programs" element={<TrainingCenter />} />
            <Route path="/learn/programs/:programId" element={<TrainingCenter />} />
            <Route path="/learn/plans/:planId" element={<TrainingPlan />} />
            <Route path="/learn/reports/:planId" element={<TrainingPlan />} />
            <Route path="/learn/attempts/:attemptId" element={<TrainingPlayer />} />
            <Route path="/learn" element={<LearningHome />} />
            <Route path="/learn/lessons/:lessonId" element={<LearningHome />} />
            <Route path="/learn/sessions/:sessionId" element={<LearningPlayer />} />
          </Route>
          <Route element={<HomeSession />}>
            <Route path={paths.island} element={<IslandPage />} />
            <Route path={paths.wilderness} element={<WildernessPage />} />
            {subSceneIds.map((scene) => (
              <Route
                key={scene}
                path={paths[scene]}
                element={<SubScenePage scene={scene} />}
              />
            ))}
            <Route path="/place/:sceneId" element={<PlacePage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:bookId" element={<BookReaderPage />} />
            <Route path="/studio" element={<StudioPage />} />
          </Route>
          <Route element={<VisitSession />}>
            <Route path="/visit/:worldId" element={<VisitIslandPage />} />
            <Route
              path="/visit/:worldId/:scene"
              element={<VisitScenePage />}
            />
          </Route>
          <Route
            path="*"
            element={
              <div className="scene-loading">
                <h1>这处小天地尚未开放</h1>
                <p>请回到主岛，选择已开放的区域。</p>
                <Link className="small-button" to={paths.island}>
                  返回主岛
                </Link>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </PageBoundary>
  );
}
