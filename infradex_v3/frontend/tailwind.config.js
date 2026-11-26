/** 인프라덱스 디자인 토큰 — '사건 파일' 콘셉트 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F5F0",   // 바탕 (옅은 서류색)
        sheet: "#FFFFFF",   // 카드
        ink: { DEFAULT: "#1E2430", soft: "#4B5262", mute: "#8A8778" },
        rule: "#E9E4DA",    // 구분선
        stamp: "#C2412D",   // 미해결 도장
        solved: "#2F7A68",  // 해결·수집
        mark: "#F3C94F",    // 형광펜(증거)
        folder: "#F0E8D6",  // 폴더 탭·카테고리 배지
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', "Pretendard", "system-ui", "-apple-system", '"Apple SD Gothic Neo"', '"Malgun Gothic"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        sheet: "0 1px 2px rgba(30,36,48,.04), 0 6px 20px -8px rgba(30,36,48,.08)",
        lift: "0 2px 4px rgba(30,36,48,.05), 0 12px 28px -10px rgba(30,36,48,.16)",
      },
    },
  },
  plugins: [],
};
