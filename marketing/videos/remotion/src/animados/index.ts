/* Vídeos animados (padrão da Blue). O id substitui o vídeo antigo de mesmo nome em produtos.tsx. */
import React from "react";
import type { Tempos } from "../kit";
import { VideoBarber, temposBarber } from "./Barber";

export const ANIMADOS: { id: string; componente: React.FC; tempos: Tempos }[] = [
  { id: "NexorBarber30s", componente: VideoBarber, tempos: temposBarber },
];
