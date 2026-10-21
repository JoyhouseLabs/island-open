import { Component, type ReactNode } from "react";

/**
 * Keeps one broken scene from taking the whole page down: the surrounding
 * UI (save, export, navigation) stays usable while the scene shows a soft
 * fallback. Shared by the island and every room.
 */
export default class SceneBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`${this.props.label}渲染失败：`, error);
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading" role="alert">
        {this.props.label}暂时无法绘制。你仍可导出存档或返回主岛。
      </div>
    ) : (
      this.props.children
    );
  }
}
