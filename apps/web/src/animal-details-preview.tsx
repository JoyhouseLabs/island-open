import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Species } from "@island/contracts";
import { speciesProfiles } from "@island/contracts";
import AnimalDetails from "./animals/AnimalDetails";
import { animalDetails } from "./animals/detailsStore";
import { reportAgent } from "./animals/registry";
import DialogueBox from "./dialogue/DialogueBox";
import { dialogue } from "./dialogue/store";
import "./styles.css";
const scope = "animal-details-local-preview";
function choose(species: Species, name: string) {
  dialogue.close();
  const id = `preview-${species}`;
  animalDetails.bind(scope);
  const agent = { kind: species, name, x: 0, z: 0, action: "none" };
  reportAgent(id, agent);
  animalDetails.select({ id, species, name, scene: "preview", prefer: speciesProfiles[species].ecology.prefer,
    pet: () => { reportAgent(id, { ...agent, action: "pet" }); } });
}
function App() {
  useEffect(() => { choose("vaporeon", "水伊布"); }, []);
  return <main style={{ minHeight: "100dvh", padding: "48px 28px", boxSizing: "border-box", background: "linear-gradient(145deg,#f6f8ec,#dbe7d1)", color: "#355043" }}>
    <section style={{ maxWidth: "min(450px, calc(100vw - 48px))" }}>
      <p style={{ letterSpacing: 3, fontSize: 12 }}>伙伴档案 · 本地交互预览</p>
      <h1>认识岛上的朋友</h1>
      <p>选一个伙伴，看看属性、能力与对话记录。点击“说说话”体验日常对话，再点回这个伙伴查看记录。</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "24px 0" }}>
        {([["vaporeon", "水伊布"], ["cat", "方方"], ["panda", "团团"], ["giraffe", "高高"]] as const).map(([species, name]) => <button className="small-button" key={species} onClick={() => choose(species, name)}>{name}</button>)}
      </div>
      <p style={{ fontSize: 13 }}>这是独立演示，不连接岛上存档。刷新会清空演示对话；五行、八字与模型训练数据尚未配置。</p>
    </section>
    <AnimalDetails scope={scope} />
    <DialogueBox />
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
