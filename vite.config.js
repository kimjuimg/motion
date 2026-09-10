import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages 는 https://kimjuimg.github.io/motion/ 처럼 저장소 이름이 붙은
  // 하위 경로로 서비스되므로, 빌드 결과의 자원 경로도 그 경로를 기준으로 잡습니다.
  base: "/motion/",
  plugins: [react()],
});
