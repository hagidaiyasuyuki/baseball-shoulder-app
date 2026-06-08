const STORAGE_KEY = "baseballShoulderRecords";

const form = document.querySelector("#assessmentForm");
const scoreValue = document.querySelector("#scoreValue");
const riskLabel = document.querySelector("#riskLabel");
const scoreCard = document.querySelector("#scoreCard");
const adviceList = document.querySelector("#adviceList");
const heroSummary = document.querySelector("#heroSummary");
const statusDot = document.querySelector(".status-dot");
const historyList = document.querySelector("#historyList");
const resetButton = document.querySelector("#resetButton");
const exportButton = document.querySelector("#exportButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");

const ORTHO_TESTS = [
  { key: "CAT", label: "CAT" },
  { key: "HFT", label: "HFT" },
  { key: "OB", label: "O'B" },
  { key: "Hawkins", label: "Hawkins" },
  { key: "HERT", label: "HERT" },
  { key: "ISPt", label: "ISP-t" },
  { key: "bellyPress", label: "belly press" },
  { key: "liftOff", label: "lift off" },
];

const SCAP_FUNCTION_TESTS = [
  { key: "EBP", label: "EBP" },
  { key: "midTrap", label: "僧帽筋中部" },
  { key: "lowTrap", label: "僧帽筋下部" },
];

const SCAP_ALIGNMENT_TESTS = [
  { key: "elevation", label: "挙上/下制" },
  { key: "abduction", label: "外転/内転" },
  { key: "rotation", label: "上方回旋/下方回旋" },
  { key: "tilt", label: "前傾/後傾" },
];

document.querySelector("#recordDate").valueAsDate = new Date();

const rangeInputs = [...document.querySelectorAll('input[type="range"]')];
rangeInputs.forEach((input) => {
  input.addEventListener("input", () => {
    updateRangeLabel(input);
    updateAssessment();
  });
});

form.addEventListener("input", updateAssessment);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const assessment = buildAssessment();
  const records = loadRecords();
  records.unshift({
    ...assessment,
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 50)));
  renderHistory();
});

resetButton.addEventListener("click", () => {
  form.reset();
  document.querySelector("#recordDate").valueAsDate = new Date();
  rangeInputs.forEach((input) => {
    updateRangeLabel(input);
  });
  updateAssessment();
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

exportButton.addEventListener("click", () => {
  const records = loadRecords();
  if (!records.length) return;

  const headers = [
    "記録日",
    "選手名",
    "カテゴリ",
    "ポジション",
    "スコア",
    "リスク",
    "安静時痛",
    "投球時痛",
    "翌日痛",
    "重だるさ",
    "痛む部位",
    "投球フェーズ",
    "整形外科テスト",
    "肩甲骨機能評価",
    "肩甲骨アライメント",
    "腹斜筋左",
    "腹斜筋右",
    "トランクローテーション",
    "広背筋テスト",
    "危険サイン",
    "メモ",
  ];
  const rows = records.map((record) => [
    record.recordDate,
    record.playerName,
    record.category,
    record.position,
    record.score,
    record.risk,
    record.restPain,
    record.throwPain,
    record.nextDayPain,
    record.fatigue,
    record.painAreas.join(" / "),
    record.phases.join(" / "),
    formatOrthoTests(record.orthoTests),
    formatNamedResults(record.scapFunction),
    formatNamedResults(record.scapAlignment),
    record.trunk?.obliqueLeft || "",
    record.trunk?.obliqueRight || "",
    record.trunk ? `${record.trunk.trunkRotation}°` : "",
    record.trunk ? `${record.trunk.latTest}°` : "",
    record.redFlags.join(" / "),
    record.memo,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "baseball-shoulder-records.csv";
  link.click();
  URL.revokeObjectURL(url);
});

function buildAssessment() {
  const data = new FormData(form);
  const values = {
    playerName: data.get("playerName") || "未入力",
    recordDate: data.get("recordDate"),
    category: data.get("category"),
    position: data.get("position"),
    restPain: Number(data.get("restPain")),
    throwPain: Number(data.get("throwPain")),
    nextDayPain: Number(data.get("nextDayPain")),
    fatigue: Number(data.get("fatigue")),
    raiseDifficulty: data.get("raiseDifficulty"),
    performanceDrop: data.get("performanceDrop"),
    orthoTests: getOrthoTests(data),
    scapFunction: getNamedResults(data, SCAP_FUNCTION_TESTS, "scapFunction"),
    scapAlignment: getNamedResults(data, SCAP_ALIGNMENT_TESTS, "scapAlignment"),
    trunk: {
      obliqueLeft: data.get("trunk_obliqueLeft"),
      obliqueRight: data.get("trunk_obliqueRight"),
      trunkRotation: Number(data.get("trunkRotation")),
      latTest: Number(data.get("latTest")),
    },
    painAreas: data.getAll("painArea"),
    phases: data.getAll("phase"),
    redFlags: data.getAll("redFlag"),
    memo: data.get("memo") || "",
  };

  const score = calculateScore(values);

  return {
    ...values,
    score,
    risk: getRisk(score, values.redFlags.length),
    advice: getAdvice(values, score),
  };
}

function calculateScore(values) {
  const functionScore = scoreSelect(values.raiseDifficulty) + scoreSelect(values.performanceDrop);
  const orthoScore = values.orthoTests.reduce((total, test) => total + scoreOrthoTest(test.result), 0);
  const scapFunctionScore = values.scapFunction.reduce((total, test) => total + scoreFunctionResult(test.result), 0);
  const scapAlignmentScore = values.scapAlignment.reduce((total, test) => total + scoreAlignmentResult(test.result), 0);
  const trunkScore =
    scoreFunctionResult(values.trunk.obliqueLeft) +
    scoreFunctionResult(values.trunk.obliqueRight) +
    scoreRangeLimit(values.trunk.trunkRotation, 90, 70) +
    scoreRangeLimit(values.trunk.latTest, 65, 50);
  const redFlagScore = values.redFlags.length * 18;
  return Math.min(
    100,
    values.restPain * 5 +
      values.throwPain * 7 +
      values.nextDayPain * 5 +
      values.fatigue * 3 +
      functionScore +
      orthoScore +
      scapFunctionScore +
      scapAlignmentScore +
      trunkScore +
      redFlagScore
  );
}

function scoreSelect(value) {
  if (value === "明らかにある") return 16;
  if (value === "少しある") return 8;
  return 0;
}

function getOrthoTests(data) {
  return ORTHO_TESTS.map((test) => ({
    label: test.label,
    result: data.get(`orthoTest_${test.key}`) || "未実施",
  }));
}

function getNamedResults(data, tests, prefix) {
  return tests.map((test) => ({
    label: test.label,
    result: data.get(`${prefix}_${test.key}`) || "未実施",
  }));
}

function scoreOrthoTest(result) {
  if (result === "陽性") return 6;
  if (result === "疼痛のみ") return 3;
  return 0;
}

function scoreFunctionResult(result) {
  if (result === "低下") return 5;
  if (result === "疼痛あり") return 4;
  return 0;
}

function scoreAlignmentResult(result) {
  if (!result || result === "正常" || result === "判定困難") return 0;
  return 3;
}

function scoreRangeLimit(value, mildLimit, markedLimit) {
  if (value < markedLimit) return 6;
  if (value < mildLimit) return 3;
  return 0;
}

function formatOrthoTests(tests = []) {
  return tests
    .filter((test) => test.result && test.result !== "未実施")
    .map((test) => `${test.label}:${test.result}`)
    .join(" / ");
}

function formatNamedResults(tests = []) {
  return tests
    .filter((test) => test.result && test.result !== "未実施" && test.result !== "正常")
    .map((test) => `${test.label}:${test.result}`)
    .join(" / ");
}

function getRisk(score, redFlagCount) {
  if (redFlagCount > 0 || score >= 65) return "高リスク";
  if (score >= 35) return "注意";
  return "低リスク";
}

function getAdvice(values, score) {
  const advice = [];

  if (values.redFlags.length) {
    advice.push("危険サインがあります。投球を中止し、整形外科やスポーツ医療の専門家へ相談してください。");
  }
  if (values.throwPain >= 5 || values.nextDayPain >= 5) {
    advice.push("投球時痛または翌日痛が中等度以上です。投球量を落とし、痛みが下がるまで全力投球は避けてください。");
  }
  if (values.restPain >= 3) {
    advice.push("安静時にも痛みがあります。練習継続の判断は慎重にし、早めの相談を検討してください。");
  }
  if (values.raiseDifficulty !== "なし") {
    advice.push("肩の上げにくさが記録されています。可動域、肩甲骨の動き、痛みの出る角度を継続して確認しましょう。");
  }
  if (values.performanceDrop !== "なし") {
    advice.push("球速・出力低下があります。痛みをかばったフォーム変化や疲労の蓄積も確認してください。");
  }
  const positiveTests = values.orthoTests.filter((test) => test.result === "陽性");
  const painfulTests = values.orthoTests.filter((test) => test.result === "疼痛のみ");
  if (positiveTests.length) {
    advice.push(`整形外科テスト陽性: ${positiveTests.map((test) => test.label).join("、")}。所見として記録し、痛みや可動域と合わせて確認してください。`);
  }
  if (painfulTests.length) {
    advice.push(`疼痛のみのテスト: ${painfulTests.map((test) => test.label).join("、")}。再現痛の部位と強さをメモに残すと経過比較しやすくなります。`);
  }
  const scapFunctionFindings = values.scapFunction.filter((test) => test.result === "低下" || test.result === "疼痛あり");
  const scapAlignmentFindings = values.scapAlignment.filter((test) => test.result !== "正常" && test.result !== "判定困難");
  if (scapFunctionFindings.length) {
    advice.push(`肩甲骨機能所見: ${formatNamedResults(scapFunctionFindings)}。投球時の肩甲骨制御と疲労で変化するかを追跡しましょう。`);
  }
  if (scapAlignmentFindings.length) {
    advice.push(`肩甲骨アライメント所見: ${formatNamedResults(scapAlignmentFindings)}。左右差、安静時と挙上時の変化を合わせて記録すると比較しやすくなります。`);
  }
  if (values.trunk.obliqueLeft === "低下" || values.trunk.obliqueRight === "低下") {
    advice.push(`腹斜筋機能低下: 左 ${values.trunk.obliqueLeft} / 右 ${values.trunk.obliqueRight}。左右差と投球側への回旋制御を確認してください。`);
  }
  if (values.trunk.trunkRotation < 90 || values.trunk.latTest < 65) {
    advice.push(`体幹・広背筋の可動性: トランクローテーション ${values.trunk.trunkRotation}°、広背筋テスト ${values.trunk.latTest}°。肩だけでなく胸郭・体幹の制限も経過記録に含めましょう。`);
  }
  if (values.phases.includes("トップ") || values.phases.includes("加速期")) {
    advice.push("トップから加速期の痛みは肩への負荷が高い場面です。フォーム、肩甲骨、胸郭、股関節の連動も記録対象にすると役立ちます。");
  }
  if (score < 35 && !values.redFlags.length) {
    advice.push("現時点の入力では低リスクです。痛みが増える、翌日に残る、出力が落ちる場合は投球量を調整してください。");
  }

  return advice;
}

function updateAssessment() {
  const assessment = buildAssessment();
  scoreValue.textContent = assessment.score;
  riskLabel.textContent = assessment.risk;
  heroSummary.textContent = `${assessment.risk}: スコア ${assessment.score}`;

  scoreCard.className = "score-card";
  statusDot.className = "status-dot";
  if (assessment.risk === "高リスク") {
    scoreCard.classList.add("high");
    statusDot.classList.add("danger");
  } else if (assessment.risk === "注意") {
    scoreCard.classList.add("middle");
    statusDot.classList.add("warn");
  } else {
    scoreCard.classList.add("low");
    statusDot.classList.add("ok");
  }

  adviceList.innerHTML = assessment.advice.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function updateRangeLabel(input) {
  const label = document.querySelector(`[data-for="${input.id}"]`);
  const suffix = input.id === "trunkRotation" || input.id === "latTest" ? "°" : "";
  label.textContent = `${input.value}${suffix}`;
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const records = loadRecords();
  if (!records.length) {
    historyList.innerHTML = '<p class="empty">保存された記録はありません。</p>';
    return;
  }

  historyList.innerHTML = records
    .map(
      (record) => `
        <article class="history-item">
          <strong>${escapeHtml(record.recordDate || "")} ${escapeHtml(record.playerName)}</strong>
          <small>${escapeHtml(record.risk)} / スコア ${record.score} / 投球時痛 ${record.throwPain} / ${escapeHtml(formatHistoryFindings(record))}</small>
        </article>
      `
    )
    .join("");
}

function formatHistoryFindings(record) {
  const findings = [
    formatOrthoTests(record.orthoTests),
    formatNamedResults(record.scapFunction),
    formatNamedResults(record.scapAlignment),
  ].filter(Boolean);

  if (record.trunk) {
    findings.push(`TrRot:${record.trunk.trunkRotation}° Lat:${record.trunk.latTest}°`);
  }

  return findings.join(" / ") || "追加評価記録なし";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateAssessment();
renderHistory();
