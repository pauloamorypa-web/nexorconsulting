import React from "react";
import { Composition } from "remotion";
import { DURACAO, FPS, NexorBarber } from "./NexorBarber";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="NexorBarber30s"
      component={NexorBarber}
      durationInFrames={DURACAO}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
