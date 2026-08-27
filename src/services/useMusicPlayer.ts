// hooks/useMusicPlayer.ts
// Shared TrackPlayer hook used by both MemoryCard and PostDetailScreen.
// TrackPlayer is a singleton — only one track plays app-wide at a time.
import { useEffect, useState, useCallback } from 'react';
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
  usePlaybackState,
  Capability,
} from 'react-native-track-player';

let playerReady = false;

export async function setupPlayer() {
  if (playerReady) return;
  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
  playerReady = true;
}

export interface MusicTrack {
  id: string;        // memory id — used to identify which card owns the track
  url: string;       // Deezer preview URL
  title: string;
  artist: string;
  artwork?: string;  // album art URL
}

/**
 * useMusicPlayer(track)
 * Returns { isPlaying, isLoading, toggle }
 * Calling toggle() on a different card auto-stops the previous one.
 */
export function useMusicPlayer(track: MusicTrack) {
  const playbackState = usePlaybackState();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isThisTrackActive = activeId === track.id;
  const isPlaying =
    isThisTrackActive &&
    (playbackState as any)?.state === State.Playing;

  const toggle = useCallback(async () => {
    try {
      setIsLoading(true);
      const queue = await TrackPlayer.getQueue();
      const currentTrack = await TrackPlayer.getActiveTrack();

      // Same track — just play/pause
      if (currentTrack?.id === track.id) {
        if ((playbackState as any)?.state === State.Playing) {
          await TrackPlayer.pause();
        } else {
          await TrackPlayer.play();
        }
        setActiveId(track.id);
        setIsLoading(false);
        return;
      }

      // Different track — reset and load new
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
      });
      await TrackPlayer.play();
      setActiveId(track.id);
    } catch (err) {
      console.error('useMusicPlayer toggle error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [track, playbackState]);

  return { isPlaying, isLoading, toggle };
}
