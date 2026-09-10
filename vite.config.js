import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 상대 경로로 빌드해서 어느 위치에 올려도 자원을 찾게 합니다.
  // GitHub Pages 는 하위 경로(/motion/)로, Vercel 은 루트(/)로 서비스되는데
  // "./" 면 한 번의 빌드 결과가 두 곳 모두에서 동작합니다.
  base: "./",
  plugins: [react()],
});
