/**
 * 종목마스터 보강 — 분석을 요청받은 시점에 해당 종목만 KIS로 채운다.
 *
 * DART 고유번호 파일에는 종목코드와 회사명뿐이라 시장구분·업종·시가총액이 없다.
 * 전종목을 미리 채우면 KIS 호출이 3,981회(유량 제한상 7분 이상) 필요한데,
 * 이 기능은 '신규 종목 발굴' 도구라 실제로 분석하는 종목은 소수다.
 * 따라서 요청받은 종목만 그때 보강한다.
 */

import admin from "firebase-admin";
import { fetchCurrentPrice } from "./clients/kis.js";

/**
 * 시장구분 판정.
 *
 * KIS의 `rprs_mrkt_kor_name`은 시장명이 아니라 '대표 지수명'을 반환한다.
 * 실측: 삼성전자 → "KOSPI200", 에코프로비엠 → "KSQ150".
 * 따라서 문자열 패턴으로 시장을 역산해야 한다.
 */
export function resolveMarket(rprsMarketName) {
    const name = String(rprsMarketName || "").toUpperCase();
    if (/KSQ|KOSDAQ|코스닥/.test(name)) return "KOSDAQ";
    if (/KONEX|코넥스/.test(name)) return "KONEX";
    if (/KOSPI|KRX|유가/.test(name)) return "KOSPI";
    return "UNKNOWN";
}

/**
 * Yahoo Finance 심볼 생성 — 기존 자산관리 기능이 Yahoo로 시세를 조회하므로
 * 종목코드만 입력해도 올바른 심볼이 만들어지도록 한다.
 */
export function toYahooSymbol(ticker, market) {
    if (market === "KOSPI") return `${ticker}.KS`;
    if (market === "KOSDAQ" || market === "KONEX") return `${ticker}.KQ`;
    return null; // 판정 실패 시 심볼을 만들지 않는다(잘못된 심볼로 조회하면 조용히 틀린 값이 온다)
}

// KIS는 모든 수치를 문자열로 반환한다 — 빈 문자열·null을 안전하게 숫자로 바꾼다
function num(value) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 현재가 응답에서 분석에 쓸 값만 추려 정규화한다.
 * 시가총액은 KIS가 '억원' 단위로 주므로 원 단위로 환산해 저장한다.
 */
export function normalizeQuote(output) {
    const marketCapEok = num(output.hts_avls);
    return {
        price: num(output.stck_prpr),
        marketCapKrw: marketCapEok === null ? null : marketCapEok * 100_000_000,
        shares: num(output.lstn_stcn),
        per: num(output.per),
        pbr: num(output.pbr),
        eps: num(output.eps),
        bps: num(output.bps),
        high52: num(output.w52_hgpr),
        low52: num(output.w52_lwpr),
        foreignRatio: num(output.hts_frgn_ehrt),
    };
}

/**
 * 실존하는 종목인지 판정한다.
 *
 * ⚠️ KIS는 존재하지 않는 종목코드에 오류를 반환하지 않는다. rt_cd='0'인 정상 응답에
 * 모든 수치가 0이고 업종명이 빈 문자열인 껍데기를 돌려준다(실측: 999999).
 * 이를 걸러내지 않으면 상장폐지 종목이 정상 종목으로 저장된다.
 *
 * 거래정지 종목은 마지막 가격과 상장주식수가 남아 있으므로 여기서 걸리지 않고,
 * flags(관리종목·경고)로 판정하는 것이 맞다.
 */
export function isValidQuote(quote) {
    return (quote.shares ?? 0) > 0 && (quote.price ?? 0) > 0;
}

/**
 * Red Flag 원천 코드 추출.
 *
 * 관리종목 판정은 `mang_issu_cls_code`(Y/N)가 정답이다.
 * `iscd_stat_cls_code`는 불리언이 아닌 분류값이라 보조 지표로만 남긴다.
 */
export function extractFlags(output) {
    const warnLevel = String(output.mrkt_warn_cls_code ?? "00");
    return {
        managed: output.mang_issu_cls_code === "Y", // 관리종목
        warnLevel, // 00=없음 01=투자주의 02=투자경고 03=투자위험
        warned: warnLevel !== "00",
        statusCode: String(output.iscd_stat_cls_code ?? ""),
        volatilityInterrupt: output.vi_cls_code === "Y",
    };
}

/**
 * 종목 하나를 보강해 stock_master 문서에 병합 저장한다.
 *
 * 조회에 실패하면(상장폐지·거래불가 등) 예외를 던지지 않고 `tradable: false`로 표시한다.
 * DART 파일에는 상폐 이력 종목이 남아 있어 3,981건 중 일부는 실제 거래가 불가능하다.
 */
export async function enrichStock(db, credentials, ticker) {
    const ref = db.collection("stock_master").doc(ticker);

    let output;
    try {
        output = await fetchCurrentPrice(credentials, ticker);
    } catch (error) {
        await ref.set(
            {
                tradable: false,
                enrichError: error.message,
                enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
        );
        return { ticker, tradable: false, error: error.message };
    }

    const quote = normalizeQuote(output);

    // 존재하지 않는 종목코드는 오류 대신 값이 0인 껍데기 응답으로 오므로 여기서 걸러낸다
    if (!isValidQuote(quote)) {
        await ref.set(
            {
                tradable: false,
                enrichError: "실존하지 않거나 거래 불가한 종목 (시세·상장주식수 없음)",
                enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
        );
        return { ticker, tradable: false, error: "실존하지 않거나 거래 불가한 종목" };
    }

    const market = resolveMarket(output.rprs_mrkt_kor_name);
    if (market === "UNKNOWN") {
        console.warn(`시장구분 판정 실패 — ${ticker} rprs_mrkt_kor_name="${output.rprs_mrkt_kor_name}"`);
    }

    const enriched = {
        market,
        marketRaw: output.rprs_mrkt_kor_name || null,
        yahooSymbol: toYahooSymbol(ticker, market),
        sector: output.bstp_kor_isnm || null,
        tradable: true,
        enrichError: admin.firestore.FieldValue.delete(), // 이전 실패 기록 제거
        quote,
        flags: extractFlags(output),
        enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(enriched, { merge: true });
    return { ticker, ...enriched };
}

/**
 * 보강이 필요한지 판단한다.
 *
 * 시세는 매일 바뀌므로 하루가 지나면 다시 받고, 시장구분·업종처럼 거의 변하지 않는 값은
 * 한 번 채워지면 유지된다(같은 호출로 함께 갱신되므로 별도 처리는 불필요).
 */
export function needsEnrichment(doc, maxAgeHours = 24) {
    if (!doc || !doc.enrichedAt || !doc.market) return true;
    const enrichedAt = doc.enrichedAt.toMillis ? doc.enrichedAt.toMillis() : Number(doc.enrichedAt);
    return Date.now() - enrichedAt > maxAgeHours * 3600 * 1000;
}
