# Election Candidate Search

중앙선거관리위원회 공개 데이터를 이용해 가장 가까운 선거와 후보자를 자동 표시하는 GitHub Pages 사이트입니다.

## 동작 방식

1. GitHub Actions가 하루 네 번 중앙선관위 선거 코드 목록을 조회합니다.
2. 오늘 이후 선거 중 날짜가 가장 가까운 선거를 선택합니다.
3. 선거 종류별 정식 등록 후보를 조회합니다.
4. 정식 후보가 아직 없으면 예비후보를 조회합니다.
5. 결과를 `data/current-election.json`으로 저장합니다.
6. 이전 결과와 실제 내용이 달라진 경우에만 커밋하고 GitHub Pages를 다시 배포합니다.

API가 새 선거 코드를 아직 제공하지 않거나 일시적으로 실패할 경우 `config/fallback-elections.json`의 가장 가까운 예정 선거를 사용합니다. 이전 선거가 지나면 그다음 미래 선거가 자동 선택됩니다.

## 최초 1회 설정

1. [공공데이터포털 후보자 정보 API](https://www.data.go.kr/data/15000908/openapi.do) 활용 신청
2. [공공데이터포털 코드 정보 API](https://www.data.go.kr/data/15000897/openapi.do) 활용 신청
3. GitHub 저장소에서 `Settings → Secrets and variables → Actions → New repository secret` 선택
4. 이름을 `DATA_GO_KR_API_KEY`로 지정하고 공공데이터포털 일반 인증키(Decoding)를 값으로 저장
5. `Actions → Sync election data → Run workflow`를 한 번 실행

인증키는 저장소 코드나 브라우저에 노출되지 않고 GitHub Actions 안에서만 사용됩니다.

## 자동 갱신 일정

워크플로는 매일 4회(한국시간 약 09:17, 15:17, 21:17, 03:17) 실행됩니다. GitHub 예약 작업은 혼잡도에 따라 다소 늦게 시작될 수 있습니다.

## 로컬 확인

```bash
npm run check
npm run sync
```

로컬에서 실제 API 조회까지 시험하려면 환경변수 `DATA_GO_KR_API_KEY`를 설정한 뒤 `npm run sync`를 실행합니다. 비밀키가 없으면 예정 선거 기본값으로 안전하게 생성합니다.

## 데이터 주의사항

- 예비후보는 정식 후보가 아닙니다.
- 후보등록 개시 후에는 선관위 API 특성상 예비후보 조회가 중단되고 정식 후보 데이터로 전환됩니다.
- 사퇴·사망·등록무효 상태가 응답에 포함되면 그대로 표시합니다.
- 모든 정보는 중앙선거관리위원회 원문으로 최종 확인해야 합니다.
