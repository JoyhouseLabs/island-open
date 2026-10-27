import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import { installWebGLLossGuard } from "./webgl-loss-guard";
import "./styles.css";
installWebGLLossGuard();
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
