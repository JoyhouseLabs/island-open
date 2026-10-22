import {
  setVoicePref,
  useVoicePrefs,
  type VoicePrefs,
} from "./voicePrefs";

const ITEMS: Array<{ key: keyof VoicePrefs; label: string }> = [
  { key: "autoSend", label: "听懂后自动发送" },
  { key: "autoListen", label: "读完自动听我说" },
  { key: "autoTts", label: "自动朗读回复" },
  { key: "scriptTts", label: "对话字幕也朗读" },
];

/** The four voice-automation checkboxes, shared by the dialogue panels. */
export function VoicePrefsPanel() {
  const prefs = useVoicePrefs();
  return (
    <div className="voice-prefs-panel" role="group" aria-label="语音设置">
      {ITEMS.map((item) => (
        <label key={item.key}>
          <input
            type="checkbox"
            checked={prefs[item.key]}
            onChange={(e) => setVoicePref(item.key, e.target.checked)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}
