import { useEffect, useState } from "react";
import {
  AudioLines,
  CloudLightning,
  CloudRain,
  PawPrint,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import type { useAudio, AmbientId } from "./useAudio";
import {
  onVoicesChanged,
  setVoicesEnabled,
  voicesEnabled,
} from "./animals/voices";

/** Ambience controls shared by the island panel and every room's time panel. */
const sounds: { id: AmbientId; name: string; hint: string; icon: typeof Waves }[] =
  [
    { id: "shore", name: "岸边的海浪", hint: "主岛与沙滩", icon: Waves },
    { id: "rain", name: "雨声", hint: "雨天出现", icon: CloudRain },
    { id: "wind", name: "风声", hint: "风天出现", icon: Wind },
    { id: "thunder", name: "雷声", hint: "雷雨时出现", icon: CloudLightning },
  ];
/** One-shot animal voices live outside the loop mixer; own little toggle. */
function VoiceToggle() {
  const [on, setOn] = useState(voicesEnabled);
  useEffect(() => onVoicesChanged(() => setOn(voicesEnabled())), []);
  return (
    <div className="sound-row">
      <PawPrint size={15} />
      <div>
        <strong>动物声</strong>
        <small>见面与被摸时会叫</small>
      </div>
      <button
        className={`small-button ${on ? "active" : ""}`}
        aria-pressed={on}
        aria-label={`${on ? "关闭" : "开启"}动物声`}
        onClick={() => setVoicesEnabled(!on)}
      >
        {on ? "关闭" : "开启"}
      </button>
    </div>
  );
}
export default function SoundMixer({
  audio,
}: {
  audio: ReturnType<typeof useAudio>;
}) {
  return (
    <>
      <div className="audio-row">
        <AudioLines size={20} />
        <div>
          <strong>环境声</strong>
          <small>海浪与天气 · 可同时叠加</small>
        </div>
        <button className="small-button" onClick={audio.masterButton}>
          {audio.audible ? (
            <>
              <Volume2 size={13} /> 全关
            </>
          ) : (
            "播放"
          )}
        </button>
      </div>
      <div className="sound-list">
        {sounds.map((s) => (
          <div className="sound-row" key={s.id}>
            <s.icon size={15} />
            <div>
              <strong>{s.name}</strong>
              <small>{s.hint}</small>
            </div>
            <button
              className={`small-button ${audio.on[s.id] ? "active" : ""}`}
              aria-pressed={audio.on[s.id]}
              aria-label={`${audio.on[s.id] ? "关闭" : "开启"}${s.name}`}
              disabled={audio.loading && !audio.on[s.id]}
              onClick={() => audio.toggle(s.id)}
            >
              {audio.on[s.id] ? "关闭" : "开启"}
            </button>
          </div>
        ))}
        <VoiceToggle />
      </div>
      <label className="slider-label" htmlFor="volume">
        <span>声音轻重</span>
        <span>{Math.round(audio.volume * 100)}%</span>
      </label>
      <input
        id="volume"
        type="range"
        min="0"
        max="1"
        step=".05"
        value={audio.volume}
        onChange={(e) => audio.setVolume(Number(e.target.value))}
      />
    </>
  );
}
