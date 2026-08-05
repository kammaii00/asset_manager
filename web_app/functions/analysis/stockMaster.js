/**
 * 종목마스터 적재 — DART 고유번호(corp_code) ↔ 종목코드(stock_code) 매핑
 *
 * DART는 종목코드가 아니라 8자리 고유번호로 조회하므로, 이 매핑이 없으면 재무제표를 한 건도 가져올 수 없다.
 * 분석 파이프라인 전체가 이 컬렉션에 의존하는 최초 선행 작업이다.
 *
 * 신규 상장·사명 변경을 반영하기 위해 매월 1회 갱신한다.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { fetchCorpCodeZip } from "./clients/dart.js";

const dartApiKey = defineSecret("DART_API_KEY");

// Firestore 배치 쓰기 상한 (한 배치에 500개 문서까지)
const BATCH_LIMIT = 500;

/**
 * 검색용 정규화 문자열 생성 — 자동완성에서 "삼성 전자", "SK하이닉스"를 모두 잡기 위함.
 * 공백·점·괄호를 제거하고 소문자로 통일한다.
 */
function normalizeName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[\s.,()·]/g, "");
}

/**
 * CORPCODE.xml 원문을 파싱해 '상장사만' 추린다.
 *
 * 전체 법인은 10만 건이 넘지만 stock_code가 있는 상장사는 2,700여 곳뿐이다.
 * 비상장 법인까지 적재하면 Firestore 문서 수와 검색 품질만 나빠진다.
 */
export function parseListedCorps(xmlText) {
    // parseTagValue: false 가 반드시 필요하다.
    // 기본값(true)이면 종목코드 "005930"이 숫자 5930으로, 고유번호 "00126380"이 126380으로
    // 변환되어 앞자리 0이 날아간다. 문자열로 강제해야 한다.
    const parser = new XMLParser({ parseTagValue: false, trimValues: true });
    const parsed = parser.parse(xmlText);

    const rows = parsed?.result?.list;
    if (!rows) {
        throw new Error("CORPCODE.xml 구조가 예상과 다릅니다 (result.list 없음)");
    }

    // 법인이 1곳뿐이면 배열이 아니라 객체로 오는 XML 파서 특성 대응
    const list = Array.isArray(rows) ? rows : [rows];

    return list
        .map((row) => ({
            corpCode: String(row.corp_code || "").trim(),
            corpName: String(row.corp_name || "").trim(),
            // 비상장 법인은 공백 문자열이 들어온다
            ticker: String(row.stock_code || "").trim(),
            modifyDate: String(row.modify_date || "").trim(),
        }))
        .filter((row) => row.ticker.length === 6 && row.corpCode.length === 8);
}

/**
 * 상장사 목록을 stock_master 컬렉션에 병합 저장한다.
 *
 * merge:true 로 쓰기 때문에 이후 단계(KIS)에서 채워 넣을 market·sector 같은 필드는 보존된다.
 * 문서 ID는 종목코드(ticker) — 분석 파이프라인 전체가 종목코드를 키로 쓴다.
 */
export async function saveStockMaster(db, corps) {
    let written = 0;

    for (let offset = 0; offset < corps.length; offset += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = corps.slice(offset, offset + BATCH_LIMIT);

        for (const corp of chunk) {
            const ref = db.collection("stock_master").doc(corp.ticker);
            batch.set(
                ref,
                {
                    ticker: corp.ticker,
                    corpCode: corp.corpCode,
                    name: corp.corpName,
                    searchName: normalizeName(corp.corpName),
                    dartModifyDate: corp.modifyDate,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
            );
        }

        await batch.commit();
        written += chunk.length;
    }

    return written;
}

/**
 * 적재 파이프라인 본체 — 다운로드 → 압축 해제 → 파싱 → 저장.
 * 스케줄 함수와 테스트에서 공통으로 호출한다.
 */
export async function syncStockMaster(apiKey) {
    const db = admin.firestore();

    const zipBuffer = await fetchCorpCodeZip(apiKey);

    // ZIP 안에 CORPCODE.xml 한 개가 들어 있다. 이름이 바뀔 가능성에 대비해 확장자로 찾는다.
    const entry = new AdmZip(zipBuffer)
        .getEntries()
        .find((item) => item.entryName.toLowerCase().endsWith(".xml"));

    if (!entry) {
        throw new Error("ZIP 안에서 XML 파일을 찾지 못했습니다");
    }

    const corps = parseListedCorps(entry.getData().toString("utf8"));
    if (corps.length === 0) {
        throw new Error("상장사가 0건으로 파싱되었습니다 — XML 구조 변경 가능성");
    }

    const written = await saveStockMaster(db, corps);
    return { parsed: corps.length, written };
}

/**
 * 매월 1일 04시(KST) 종목마스터 갱신.
 *
 * 최초 1회는 GCP 콘솔 > Cloud Scheduler 에서 이 작업을 '지금 실행'으로 수동 트리거한다
 * (HTTP 엔드포인트를 열지 않기 위해 수동 실행 경로를 별도로 만들지 않았다).
 */
export const syncStockMasterMonthly = onSchedule(
    {
        schedule: "0 4 1 * *",
        timeZone: "Asia/Seoul",
        secrets: [dartApiKey],
        memory: "1GiB", // 압축 해제된 XML이 20MB 내외 — 파싱 시 여유 필요
        timeoutSeconds: 540,
    },
    async () => {
        const result = await syncStockMaster(dartApiKey.value());
        console.log(`종목마스터 갱신 완료 — 파싱 ${result.parsed}건, 저장 ${result.written}건`);
    },
);
