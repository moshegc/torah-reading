import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayerBar } from './AudioPlayerBar';
import type { RecordingItem } from '../types';

vi.mock('./TorahTextViewer', () => ({ TorahTextViewer: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('audio gain diagnostics', () => {
  const recording: RecordingItem = {
    id: 'gain', aliyah: 'הקלטה', title: 'gain.mp3',
    category: 'shabbat', ext: 'mp3', viewUrl: '/audio',
    normalization: { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 },
  };

  it.each([[undefined, false], ['false', false], ['true', true]])('renders diagnostics only when enabled (%s)', (flag, enabled) => {
    vi.stubEnv('VITE_AUDIO_GAIN_DEBUG', flag);
    const html = renderToStaticMarkup(<AudioPlayerBar recording={recording} onClose={vi.fn()} />);
    expect(html.includes('תיקון עוצמה ידני')).toBe(enabled);
    expect(html.includes('תוצאת סריקה:')).toBe(enabled);
    expect(html).toContain('<audio');
  });

  it('still reports invalid scan data with diagnostics disabled', () => {
    vi.stubEnv('VITE_AUDIO_GAIN_DEBUG', 'false');
    const invalid = { ...recording, normalization: { ...recording.normalization!, gainDb: 99 } };
    const html = renderToStaticMarkup(<AudioPlayerBar recording={invalid} onClose={vi.fn()} />);
    expect(html).toContain('נתוני איזון העוצמה אינם תקינים');
    expect(html).toContain('role="alert"');
  });
});

describe('auto-play checkbox', () => {
  const recording: RecordingItem = {
    id: 'first', aliyah: 'עליית ראשון', title: 'first.mp3',
    category: 'shabbat', ext: 'mp3', viewUrl: '/audio',
  };

  it.each([false, true])('shows the student option in the player (enabled: %s)', (autoAdvance) => {
    const html = renderToStaticMarkup(
      <AudioPlayerBar recording={recording} onClose={vi.fn()} autoAdvance={autoAdvance} onAutoAdvanceChange={vi.fn()} />
    );
    expect(html).toContain('הפעלה אוטומטית של הקטע הבא');
    expect(html).toContain('type="checkbox"');
    expect(html.includes('checked=""')).toBe(autoAdvance);
  });

  it('does not show the option for players that do not support auto-advance', () => {
    const html = renderToStaticMarkup(<AudioPlayerBar recording={recording} onClose={vi.fn()} />);
    expect(html).not.toContain('type="checkbox"');
  });
});

describe('recording completion', () => {
  it.each([false, true])('notifies the student view only when repeat is off (repeat: %s)', (isLooping) => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ isLooping }),
    });

    const onEnded = vi.fn();
    const recording: RecordingItem = {
      id: 'first', aliyah: 'עליית ראשון', title: 'first.mp3',
      category: 'shabbat', ext: 'mp3', viewUrl: '/audio',
    };
    let audioProps: React.ComponentProps<'audio'> | undefined;
    function Probe() {
      const player = AudioPlayerBar({ recording, onClose: vi.fn(), onEnded });
      if (React.isValidElement<{ children: React.ReactNode }>(player)) {
        React.Children.forEach(player.props.children, (child) => {
          if (React.isValidElement<React.ComponentProps<'audio'>>(child) && child.type === 'audio') {
            audioProps = child.props;
          }
        });
      }
      return player;
    }
    renderToStaticMarkup(<Probe />);
    expect(audioProps?.onEnded).toBeTypeOf('function');
    audioProps!.onEnded!({} as React.SyntheticEvent<HTMLAudioElement>);
    expect(onEnded).toHaveBeenCalledTimes(isLooping ? 0 : 1);
    audioProps!.onPause!({} as React.SyntheticEvent<HTMLAudioElement>);
    audioProps!.onError!({} as React.SyntheticEvent<HTMLAudioElement>);
    expect(onEnded).toHaveBeenCalledTimes(isLooping ? 0 : 1);
  });
});
