const $ = (selector) => document.querySelector(selector);
const state = { data: null, query: "", region: "", status: "" };

const formatDate = (value, withWeekday = false) => {
  if (!value) return "미정";
  const date = new Date(`${value}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    ...(withWeekday ? { weekday: "long" } : {})
  }).format(date);
};

const safe = (value, fallback = "공개 정보 없음") => String(value || "").trim() || fallback;

function renderHeader(data) {
  const election = data.election;
  const date = election.date ? new Date(`${election.date}T00:00:00+09:00`) : null;
  const diff = date ? Math.ceil((date - new Date()) / 86400000) : null;
  $("#data-phase").textContent = election.dataPhaseLabel || "예정 선거";
  $("#election-title").textContent = election.name;
  $("#election-description").textContent = election.description || "가장 가까운 선거를 자동으로 표시합니다.";
  $("#election-date").textContent = `선거일 ${formatDate(election.date, true)}`;
  $("#countdown").textContent = diff === null ? "일정 확정 대기" : diff > 0 ? `D-${diff}` : diff === 0 ? "오늘" : "선거 종료";
  $("#candidate-count").textContent = `후보 ${data.candidates.length}명`;
  $("#date-year").textContent = date ? `${date.getFullYear()}년` : "일정";
  $("#date-month-day").textContent = date ? `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}` : "미정";
  $("#date-weekday").textContent = date ? new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(date) : "공식 발표 대기";
  $("#updated-at").textContent = data.updatedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(data.updatedAt)) : "확인 기록 없음";

  const notice = $("#notice");
  notice.classList.toggle("warning", !data.source.apiKeyConfigured || data.candidates.length === 0);
  $("#notice-text").textContent = data.notice;
}

function fillFilters(candidates) {
  const regions = [...new Set(candidates.map((c) => c.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const statuses = [...new Set(candidates.map((c) => c.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  for (const [element, values] of [[$("#region-filter"), regions], [$("#status-filter"), statuses]]) {
    values.forEach((value) => element.add(new Option(value, value)));
  }
}

function renderCandidates() {
  const normalized = state.query.trim().toLocaleLowerCase("ko");
  const candidates = state.data.candidates.filter((candidate) => {
    const haystack = Object.values(candidate).join(" ").toLocaleLowerCase("ko");
    return (!normalized || haystack.includes(normalized)) && (!state.region || candidate.region === state.region) && (!state.status || candidate.status === state.status);
  });

  const grid = $("#candidate-grid");
  grid.replaceChildren();
  $("#result-count").textContent = `${candidates.length}명을 표시합니다`;
  $("#empty-state").hidden = candidates.length > 0;
  $("#empty-title").textContent = state.data.candidates.length ? "검색 결과가 없습니다" : "후보 등록을 기다리고 있습니다";
  $("#empty-description").textContent = state.data.candidates.length ? "검색어나 필터를 바꿔보세요." : "선관위에 예비후보 또는 후보 정보가 공개되면 자동으로 나타납니다.";

  for (const candidate of candidates) {
    const card = $("#candidate-template").content.cloneNode(true);
    card.querySelector(".candidate-number").textContent = candidate.number || "—";
    card.querySelector(".candidate-party").textContent = safe(candidate.party, "소속 정당 미표기");
    card.querySelector(".candidate-name").textContent = candidate.name;
    const status = card.querySelector(".candidate-status");
    status.textContent = candidate.status || state.data.election.dataPhaseLabel;
    status.classList.toggle("withdrawn", ["사퇴", "사망", "등록무효"].includes(candidate.status));
    card.querySelector('[data-field="district"]').textContent = [candidate.region, candidate.district].filter(Boolean).join(" · ") || "전국";
    card.querySelector('[data-field="job"]').textContent = safe(candidate.job);
    card.querySelector('[data-field="education"]').textContent = safe(candidate.education);
    card.querySelector('[data-field="career"]').textContent = [candidate.career1, candidate.career2].filter(Boolean).join(" / ") || "공개 정보 없음";
    card.querySelector('[data-field="personal"]').textContent = [candidate.gender, candidate.age ? `${candidate.age}세` : "", candidate.birthday].filter(Boolean).join(" · ");
    card.querySelector('[data-field="address"]').textContent = candidate.address ? `주소: ${candidate.address}` : "주소: 공개 정보 없음";
    card.querySelector('[data-field="registered"]').textContent = candidate.registeredAt ? `등록일: ${candidate.registeredAt}` : "";
    const toggle = card.querySelector(".detail-toggle");
    const details = card.querySelector(".candidate-details");
    toggle.addEventListener("click", () => {
      details.hidden = !details.hidden;
      toggle.setAttribute("aria-expanded", String(!details.hidden));
      toggle.textContent = details.hidden ? "상세 정보 보기" : "상세 정보 닫기";
    });
    grid.append(card);
  }
}

async function init() {
  try {
    const response = await fetch(`data/current-election.json?v=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    renderHeader(state.data);
    fillFilters(state.data.candidates);
    renderCandidates();
  } catch (error) {
    $("#notice").classList.add("warning");
    $("#notice-text").textContent = "자동 생성 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.";
    $("#election-title").textContent = "데이터 연결을 확인해 주세요";
    $("#empty-state").hidden = false;
    console.error(error);
  }
}

$("#search").addEventListener("input", (event) => { state.query = event.target.value; renderCandidates(); });
$("#region-filter").addEventListener("change", (event) => { state.region = event.target.value; renderCandidates(); });
$("#status-filter").addEventListener("change", (event) => { state.status = event.target.value; renderCandidates(); });
init();
