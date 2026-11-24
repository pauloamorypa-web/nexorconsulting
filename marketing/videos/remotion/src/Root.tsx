import React from "react";
import { Composition } from "remotion";
import { FPS, VideoProduto, duracaoEmQuadros } from "./VideoProduto";
import { PRODUTOS } from "./produtos";
import { VideoBlue, duracaoBlue } from "./VideoBlue";
import { ANIMADOS } from "./animados";
import { duracaoAnimado } from "./kit";
import { Institucional, duracaoInstitucional } from "./Institucional";
import { VideoTI, duracaoTI } from "./TI";
import { VideoVendas, duracaoVendas } from "./Vendas";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {PRODUTOS.filter((p) => !ANIMADOS.some((a) => a.id === p.id)).map((p) => (
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
      {ANIMADOS.map((a) => (
        <Composition key={a.id} id={a.id} component={a.componente} durationInFrames={duracaoAnimado(a.tempos)} fps={FPS} width={1080} height={1920} />
      ))}
      {/* Blue: vídeo próprio, todo animado (sem telas paradas) */}
      <Composition id="NexorBlue30s" component={VideoBlue} durationInFrames={duracaoBlue} fps={FPS} width={1080} height={1920} />
      {/* Institucional 16:9 */}
      <Composition id="NexorTI" component={VideoTI} durationInFrames={duracaoTI} fps={FPS} width={1920} height={1080} />
      <Composition id="NexorVendasB2B" component={VideoVendas} durationInFrames={duracaoVendas} fps={FPS} width={1920} height={1080} />
      <Composition id="NexorInstitucional" component={Institucional} durationInFrames={duracaoInstitucional} fps={FPS} width={1920} height={1080} />
    </>
  );
};
