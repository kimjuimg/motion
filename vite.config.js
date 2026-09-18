import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 상대 경로로 빌드해서 어느 위치에 올려도 자원을 찾게 합니다.
  // GitHub Pages 는 하위 경로(/motion/)로, Vercel 은 루트(/)로 서비스되는데
  // "./" 면 한 번의 빌드 결과가 두 곳 모두에서 동작합니다.
  base: "./",
  plugins: [react()],

  build: {
    rolldownOptions: {
      output: {
        // Firebase SDK 는 App.jsx 에서 동적 import 로 떼어 놓았지만, 한 덩어리로
        // 두면 그것만 500kB 가 넘습니다. 어차피 함께 쓰이는 인증과 Firestore 를
        // 두 파일로 나누면 브라우저가 둘을 동시에 받아 갑니다.
        // re2js 는 Firestore 가 데리고 오는 정규식 라이브러리라 같이 묶습니다.
        advancedChunks: {
          groups: [
            {
              name: "firebase-auth",
              test: /node_modules[\\/]@firebase[\\/]auth[\\/]/,
            },
            {
              name: "firebase-firestore",
              test: /node_modules[\\/](@firebase[\\/](firestore|webchannel-wrapper)|re2js)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
