import React from "react";
import { Composition } from "remotion";
import { FPS, VideoProduto, duracaoEmQuadros } from "./VideoProduto";
import { PRODUTOS } from "./produtos";
import { VideoBlue, duracaoBlue } from "./VideoBlue";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {PRODUTOS.map((p) => (
        <Composition
          key={p.id}
          id={p.id}
          component={VideoProduto}
          defaultProps={{ produto: p }}
          durationInFrames={duracaoEmQuadros(p)}
          fps={FPS}
          width={1080}
          height={1920}
        />
      ))}
      {/* Blue: vídeo próprio, todo animado (sem telas paradas) */}
      <Composition id="NexorBlue30s" component={VideoBlue} durationInFrames={duracaoBlue} fps={FPS} width={1080} height={1920} />
    </>
  );
};
