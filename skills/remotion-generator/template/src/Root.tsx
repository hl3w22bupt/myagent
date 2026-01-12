import {Composition} from 'remotion';
import {MinimalVideo} from './MinimalVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MinimalVideo"
        component={MinimalVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
