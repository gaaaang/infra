import { Link } from "react-router-dom";
import { Sheet } from "../components/ui";

export default function NotFound() {
  return (
    <Sheet className="mx-auto max-w-md p-10 text-center">
      <p className="font-mono text-sm text-ink-mute">404</p>
      <p className="mt-2 text-xl font-bold">이 사건 파일은 존재하지 않아요</p>
      <p className="mt-2 text-sm text-ink-mute">주소가 바뀌었거나 잘못 입력된 것 같아요.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/" className="btn">홈으로</Link>
        <Link to="/terms" className="btn-ghost">단어장</Link>
      </div>
    </Sheet>
  );
}
