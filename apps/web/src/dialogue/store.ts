import { useSyncExternalStore } from "react";
import type { NearSpeaker } from "./proximity";
import { greeting, replyTo, type DialogueNode, type SpeakerKind } from "./scripts";
import { intelligenceStatus } from "../contentStore";
import { personaFor, type SpeakerPersona } from "../animals/personas";

type OpenDialogue = {
  speaker: NearSpeaker;
  node: DialogueNode;
  /** Reply text when the player just picked a choice (two-step reveal). */
  pending: string | null;
};
type NpcChat = SpeakerPersona & {
  /** Registry agent id of the speaker, so animals keep facing them. */
  speakerId: string;
};
/** Quick-phrase chat with another player (visitor agents). */
type PlayerChatState = { id: string; name: string } | null;

class DialogueStore {
  open: OpenDialogue | null = null;
  npc: NpcChat | null = null;
  playerChat: PlayerChatState = null;
  private tutorHandler: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  /** Warmed once per session: deep chat needs a configured backend LLM. */
  private llmOn = false;
  constructor() {
    void intelligenceStatus().then((s) => {
      this.llmOn = s.npc;
    });
  }
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getVersion = () => this.version;
  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Library registers this so 空格 near 小墨老师 opens the lesson chat. */
  onTutor(handler: (() => void) | null) {
    this.tutorHandler = handler;
  }

  requestTalk(speaker: NearSpeaker) {
    if (this.open || this.npc || this.playerChat) return;
    if (speaker.kind === "tutor") {
      this.tutorHandler?.();
      return;
    }
    if (speaker.kind === "visitor") {
      // Another player: quick phrases and emotes instead of NPC scripts.
      this.playerChat = {
        id: speaker.id,
        name: speaker.name ?? "朋友",
      };
      this.bump();
      return;
    }
    const node = greeting(speaker.kind as SpeakerKind, speaker.name ?? "朋友");
    // Anything with a persona — admin animals, built-in species, residents,
    // talking signs — offers the LLM deep chat.
    const persona = personaFor(speaker.id);
    if (persona && this.llmOn)
      node.choices = [...(node.choices ?? []), { label: "再多聊聊" }];
    this.open = { speaker, node, pending: null };
    this.bump();
  }

  choose(label: string) {
    if (!this.open) return;
    if (label === "再多聊聊") {
      const persona = personaFor(this.open.speaker.id);
      if (persona) {
        this.npc = {
          ...persona,
          name: this.open.speaker.name ?? persona.name,
          speakerId: this.open.speaker.id,
        };
        this.open = null;
        this.bump();
        return;
      }
    }
    const { close, reply } = replyTo(this.open.speaker.kind as SpeakerKind, label);
    if (close) {
      this.open = null;
    } else {
      this.open = { ...this.open, node: { text: reply ?? "……" }, pending: null };
    }
    this.bump();
  }

  /** After a reply, return to the greeting choices for another round. */
  continueTalking() {
    if (!this.open) return;
    this.open = {
      speaker: this.open.speaker,
      node: greeting(
        this.open.speaker.kind as SpeakerKind,
        this.open.speaker.name ?? "朋友",
      ),
      pending: null,
    };
    this.bump();
  }

  /** Opens the deep chat directly. The physics rooms have no scripted
   *  greeting stage; they click (or walk up to) a resident instead. */
  openDeepChat(persona: SpeakerPersona) {
    if (this.open || this.npc || this.playerChat) return;
    this.npc = { ...persona, speakerId: persona.subject };
    this.bump();
  }

  /** Is the player in any kind of conversation with one agent — script
   *  dialogue or the deep chat that follows? Animals freeze while true. */
  talkingWith(id: string) {
    return this.open?.speaker.id === id || this.npc?.speakerId === id;
  }

  close() {
    if (!this.open) return;
    this.open = null;
    this.bump();
  }

  closeNpc() {
    if (!this.npc) return;
    this.npc = null;
    this.bump();
  }

  closePlayerChat() {
    if (!this.playerChat) return;
    this.playerChat = null;
    this.bump();
  }
}

export const dialogue = new DialogueStore();

export function useDialogue() {
  useSyncExternalStore(dialogue.subscribe, dialogue.getVersion);
  return dialogue.open;
}

export function useNpcChat() {
  useSyncExternalStore(dialogue.subscribe, dialogue.getVersion);
  return dialogue.npc;
}

export function usePlayerChat() {
  useSyncExternalStore(dialogue.subscribe, dialogue.getVersion);
  return dialogue.playerChat;
}
