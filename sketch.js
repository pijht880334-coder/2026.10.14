// ============================================================
// 營養知識四選一測驗：Google Sheets 題庫版
// 本檔案搭配 index.html 與 p5.js 1.11.1 使用。
// ============================================================

// ------------------------------
// 一、可修改的 Google Sheets 題庫設定
// ------------------------------

// 請把下方提示文字替換成 Google Sheets 發布為 CSV 的網址。
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQjGIoZ6d3gXDDOEkNJrISb5edIINr0G-uQ_HVjPvWbc7Nbzy7xm-vuunHo2G7BvBE1ZzpiGBAfBgBz/pub?gid=1590805800&single=true&output=csv`;

// Google Sheets CSV URL 格式範例：
// https://docs.google.com/spreadsheets/d/試算表ID/gviz/tq?tqx=out:csv&sheet=工作表名稱
// 使用前請先在 Google Sheets 選擇「檔案」→「共用」→「發布到網路」，格式選擇 CSV。
// 試算表第一列欄位必須完全使用：question, choiceA, choiceB, choiceC, choiceD, answer
// answer 欄位只能填 A、B、C 或 D；網站會從完整題庫隨機抽出不重複的 5 題。

// ------------------------------
// 二、視覺與測驗常數
// ------------------------------

// 集中管理顏色，方便日後調整整體視覺風格。
const COLORS = {
  background: `#e9edc9`,
  // 題目卡片專用背景色；drawQuestionCard 會直接使用此常數。
  questionCard: `#fde2e4`,
  // 選項未作答、按鈕文字與結果卡片維持原本的淺色。
  surface: `#fefae0`,
  optionDefault: `#fefae0`,
  correct: `#ccd5ae`,
  wrong: `#d4a373`,
  dark: `#344e41`,
  medium: `#52796f`,
  shadow: `rgba(52, 78, 65, 0.16)`,
  pale: `rgba(254, 250, 224, 0.78)`
};

// 每次測驗固定五題，每題 20 分，答對三題即為 60 分及格。
const TOTAL_QUESTIONS = 5;
const POINTS_PER_QUESTION = 20;
const PASSING_QUESTIONS = 3;
const ANSWER_LETTERS = [`A`, `B`, `C`, `D`];
const DEFAULT_URL_TEXT = `請貼上你的 Google Sheets CSV 網址`;

// ------------------------------
// 三、全域狀態
// ------------------------------

// 題庫載入後的完整資料，以及本輪隨機抽出的五題。
let questionBank = [];
let questions = [];
let loadState = `loading`; // 可為 config、loading、error、ready。
let loadErrorMessage = ``;

// 目前題目與作答狀態。
let currentQuestion = 0;
let correctCount = 0;
let selectedIndex = -1;
let hasAnswered = false;
let quizFinished = false;
let animationTime = 0;

// 所有互動矩形都由版面計算函式產生，確保繪圖與點擊範圍一致。
let optionRects = [];
let actionButton = { x: 0, y: 0, width: 0, height: 0 };
let layout = {};

// 結果頁動畫物件。
let fireworks = [];
let encouragementParticles = [];
let resultEffectMode = ``;
let resultEffectStartedAt = 0;
let lastFireworkLaunch = 0;
let lastEncouragementSpawn = 0;

// 觸控後瀏覽器可能再送出 mousePressed，以時間鎖避免一次操作被計算兩次。
let ignoreMouseUntil = 0;

// ------------------------------
// 四、p5.js 初始化與視窗調整
// ------------------------------

// 建立全螢幕畫布，並依網址狀態決定是否開始讀取題庫。
function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style(`display`, `block`);
  canvas.elt.style.touchAction = `none`;

  // 由程式補上基礎頁面樣式，讓直接放入 p5.js 專案也能正常顯示。
  document.body.style.margin = `0`;
  document.body.style.overflow = `hidden`;
  document.body.style.background = COLORS.background;
  document.body.style.fontFamily = `"LXGW WenKai TC", "Playwrite AR Guides", sans-serif`;

  textFont(`LXGW WenKai TC`);
  textAlign(CENTER, CENTER);

  // 預設提示文字不可拿去呼叫 loadTable，避免送出無效網址。
  if (isPlaceholderUrl(GOOGLE_SHEET_CSV_URL)) {
    loadState = `config`;
    loadErrorMessage = `請先設定 Google Sheets 題庫網址`;
  } else {
    beginQuestionBankLoad();
  }
}

// 視窗尺寸改變或手機旋轉時，立即重算版面與互動範圍。
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (loadState !== `ready`) {
    return;
  }

  if (quizFinished) {
    calculateResultLayout();
  } else {
    calculateQuizLayout();
  }
}

// ------------------------------
// 五、Google Sheets CSV 載入與驗證
// ------------------------------

// 判斷網址是否仍是最上方提供的預設提示文字。
function isPlaceholderUrl(url) {
  const normalizedUrl = String(url || ``).trim();
  return normalizedUrl.length === 0 || normalizedUrl === DEFAULT_URL_TEXT;
}

// 依需求使用 p5.js loadTable 的 CSV header 讀取模式。
function beginQuestionBankLoad() {
  if (isPlaceholderUrl(GOOGLE_SHEET_CSV_URL)) {
    loadState = `config`;
    loadErrorMessage = `請先設定 Google Sheets 題庫網址`;
    return;
  }

  loadState = `loading`;
  loadErrorMessage = ``;

  // 第三個參數 header 會把第一列當作欄位名稱。
  loadTable(
    GOOGLE_SHEET_CSV_URL,
    `csv`,
    `header`,
    handleQuestionTableLoaded,
    handleQuestionTableLoadError
  );
}

// 將 Google Sheets 每一列轉成內部題目格式，並檢查欄位與資料完整性。
function handleQuestionTableLoaded(table) {
  try {
    const requiredColumns = [`question`, `choiceA`, `choiceB`, `choiceC`, `choiceD`, `answer`];
    const answerIndexes = { A: 0, B: 1, C: 2, D: 3 };
    const availableColumns = table.columns || [];

    for (let i = 0; i < requiredColumns.length; i += 1) {
      if (!availableColumns.includes(requiredColumns[i])) {
        throw new Error(`缺少必要欄位：${requiredColumns[i]}`);
      }
    }

    const parsedQuestions = [];
    for (let rowIndex = 0; rowIndex < table.getRowCount(); rowIndex += 1) {
      const row = table.getRow(rowIndex);
      const questionText = row.getString(`question`).trim();
      const choices = [
        row.getString(`choiceA`).trim(),
        row.getString(`choiceB`).trim(),
        row.getString(`choiceC`).trim(),
        row.getString(`choiceD`).trim()
      ];
      const answerLetter = row.getString(`answer`).trim().toUpperCase();

      // 空白列視為無效資料，避免題目畫面出現空選項。
      const hasEmptyValue = questionText.length === 0 || choices.some((choice) => choice.length === 0);
      if (hasEmptyValue || answerIndexes[answerLetter] === undefined) {
        throw new Error(`第 ${rowIndex + 2} 列資料不完整，answer 必須是 A、B、C 或 D`);
      }

      parsedQuestions.push({
        question: questionText,
        choices,
        answer: answerIndexes[answerLetter]
      });
    }

    if (parsedQuestions.length < TOTAL_QUESTIONS) {
      throw new Error(`題庫至少需要 ${TOTAL_QUESTIONS} 題，目前只有 ${parsedQuestions.length} 題`);
    }

    questionBank = parsedQuestions;
    loadState = `ready`;
    startNewQuiz();
  } catch (error) {
    handleQuestionTableLoadError(error);
  }
}

// 顯示載入失敗狀態；使用者修正網址或試算表後可按鈕重試。
function handleQuestionTableLoadError(error) {
  loadState = `error`;
  loadErrorMessage = error && error.message
    ? error.message
    : `無法讀取 Google Sheets CSV，請確認網址、發布狀態與欄位格式`;
  calculateStatusButton();
}

// ------------------------------
// 六、主繪圖流程與狀態畫面
// ------------------------------

// p5.js 每一幀執行，負責更新畫面與動畫。
function draw() {
  background(COLORS.background);
  animationTime += 1;

  if (loadState === `config`) {
    drawConfigurationScreen();
  } else if (loadState === `loading`) {
    drawLoadingScreen();
  } else if (loadState === `error`) {
    drawLoadErrorScreen();
  } else if (quizFinished) {
    drawResultScreen();
  } else {
    drawQuizScreen();
  }
}

// 尚未設定 URL 時明確顯示指定訊息，且不會進入 loadTable。
function drawConfigurationScreen() {
  const titleSize = clampValue(min(width * 0.075, height * 0.09), 22, 38);
  const bodySize = clampValue(min(width * 0.045, height * 0.05), 15, 22);
  const messageWidth = min(width - 36, 700);

  textAlign(CENTER, CENTER);
  fill(COLORS.dark);
  textStyle(BOLD);
  textSize(titleSize);
  text(`營養知識小測驗`, width / 2, height * 0.32);

  fill(COLORS.medium);
  textStyle(NORMAL);
  textSize(bodySize);
  text(`請先設定 Google Sheets 題庫網址`, width / 2, height * 0.47, messageWidth, 60);
  textSize(clampValue(bodySize * 0.78, 13, 17));
  text(`請到 sketch.js 最上方修改 GOOGLE_SHEET_CSV_URL`, width / 2, height * 0.57, messageWidth, 60);
}

// 題庫讀取中畫面。
function drawLoadingScreen() {
  const pulse = 1 + sin(animationTime * 0.08) * 0.04;
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill(COLORS.dark);
  textSize(clampValue(min(width * 0.07, height * 0.09) * pulse, 22, 36));
  text(`正在載入題庫⋯⋯`, width / 2, height * 0.44);
  textStyle(NORMAL);
  fill(COLORS.medium);
  textSize(clampValue(min(width * 0.04, height * 0.045), 14, 19));
  text(`正在從 Google Sheets 取得題目，請稍候`, width / 2, height * 0.54);
}

// 題庫載入失敗畫面。
function drawLoadErrorScreen() {
  const messageWidth = min(width - 36, 700);
  const titleSize = clampValue(min(width * 0.065, height * 0.08), 20, 32);
  const bodySize = clampValue(min(width * 0.042, height * 0.045), 14, 19);

  calculateStatusButton();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill(COLORS.dark);
  textSize(titleSize);
  text(`題庫載入失敗`, width / 2, height * 0.27);

  textStyle(NORMAL);
  fill(COLORS.wrong);
  textSize(bodySize);
  textWrap(CHAR);
  text(loadErrorMessage, width / 2, height * 0.43, messageWidth, 110);
  drawActionButton(`重新載入題庫`);
}

// 計算狀態頁重試按鈕的位置。
function calculateStatusButton() {
  const buttonWidth = min(260, width - 36);
  const buttonHeight = clampValue(height * 0.07, 46, 56);
  actionButton = {
    x: (width - buttonWidth) / 2,
    y: min(height * 0.66, height - buttonHeight - 22),
    width: buttonWidth,
    height: buttonHeight
  };
}

// ------------------------------
// 七、響應式版面工具
// ------------------------------

// 將數值限制在指定範圍內，避免極端視窗導致元件失控。
function clampValue(value, minimum, maximum) {
  return min(maximum, max(minimum, value));
}

// 估算中文文字在指定寬度需要幾行。
function countWrappedLines(content, availableWidth, fontSize) {
  textSize(fontSize);
  const characters = Array.from(String(content));
  let line = ``;
  let lineCount = 1;

  for (let i = 0; i < characters.length; i += 1) {
    const nextLine = line + characters[i];
    if (line.length > 0 && textWidth(nextLine) > availableWidth) {
      lineCount += 1;
      line = characters[i];
    } else {
      line = nextLine;
    }
  }
  return max(1, lineCount);
}

// 計算測驗頁的題目卡片、選項與按鈕位置。
function calculateQuizLayout() {
  if (!questions[currentQuestion]) {
    return;
  }

  const viewportWidth = max(1, width);
  const viewportHeight = max(1, height);
  const isLandscape = viewportWidth > viewportHeight * 1.12;
  const isCompactHeight = viewportHeight < 520;
  const isSmallPhone = viewportWidth < 520;
  const sideMargin = clampValue(viewportWidth * 0.045, 12, 64);
  const contentWidth = min(viewportWidth - sideMargin * 2, 920);
  const contentX = (viewportWidth - contentWidth) / 2;

  const titleSize = isCompactHeight
    ? clampValue(min(viewportWidth * 0.055, viewportHeight * 0.105), 18, 28)
    : clampValue(min(viewportWidth * 0.06, viewportHeight * 0.085), 22, 36);
  const subtitleSize = clampValue(titleSize * 0.46, 11, 16);
  const titleY = (isCompactHeight ? 8 : 14) + titleSize * 0.5;
  const subtitleY = titleY + titleSize * 0.78;
  const progressHeight = clampValue(viewportHeight * 0.018, 6, 10);
  const progressY = subtitleY + subtitleSize * 0.63;
  const headerBottom = progressY + progressHeight;

  // 寬螢幕使用兩欄，手機直向使用單欄，方便閱讀與觸控。
  const columns = viewportWidth >= 600 || isLandscape ? 2 : 1;
  const rows = columns === 2 ? 2 : 4;
  const optionGap = isCompactHeight
    ? clampValue(viewportWidth * 0.018, 7, 11)
    : clampValue(viewportWidth * 0.02, 10, 18);
  const optionWidth = (contentWidth - optionGap * (columns - 1)) / columns;

  let questionFontSize = isCompactHeight
    ? clampValue(min(contentWidth * 0.035, viewportHeight * 0.065), 14, 21)
    : clampValue(min(contentWidth * 0.038, viewportHeight * 0.052), 17, 28);
  const questionPadding = isCompactHeight ? 11 : 16;
  const questionTextWidth = contentWidth - questionPadding * 2;
  let questionLines = countWrappedLines(questions[currentQuestion].question, questionTextWidth, questionFontSize);
  let questionHeight = max(
    isCompactHeight ? 58 : (isSmallPhone ? 82 : 96),
    questionLines * questionFontSize * 1.35 + questionPadding * 2
  );

  const optionFontSize = columns === 1
    ? clampValue(min(contentWidth * 0.052, viewportHeight * 0.037), 15, 20)
    : clampValue(min(optionWidth * 0.07, viewportHeight * 0.039), 15, 19);
  const labelDiameter = isCompactHeight ? 27 : 32;
  const optionTextLeft = labelDiameter + (isCompactHeight ? 19 : 24);
  const optionTextWidth = max(40, optionWidth - optionTextLeft - (isCompactHeight ? 11 : 16));
  const optionLineHeight = optionFontSize * 1.3;
  const maxChoiceLines = questions[currentQuestion].choices.reduce(
    (largest, choice) => max(largest, countWrappedLines(choice, optionTextWidth, optionFontSize)),
    1
  );
  const desiredOptionHeight = max(
    isCompactHeight ? 42 : (isSmallPhone ? 54 : 64),
    maxChoiceLines * optionLineHeight + (isCompactHeight ? 16 : 24)
  );

  const buttonHeight = isCompactHeight ? 42 : clampValue(viewportHeight * 0.06, 48, 58);
  const buttonGap = isCompactHeight ? 8 : 14;
  const bottomMargin = isCompactHeight ? 10 : 18;
  const questionY = headerBottom + (isCompactHeight ? 7 : 14);
  const minimumOptionHeight = isCompactHeight ? 38 : (isSmallPhone ? 50 : 60);
  const minimumReservedHeight = rows * minimumOptionHeight + optionGap * (rows - 1) + buttonGap + buttonHeight + bottomMargin;

  // 高度不足時優先縮小題目字級，保留所有選項與操作按鈕。
  while (questionY + questionHeight + 8 + minimumReservedHeight > viewportHeight && questionFontSize > 13) {
    questionFontSize -= 1;
    questionLines = countWrappedLines(questions[currentQuestion].question, questionTextWidth, questionFontSize);
    questionHeight = max(isCompactHeight ? 52 : 72, questionLines * questionFontSize * 1.35 + questionPadding * 2);
  }

  const optionsY = questionY + questionHeight + (isCompactHeight ? 8 : 16);
  const availableOptionsHeight = max(
    rows * minimumOptionHeight,
    viewportHeight - optionsY - buttonHeight - buttonGap - bottomMargin
  );
  const availableOptionHeight = (availableOptionsHeight - optionGap * (rows - 1)) / rows;
  const optionHeight = max(34, min(desiredOptionHeight, availableOptionHeight));

  optionRects = [];
  for (let i = 0; i < 4; i += 1) {
    const column = columns === 2 ? i % 2 : 0;
    const row = columns === 2 ? floor(i / 2) : i;
    optionRects.push({
      x: contentX + column * (optionWidth + optionGap),
      y: optionsY + row * (optionHeight + optionGap),
      width: optionWidth,
      height: optionHeight
    });
  }

  const actionWidth = min(250, contentWidth);
  const lastOption = optionRects[optionRects.length - 1];
  const preferredButtonY = lastOption.y + lastOption.height + buttonGap;
  actionButton = {
    x: (viewportWidth - actionWidth) / 2,
    y: min(preferredButtonY, viewportHeight - buttonHeight - bottomMargin),
    width: actionWidth,
    height: buttonHeight
  };

  layout = {
    contentX,
    contentWidth,
    titleSize,
    subtitleSize,
    titleY,
    subtitleY,
    progressY,
    progressHeight,
    questionY,
    questionHeight,
    questionPadding,
    questionFontSize,
    questionTextWidth,
    optionFontSize,
    optionLineHeight,
    labelDiameter,
    optionTextLeft,
    optionGap,
    isCompactHeight
  };
}

// ------------------------------
// 八、測驗頁繪製
// ------------------------------

// 繪製測驗標題、題數與進度條。
function drawQuizHeader() {
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  fill(COLORS.dark);
  textSize(layout.titleSize);
  text(`營養知識小測驗`, width / 2, layout.titleY);

  textStyle(NORMAL);
  fill(COLORS.medium);
  textSize(layout.subtitleSize);
  text(`第 ${currentQuestion + 1} 題／共 ${TOTAL_QUESTIONS} 題`, width / 2, layout.subtitleY);

  const progressWidth = min(layout.contentWidth * 0.58, 460);
  const progressX = (width - progressWidth) / 2;
  noStroke();
  fill(`rgba(82, 121, 111, 0.22)`);
  rect(progressX, layout.progressY, progressWidth, layout.progressHeight, 8);
  fill(COLORS.medium);
  rect(progressX, layout.progressY, progressWidth * ((currentQuestion + 1) / TOTAL_QUESTIONS), layout.progressHeight, 8);
}

// 繪製單題測驗畫面。
function drawQuizScreen() {
  calculateQuizLayout();
  const current = questions[currentQuestion];
  drawQuizHeader();
  drawQuestionCard(current);

  for (let i = 0; i < current.choices.length; i += 1) {
    drawOption(current, i);
  }

  if (hasAnswered) {
    drawActionButton(currentQuestion === TOTAL_QUESTIONS - 1 ? `查看結果` : `下一題`);
  }
}

// 題目卡片明確使用 COLORS.questionCard，與選項底色形成區隔。
function drawQuestionCard(current) {
  noStroke();
  fill(COLORS.shadow);
  rect(layout.contentX + 3, layout.questionY + 5, layout.contentWidth, layout.questionHeight, 18);

  // 題目方框固定使用獨立的 COLORS.questionCard。
  fill(COLORS.questionCard);
  rect(layout.contentX, layout.questionY, layout.contentWidth, layout.questionHeight, 18);

  fill(COLORS.dark);
  textStyle(BOLD);
  textSize(layout.questionFontSize);
  textWrap(CHAR);
  text(
    current.question,
    layout.contentX + layout.questionPadding,
    layout.questionY + layout.questionPadding,
    layout.questionTextWidth,
    layout.questionHeight - layout.questionPadding * 2
  );
  textStyle(NORMAL);
}

// 繪製選項，並在作答後套用指定顏色與移動動畫。
function drawOption(current, index) {
  const rectInfo = optionRects[index];
  // 未作答選項維持原本的淺色，不與題目卡片共用顏色。
  let optionColor = COLORS.optionDefault;
  let offsetX = 0;
  let offsetY = 0;

  if (hasAnswered) {
    // 答對的使用者選項上下跳動。
    if (index === current.answer && selectedIndex === current.answer) {
      optionColor = COLORS.correct;
      offsetY = sin(animationTime * 0.18) * 7;
    }

    // 答錯的使用者選項左右移動。
    if (index === selectedIndex && selectedIndex !== current.answer) {
      optionColor = COLORS.wrong;
      offsetX = sin(animationTime * 0.28) * 8;
    }

    // 答錯時，正確答案也顯示為綠色並上下跳動。
    if (index === current.answer && selectedIndex !== current.answer) {
      optionColor = COLORS.correct;
      offsetY = sin(animationTime * 0.18) * 7;
    }
  }

  const drawX = rectInfo.x + offsetX;
  const drawY = rectInfo.y + offsetY;
  const labelDiameter = layout.labelDiameter;
  const labelX = drawX + (layout.isCompactHeight ? 18 : 24) + labelDiameter / 2;
  const labelY = drawY + rectInfo.height / 2;

  noStroke();
  fill(COLORS.shadow);
  rect(drawX + 3, drawY + 5, rectInfo.width, rectInfo.height, 14);
  fill(optionColor);
  rect(drawX, drawY, rectInfo.width, rectInfo.height, 14);

  fill(COLORS.medium);
  circle(labelX, labelY, labelDiameter);
  fill(COLORS.surface);
  textStyle(BOLD);
  textSize(labelDiameter * 0.5);
  text(ANSWER_LETTERS[index], labelX, labelY + 1);

  fill(COLORS.dark);
  textStyle(NORMAL);
  textSize(layout.optionFontSize);
  textWrap(CHAR);
  text(
    current.choices[index],
    drawX + layout.optionTextLeft,
    drawY + (layout.isCompactHeight ? 8 : 12),
    rectInfo.width - layout.optionTextLeft - (layout.isCompactHeight ? 11 : 16),
    rectInfo.height - (layout.isCompactHeight ? 16 : 24)
  );
}

// 繪製下一題、查看結果、重新載入或再測驗一次按鈕。
function drawActionButton(label) {
  noStroke();
  fill(COLORS.shadow);
  rect(actionButton.x + 3, actionButton.y + 5, actionButton.width, actionButton.height, 14);
  fill(COLORS.dark);
  rect(actionButton.x, actionButton.y, actionButton.width, actionButton.height, 14);

  fill(COLORS.surface);
  textStyle(BOLD);
  textSize(clampValue(actionButton.height * 0.36, 15, 20));
  textAlign(CENTER, CENTER);
  text(label, actionButton.x + actionButton.width / 2, actionButton.y + actionButton.height / 2);
  textStyle(NORMAL);
}

// ------------------------------
// 九、結果頁與成績特效
// ------------------------------

// 計算結果頁卡片與按鈕位置。
function calculateResultLayout() {
  const margin = clampValue(width * 0.045, 18, 64);
  const compact = height < 500;
  const cardWidth = min(560, width - margin * 2);
  const cardHeight = compact ? min(245, height * 0.58) : min(330, height * 0.52);
  const titleSize = compact
    ? clampValue(min(width * 0.08, height * 0.12), 24, 34)
    : clampValue(min(width * 0.09, height * 0.1), 30, 44);
  const cardY = compact ? height * 0.19 : height * 0.27;
  const buttonHeight = compact ? 42 : clampValue(height * 0.06, 48, 58);
  const buttonWidth = min(250, width - margin * 2);

  layout = {
    resultCardWidth: cardWidth,
    resultCardHeight: cardHeight,
    resultCardX: (width - cardWidth) / 2,
    resultCardY: cardY,
    resultTitleSize: titleSize,
    resultCompact: compact
  };
  actionButton = {
    x: (width - buttonWidth) / 2,
    y: min(cardY + cardHeight + (compact ? 12 : 24), height - buttonHeight - (compact ? 10 : 18)),
    width: buttonWidth,
    height: buttonHeight
  };
}

// 根據成績選擇煙火或鼓勵特效。
function startResultEffects() {
  const nextMode = correctCount >= PASSING_QUESTIONS ? `fireworks` : `encouragement`;
  if (resultEffectMode === nextMode && resultEffectStartedAt > 0) {
    return;
  }
  resultEffectMode = nextMode;
  resultEffectStartedAt = millis();
  lastFireworkLaunch = 0;
  lastEncouragementSpawn = 0;
  fireworks = [];
  encouragementParticles = [];
}

// 繪製結果頁，答對三題即顯示 60 分及格。
function drawResultScreen() {
  calculateResultLayout();
  startResultEffects();

  if (resultEffectMode === `fireworks`) {
    updateAndDrawFireworks();
  } else {
    updateAndDrawEncouragement();
  }

  textStyle(BOLD);
  fill(COLORS.dark);
  textSize(layout.resultTitleSize);
  textAlign(CENTER, CENTER);
  text(`測驗完成！`, width / 2, layout.resultCardY * 0.55);

  const cardX = layout.resultCardX;
  const cardY = layout.resultCardY;
  const cardWidth = layout.resultCardWidth;
  const cardHeight = layout.resultCardHeight;

  noStroke();
  fill(COLORS.shadow);
  rect(cardX + 4, cardY + 6, cardWidth, cardHeight, 22);
  fill(COLORS.surface);
  rect(cardX, cardY, cardWidth, cardHeight, 22);

  fill(COLORS.medium);
  textStyle(NORMAL);
  textSize(layout.resultCompact ? 17 : 24);
  text(`答對題數：${correctCount}／${TOTAL_QUESTIONS} 題`, width / 2, cardY + cardHeight * 0.23);

  const finalScore = correctCount * POINTS_PER_QUESTION;
  fill(COLORS.dark);
  textStyle(BOLD);
  textSize(layout.resultCompact ? 48 : 72);
  text(`${finalScore} 分`, width / 2, cardY + cardHeight * 0.5);

  const passed = correctCount >= PASSING_QUESTIONS;
  const resultMessage = passed
    ? `恭喜及格！繼續保持，你是營養小達人！`
    : `加油！再試一次！多複習營養知識就會更進步！`;
  fill(passed ? COLORS.medium : COLORS.wrong);
  textStyle(BOLD);
  textSize(layout.resultCompact ? 14 : 19);
  textWrap(CHAR);
  text(resultMessage, cardX + 18, cardY + cardHeight * 0.68, cardWidth - 36, cardHeight * 0.22);
  drawActionButton(`再測驗一次`);
}

// 建立煙火火箭。
function createFireworkRocket() {
  const scale = clampValue(min(width, height) / 700, 0.65, 1.35);
  return {
    x: random(width * 0.12, width * 0.88),
    y: height + 12,
    vx: random(-0.45, 0.45) * scale,
    vy: random(-10.5, -8.2) * scale,
    targetY: random(height * 0.17, height * 0.53),
    hueColor: random([`#f94144`, `#f9c74f`, `#43aa8b`, `#577590`, `#f9844a`, `#b388eb`])
  };
}

// 讓火箭在目標高度爆炸成多彩粒子。
function explodeFirework(rocket) {
  const scale = clampValue(min(width, height) / 700, 0.65, 1.35);
  const particleCount = floor(clampValue(min(width, height) * 0.09, 30, 58));
  for (let i = 0; i < particleCount; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(1.8, 5.8) * scale;
    fireworks.push({
      type: `particle`,
      x: rocket.x,
      y: rocket.y,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      gravity: 0.055 * scale,
      alpha: 255,
      decay: random(2.2, 4.2),
      size: random(2.2, 5.2) * scale,
      colorValue: color(rocket.hueColor)
    });
  }
}

// 更新煙火火箭與爆炸粒子。
function updateAndDrawFireworks() {
  const now = millis();
  const scale = clampValue(min(width, height) / 700, 0.65, 1.35);

  if (now - lastFireworkLaunch > 620 || fireworks.length === 0) {
    fireworks.push({ type: `rocket`, ...createFireworkRocket() });
    lastFireworkLaunch = now;
  }

  for (let i = fireworks.length - 1; i >= 0; i -= 1) {
    const item = fireworks[i];
    if (item.type === `rocket`) {
      item.x += item.vx;
      item.y += item.vy;
      item.vy += 0.075 * scale;
      stroke(255, 235, 180, 180);
      strokeWeight(clampValue(2 * scale, 1, 3));
      line(item.x, item.y + 9, item.x - item.vx * 4, item.y + 22);
      if (item.y <= item.targetY) {
        explodeFirework(item);
        fireworks.splice(i, 1);
      }
    } else {
      item.x += item.vx;
      item.y += item.vy;
      item.vy += item.gravity;
      item.vx *= 0.992;
      item.alpha -= item.decay;
      const particleColor = color(item.colorValue);
      particleColor.setAlpha(max(0, item.alpha));
      noStroke();
      fill(particleColor);
      circle(item.x, item.y, item.size);
      if (item.alpha <= 2 || item.y > height + 30) {
        fireworks.splice(i, 1);
      }
    }
  }
  noStroke();
}

// 建立未及格時向上漂浮的鼓勵粒子。
function createEncouragementParticle() {
  const scale = clampValue(min(width, height) / 700, 0.65, 1.35);
  return {
    x: random(width * 0.08, width * 0.92),
    y: height + random(8, 40),
    vx: random(-0.35, 0.35) * scale,
    vy: random(-1.5, -0.65) * scale,
    alpha: random(150, 235),
    decay: random(0.45, 1.15),
    size: random(3, 8) * scale,
    colorValue: color(random([`#f4a261`, `#e76f51`, `#e9c46a`, `#2a9d8f`, `#b388eb`]))
  };
}

// 繪製愛心圖形。
function drawHeart(centerX, centerY, heartSize, heartColor) {
  push();
  translate(centerX, centerY);
  fill(heartColor);
  noStroke();
  beginShape();
  vertex(0, heartSize * 0.78);
  bezierVertex(-heartSize * 1.15, heartSize * 0.08, -heartSize * 0.62, -heartSize * 0.72, 0, -heartSize * 0.18);
  bezierVertex(heartSize * 0.62, -heartSize * 0.72, heartSize * 1.15, heartSize * 0.08, 0, heartSize * 0.78);
  endShape(CLOSE);
  pop();
}

// 更新未及格鼓勵特效。
function updateAndDrawEncouragement() {
  const now = millis();
  const scale = clampValue(min(width, height) / 700, 0.65, 1.35);
  const heartX = clampValue(width * 0.15, 42, 110);
  const heartY = clampValue(height * 0.16, 50, 120);
  const pulse = 1 + sin(animationTime * 0.09) * 0.1;
  const glowAlpha = 28 + (sin(animationTime * 0.08) + 1) * 14;

  if (now - lastEncouragementSpawn > 95) {
    encouragementParticles.push(createEncouragementParticle());
    lastEncouragementSpawn = now;
  }

  noStroke();
  for (let ring = 3; ring >= 1; ring -= 1) {
    fill(244, 162, 97, glowAlpha / ring);
    circle(heartX, heartY, (52 + ring * 18) * scale * pulse);
  }
  drawHeart(heartX, heartY, 19 * scale * pulse, color(`#e76f51`));

  for (let i = encouragementParticles.length - 1; i >= 0; i -= 1) {
    const particle = encouragementParticles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy *= 0.998;
    particle.alpha -= particle.decay;
    const particleColor = color(particle.colorValue);
    particleColor.setAlpha(max(0, particle.alpha));
    fill(particleColor);
    circle(particle.x, particle.y, particle.size);
    if (particle.alpha <= 2 || particle.y < -30) {
      encouragementParticles.splice(i, 1);
    }
  }

  const starX = clampValue(width * 0.84, 50, width - 35);
  const starY = clampValue(height * 0.17, 55, 125);
  const starSize = (7 + (sin(animationTime * 0.12) + 1) * 3) * scale;
  drawSparkle(starX, starY, starSize, color(`#f9c74f`));
  drawSparkle(starX - 30 * scale, starY + 27 * scale, starSize * 0.65, color(`#43aa8b`));
}

// 繪製四角星閃光。
function drawSparkle(centerX, centerY, sparkleSize, sparkleColor) {
  push();
  translate(centerX, centerY);
  noStroke();
  fill(sparkleColor);
  beginShape();
  vertex(0, -sparkleSize);
  vertex(sparkleSize * 0.28, -sparkleSize * 0.28);
  vertex(sparkleSize, 0);
  vertex(sparkleSize * 0.28, sparkleSize * 0.28);
  vertex(0, sparkleSize);
  vertex(-sparkleSize * 0.28, sparkleSize * 0.28);
  vertex(-sparkleSize, 0);
  vertex(-sparkleSize * 0.28, -sparkleSize * 0.28);
  endShape(CLOSE);
  pop();
}

// ------------------------------
// 十、滑鼠、觸控與測驗流程
// ------------------------------

// 滑鼠與觸控共用的指標處理器。
function handlePointerPress(pointerX, pointerY) {
  if (loadState === `config` || loadState === `loading`) {
    return false;
  }

  if (loadState === `error`) {
    if (isInsideRect(pointerX, pointerY, actionButton)) {
      beginQuestionBankLoad();
    }
    return false;
  }

  if (quizFinished) {
    if (isInsideRect(pointerX, pointerY, actionButton)) {
      startNewQuiz();
    }
    return false;
  }

  if (!hasAnswered) {
    for (let i = 0; i < optionRects.length; i += 1) {
      if (isInsideRect(pointerX, pointerY, optionRects[i])) {
        answerQuestion(i);
        return false;
      }
    }
  }

  if (hasAnswered && isInsideRect(pointerX, pointerY, actionButton)) {
    goToNextStep();
  }
  return false;
}

// 桌面滑鼠操作；忽略觸控剛產生的重複 mousePressed。
function mousePressed() {
  if (millis() < ignoreMouseUntil) {
    return false;
  }
  return handlePointerPress(mouseX, mouseY);
}

// 觸控使用 touches[0]，交給與滑鼠共用的 pointer handler。
function touchStarted() {
  if (!touches || touches.length === 0) {
    return false;
  }
  const touchPoint = touches[0];
  ignoreMouseUntil = millis() + 450;
  handlePointerPress(touchPoint.x, touchPoint.y);
  return false;
}

// 判斷座標是否位於矩形中。
function isInsideRect(pointerX, pointerY, rectInfo) {
  return pointerX >= rectInfo.x &&
    pointerX <= rectInfo.x + rectInfo.width &&
    pointerY >= rectInfo.y &&
    pointerY <= rectInfo.y + rectInfo.height;
}

// 記錄答案並更新分數；作答後禁止更換答案。
function answerQuestion(index) {
  if (hasAnswered || !questions[currentQuestion]) {
    return;
  }
  selectedIndex = index;
  hasAnswered = true;
  if (index === questions[currentQuestion].answer) {
    correctCount += 1;
  }
  animationTime = 0;
}

// 前往下一題，或在第五題後顯示結果頁。
function goToNextStep() {
  if (!hasAnswered) {
    return;
  }
  if (currentQuestion < TOTAL_QUESTIONS - 1) {
    currentQuestion += 1;
    selectedIndex = -1;
    hasAnswered = false;
    animationTime = 0;
    calculateQuizLayout();
  } else {
    quizFinished = true;
    resultEffectMode = ``;
    resultEffectStartedAt = 0;
    calculateResultLayout();
  }
}

// 從完整題庫洗牌並抽出不重複的五題。
function startNewQuiz() {
  if (loadState !== `ready` || questionBank.length < TOTAL_QUESTIONS) {
    return;
  }
  questions = shuffle(questionBank.slice(), true).slice(0, TOTAL_QUESTIONS);
  currentQuestion = 0;
  correctCount = 0;
  selectedIndex = -1;
  hasAnswered = false;
  quizFinished = false;
  animationTime = 0;
  resultEffectMode = ``;
  resultEffectStartedAt = 0;
  fireworks = [];
  encouragementParticles = [];
  calculateQuizLayout();
}
