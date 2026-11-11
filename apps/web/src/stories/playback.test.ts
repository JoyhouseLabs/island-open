import { expect, test } from "vitest";
import { sampleStory, storyDraftSchema, storyIssues } from "@island/contracts";
import {
  chooseStory,
  restoreStoryRun,
  startStory,
  storyRunKey,
} from "./playback";
test("both sample routes reach distinct endings without changing the draft", () => {
  const draft = sampleStory(),
    run = startStory(draft),
    choice = chooseStory(run, 0);
  expect(chooseStory(choice, 0).path.at(-1)).toBe("mountain_end");
  expect(chooseStory(choice, 1).path.at(-1)).toBe("garden_end");
  draft.nodes[0]!.text = "edited";
  expect(run.story.nodes[0]!.text).not.toBe("edited");
  expect(run.path).toEqual(["start"]);
});
test("dangling links, duplicate nodes, loops and unreachable cards block playback", () => {
  const missing = sampleStory();
  missing.nodes[0]!.choices[0]!.next = "missing";
  expect(() => startStory(missing)).toThrow();
  const cycle = sampleStory();
  cycle.nodes[1]!.choices[0]!.next = "start";
  expect(storyIssues(cycle).join()).toContain("循环");
  const orphan = sampleStory();
  orphan.nodes.push({ ...orphan.nodes[3]!, id: "orphan" });
  expect(storyIssues(orphan).join()).toContain("无法从开场");
  const duplicate = sampleStory();
  duplicate.nodes.push(duplicate.nodes[0]!);
  expect(storyIssues(duplicate).join()).toContain("编号重复");
});
test("speaker, choice counts and empty content are validated before preview", () => {
  const story = sampleStory();
  story.nodes[0]!.speaker = "fox";
  story.nodes[1]!.choices = [];
  story.nodes[3]!.text = " ";
  expect(storyIssues(story).length).toBeGreaterThanOrEqual(3);
  expect(() => startStory(story)).toThrow();
});
test("restoring a run validates each transition instead of trusting saved paths", () => {
  const run = chooseStory(chooseStory(startStory(sampleStory()), 0), 1);
  expect(restoreStoryRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
  expect(() =>
    restoreStoryRun({ ...run, path: ["start", "garden_end"] }),
  ).toThrow();
  expect(() => restoreStoryRun({ ...run, path: [] })).toThrow();
  expect(() => chooseStory(run, 0)).toThrow();
  expect(() => chooseStory(startStory(sampleStory()), -1)).toThrow();
  expect(storyRunKey("a")).not.toBe(storyRunKey("b"));
});
test("import schema rejects executable actions, unknown scenes and oversized stories", () => {
  const story = sampleStory();
  expect(
    storyDraftSchema.safeParse({ ...story, script: "alert(1)" }).success,
  ).toBe(false);
  expect(
    storyDraftSchema.safeParse({
      ...story,
      nodes: [{ ...story.nodes[0], scene: "https://evil.example" }],
    }).success,
  ).toBe(false);
  expect(
    storyDraftSchema.safeParse({
      ...story,
      nodes: Array(25).fill(story.nodes[0]),
    }).success,
  ).toBe(false);
});
