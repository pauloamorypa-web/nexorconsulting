/* Vídeos animados (padrão da Blue). O id substitui o vídeo antigo de mesmo nome em produtos.tsx. */
import React from "react";
import type { Tempos } from "../kit";
import { VideoBarber, temposBarber } from "./Barber";
import { VideoAtende, temposAtende } from "./Atende";
import { VideoRH, temposRH } from "./RH";
import { VideoContabil, temposContabil } from "./Contabil";
import { VideoAgente, temposAgente } from "./Agente";
import { VideoElo, temposElo } from "./Elo";
import { VideoEloFornecedor, temposEloFornecedor } from "./EloFornecedor";

export const ANIMADOS: { id: string; componente: React.FC; tempos: Tempos }[] = [
  { id: "NexorBarber30s", componente: VideoBarber, tempos: temposBarber },
  { id: "NexorAtende30s", componente: VideoAtende, tempos: temposAtende },
  { id: "NexorRH30s", componente: VideoRH, tempos: temposRH },
  { id: "NexorContabil30s", componente: VideoContabil, tempos: temposContabil },
  { id: "NexorAgente30s", componente: VideoAgente, tempos: temposAgente },
  { id: "NexorElo30s", componente: VideoElo, tempos: temposElo },
  { id: "NexorEloFornecedor", componente: VideoEloFornecedor, tempos: temposEloFornecedor },
];
