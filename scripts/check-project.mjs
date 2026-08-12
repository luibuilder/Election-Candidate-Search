import { access, readFile } from "node:fs/promises";

const required = ["index.html", "assets/style.css", "assets/app.js", "data/current-election.json", ".github/workflows/sync-election-data.yml"];
for (const file of required) await access(file);
const data = JSON.parse(await readFile("data/current-election.json", "utf8"));
if (!data.election?.name || !data.election?.date || !Array.isArray(data.candidates)) throw new Error("current-election.json 형식이 올바르지 않습니다.");
const html = await readFile("index.html", "utf8");
for (const id of ["election-title", "candidate-grid", "candidate-template"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`index.html에 #${id}가 없습니다.`);
}
console.log(`검증 완료: ${data.election.name}, 후보 ${data.candidates.length}명`);
