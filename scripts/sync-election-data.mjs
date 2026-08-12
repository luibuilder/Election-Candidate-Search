import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "data", "current-election.json");
const FALLBACK = path.join(ROOT, "config", "fallback-elections.json");
const API_KEY = process.env.DATA_GO_KR_API_KEY?.trim();
const API_ROOT = "https://apis.data.go.kr/9760000";
const TYPE_NAMES = {
  "1": "대통령선거", "2": "국회의원선거", "3": "시·도지사선거", "4": "구·시·군의장선거",
  "5": "시·도의회의원선거", "6": "구·시·군의회의원선거", "7": "비례대표국회의원선거",
  "8": "비례대표시·도의회의원선거", "9": "비례대표구·시·군의회의원선거", "10": "교육의원선거", "11": "교육감선거"
};

function itemsFrom(payload, operation) {
  const root = payload?.[operation] ?? payload?.response ?? payload;
  const possible = [root?.item, root?.items?.item, root?.body?.items?.item, root?.response?.body?.items?.item];
  const value = possible.find((item) => item !== undefined) ?? [];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function totalFrom(payload, operation, items) {
  const root = payload?.[operation] ?? payload?.response ?? payload;
  return Number(root?.totalCount ?? root?.body?.totalCount ?? root?.response?.body?.totalCount ?? items.length) || 0;
}

async function api(operation, pathname, params = {}) {
  const url = new URL(`${API_ROOT}/${pathname}/${operation}`);
  url.searchParams.set("serviceKey", API_KEY);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${operation}: JSON 응답이 아닙니다 (${text.slice(0, 80)})`); }
}

const toIsoDate = (sgId) => /^\d{8}$/.test(String(sgId))
  ? `${String(sgId).slice(0, 4)}-${String(sgId).slice(4, 6)}-${String(sgId).slice(6, 8)}`
  : null;

async function discoverElection(fallbacks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const payload = await api("getCommonSgCodeList", "CommonCodeService");
  const records = itemsFrom(payload, "getCommonSgCodeList");
  const future = records
    .map((item) => ({ id: String(item.sgId || item.sg_id || ""), name: item.sgName || item.sg_name, typeCode: String(item.sgTypecode || item.sg_typecode || "") }))
    .map((item) => ({ ...item, date: toIsoDate(item.id) }))
    .filter((item) => item.date && new Date(`${item.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!future.length) return null;
  const firstDate = future[0].date;
  const sameElection = future.filter((item) => item.date === firstDate);
  const fallback = fallbacks.find((item) => item.date === firstDate);
  return {
    id: sameElection[0].id,
    name: fallback?.name || sameElection.find((item) => item.name)?.name || `${firstDate} 실시 선거`,
    date: firstDate,
    typeCodes: [...new Set(sameElection.map((item) => item.typeCode).filter(Boolean))],
    description: fallback?.description || "중앙선거관리위원회 선거 코드에서 확인된 가장 가까운 선거입니다.",
    selection: "중앙선관위 선거 코드 자동 선택"
  };
}

function nextFallback(fallbacks) {
  const today = new Date().toISOString().slice(0, 10);
  const election = fallbacks.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!election) throw new Error("예정 선거 기본값을 추가해야 합니다.");
  return { ...election, selection: "법정 예정일 기본값" };
}

function normalizeCandidate(item, phase, typeCode) {
  const careers = [item.career1, item.career2].filter((value) => value && value !== "-");
  return {
    id: String(item.huboid || `${item.name}-${item.sggName}-${typeCode}`),
    electionType: TYPE_NAMES[typeCode] || typeCode,
    phase,
    number: item.gihoSangse ? `${item.giho || ""}${item.gihoSangse}` : item.giho || "",
    party: item.jdName || "",
    name: item.name || "성명 미상",
    hanjaName: item.hanjaName || "",
    gender: item.gender || "",
    birthday: item.birthday || "",
    age: item.age || "",
    region: item.sdName || "전국",
    district: item.sggName || item.wiwName || "",
    address: item.addr || "",
    job: item.job || "",
    education: item.edu || "",
    career1: careers[0] || "",
    career2: careers[1] || "",
    registeredAt: item.regdate || "",
    status: item.status || (phase === "registered" ? "등록" : "예비후보")
  };
}

async function collectCandidates(election) {
  const collected = [];
  const errors = [];
  for (const typeCode of election.typeCodes) {
    let registered = [];
    try {
      const operation = "getPofelcddRegistSttusInfoInqire";
      const payload = await api(operation, "PofelcddInfoInqireService", { sgId: election.id, sgTypecode: typeCode });
      const items = itemsFrom(payload, operation);
      if (totalFrom(payload, operation, items)) registered = items.map((item) => normalizeCandidate(item, "registered", typeCode));
    } catch (error) { errors.push(`${TYPE_NAMES[typeCode] || typeCode} 등록후보: ${error.message}`); }

    if (registered.length) {
      collected.push(...registered);
      continue;
    }
    try {
      const operation = "getPoelpcddRegistSttusInfoInqire";
      const payload = await api(operation, "PofelcddInfoInqireService", { sgId: election.id, sgTypecode: typeCode });
      const items = itemsFrom(payload, operation);
      if (totalFrom(payload, operation, items)) collected.push(...items.map((item) => normalizeCandidate(item, "preliminary", typeCode)));
    } catch (error) { errors.push(`${TYPE_NAMES[typeCode] || typeCode} 예비후보: ${error.message}`); }
  }
  const unique = [...new Map(collected.map((candidate) => [`${candidate.id}-${candidate.electionType}`, candidate])).values()];
  return { candidates: unique, errors };
}

async function main() {
  const fallbacks = JSON.parse(await readFile(FALLBACK, "utf8"));
  let election = nextFallback(fallbacks);
  let discoveryError = "";
  let candidates = [];
  let errors = [];

  if (API_KEY) {
    try { election = (await discoverElection(fallbacks)) || election; }
    catch (error) { discoveryError = error.message; }
    ({ candidates, errors } = await collectCandidates(election));
  }

  const registeredCount = candidates.filter((candidate) => candidate.phase === "registered").length;
  const preliminaryCount = candidates.filter((candidate) => candidate.phase === "preliminary").length;
  const dataPhase = registeredCount ? "registered" : preliminaryCount ? "preliminary" : "scheduled";
  const dataPhaseLabel = registeredCount ? "등록후보" : preliminaryCount ? "예비후보" : "선거 예정";
  const notice = !API_KEY
    ? "자동 수집 코드는 준비됐습니다. GitHub 비밀값 DATA_GO_KR_API_KEY를 등록하면 후보 공개 시 자동 반영됩니다."
    : candidates.length
      ? `중앙선관위 공개 데이터에서 ${dataPhaseLabel} ${candidates.length}명을 확인했습니다.${errors.length ? ` 일부 조회 ${errors.length}건은 실패했습니다.` : ""}`
      : `후보 정보가 아직 공개되지 않았습니다. 매일 자동으로 다시 확인합니다.${errors.length ? ` 일부 조회 ${errors.length}건은 실패했습니다.` : ""}`;

  let output = {
    updatedAt: new Date().toISOString(),
    election: { ...election, dataPhase, dataPhaseLabel },
    candidates,
    notice,
    source: {
      provider: "중앙선거관리위원회·공공데이터포털",
      apiKeyConfigured: Boolean(API_KEY),
      electionSelection: election.selection,
      candidateEndpoint: "PofelcddInfoInqireService",
      discoveryError,
      queryErrors: errors
    }
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  try {
    const previous = JSON.parse(await readFile(OUTPUT, "utf8"));
    const withoutTime = ({ updatedAt, ...value }) => value;
    if (JSON.stringify(withoutTime(previous)) === JSON.stringify(withoutTime(output))) {
      console.log(`${election.name}: 변경 없음, 후보 ${candidates.length}명 (${dataPhaseLabel})`);
      return;
    }
  } catch { /* 최초 생성 또는 기존 파일 손상 시 새로 기록 */ }
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`${election.name}: 데이터 변경, 후보 ${candidates.length}명 (${dataPhaseLabel})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
