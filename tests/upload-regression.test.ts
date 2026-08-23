import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contextSource = readFileSync(
  new URL("../src/features/project/project-session-context.tsx", import.meta.url),
  "utf8",
);
const dropzoneSource = readFileSync(
  new URL("../src/components/upload-dropzone.tsx", import.meta.url),
  "utf8",
);

test("legacy project sessions get safe Phase 4 story defaults", () => {
  assert.match(
    contextSource,
    /useState<StoryCandidate\[\]>\(\[\]\)/,
    "storyCandidates must default to an empty collection",
  );
  assert.match(
    contextSource,
    /useState<string \| null>\(null\)/,
    "selectedStoryCandidateId must default to null",
  );
});

test("local ingestion remains independent from Phase 4 network work", () => {
  const addFilesStart = contextSource.indexOf("const addFiles");
  const removeAssetStart = contextSource.indexOf("const removeAsset", addFilesStart);
  const addFilesSource = contextSource.slice(addFilesStart, removeAssetStart);

  assert.ok(addFilesStart >= 0 && removeAssetStart > addFilesStart);
  assert.match(addFilesSource, /URL\.createObjectURL\(file\)/);
  assert.match(addFilesSource, /setAssets\(\(current\) => \[\.\.\.current, \.\.\.createdAssets\]\)/);
  assert.match(addFilesSource, /processAsset\(asset\.id\)/);
  assert.doesNotMatch(addFilesSource, /fetch\(|discoverStories|analyzeOne/);
});

test("click selection and drag-and-drop use the same multi-file ingestion callback", () => {
  assert.match(dropzoneSource, /type="file"/);
  assert.match(dropzoneSource, /accept="video\/mp4,video\/quicktime,video\/webm,\.mp4,\.mov,\.webm"/);
  assert.match(dropzoneSource, /multiple/);
  assert.match(dropzoneSource, /onChange=\{\(event\) => \{ onFiles\(Array\.from\(event\.target\.files \?\? \[\]\)\)/);
  assert.match(dropzoneSource, /onDragOver=\{\(event\) => \{ event\.preventDefault\(\)/);
  assert.match(dropzoneSource, /onDrop=\{\(event\) => \{ event\.preventDefault\(\);[\s\S]*onFiles\(Array\.from\(event\.dataTransfer\.files\)\)/);
});

test("visible upload surface explicitly opens the hidden file input", () => {
  assert.match(dropzoneSource, /className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"/);
});
