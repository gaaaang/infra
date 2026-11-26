import { Component, type ReactNode } from "react";

/** 화면 하나에서 오류가 나도 앱 전체가 하얗게 멈추지 않도록 막는다. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rule bg-sheet p-8 text-center shadow-sheet">
        <p className="text-lg font-bold">화면을 그리는 중 문제가 생겼어요</p>
        <p className="mt-2 text-sm text-ink-mute">새로고침하면 대부분 해결돼요. 계속되면 팀에 알려 주세요.</p>
        <button className="btn mt-5" onClick={() => location.reload()}>새로고침</button>
      </div>
    );
  }
}
