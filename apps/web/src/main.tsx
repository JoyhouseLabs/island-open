import { createRoot } from "react-dom/client";
import App from "./App";
import { createBrowserRouter, RouterProvider } from "react-router";
import { installWebGLLossGuard } from "./webgl-loss-guard";
import "./styles.css";
installWebGLLossGuard();
createRoot(document.getElementById("root")!).render(
  <RouterProvider
    router={createBrowserRouter([{ path: "*", element: <App /> }])}
  />,
);
