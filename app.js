/**
 * TBC Training System v3.0
 * ICGC Bible Challenge 2026
 * All logic self-contained — no external dependencies
 */

// ─────────────────────────────────────────────
// DATA LOADER
// Data is embedded directly via data_embedded.js
// No fetch/server required — works by double-click
// ─────────────────────────────────────────────
const DATA = {
  bankA: null, bankB: null, bankC: null, bankD: null, quotes: null
};

async function loadAllData() {
  if (typeof EMBEDDED_DATA === 'undefined') {
    alert('Question data not found. Make sure data_embedded.js is in the same folder as index.html.');
    throw new Error('EMBEDDED_DATA missing');
  }
  DATA.bankA   = EMBEDDED_DATA.bankA;
  DATA.bankB   = EMBEDDED_DATA.bankB;
  DATA.bankC   = EMBEDDED_DATA.bankC;
  DATA.bankD   = EMBEDDED_DATA.bankD;
  DATA.quotes  = EMBEDDED_DATA.quotes;
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const LS = {
  R5A_INDEX: 'tbc_round5a_index',
  MOCK_SCORES: 'tbc_mock_scores',
  TIMED_SCORES: 'tbc_timed_scores',
};

let session = {
  mode: null,          // 'study'|'timed'|'mock'|'round5a'|'quote'
  questions: [],       // current question set
  current: 0,          // index
  score: 0,
  timer: null,         // interval ID
  timerSeconds: 0,
  timerLeft: 0,
  filter: null,        // Study Mode round filter
  showFeedback: true,  // Timed Mode option
  wrongAnswers: [],    // { question, userAnswer, correctAnswer, explanation }
  categoryScores: {},  // round → { correct, total }
};

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

function getLSArr(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function setLSArr(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getRoundCategory(round) {
  if (!round) return 'General';
  return round.replace('Round ', 'Rd ').split(' — ')[0] + ' — ' + (round.split(' — ')[1] || '');
}

// ─────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────
function goHome() {
  clearTimer();
  document.body.classList.remove('mock-mode');
  showScreen('screen-home');
}

// ─────────────────────────────────────────────
// STUDY MODE
// ─────────────────────────────────────────────
function openStudySetup() {
  session.mode = 'study';
  showScreen('screen-setup');
  $('setup-title').textContent = 'Study Mode Setup';
  $('setup-info').innerHTML = '<strong>Study Mode</strong> — Immediate feedback after every question. Filter by round category. No time pressure.';
  $('setup-timer-section').classList.add('hidden');
  $('setup-filter-section').classList.remove('hidden');
  $('setup-feedback-section').classList.add('hidden');
  // Select first option by default
  const first = document.querySelector('#setup-filter-section .radio-option');
  if (first) selectRadio(first);
}

function openTimedSetup() {
  session.mode = 'timed';
  showScreen('screen-setup');
  $('setup-title').textContent = 'Timed Mode Setup';
  $('setup-info').innerHTML = '<strong>Timed Mode</strong> — 40 questions drawn randomly across all categories. Choose your timer speed.';
  $('setup-timer-section').classList.remove('hidden');
  $('setup-filter-section').classList.add('hidden');
  $('setup-feedback-section').classList.remove('hidden');
  // Select default timer
  const first = document.querySelector('#setup-timer-section .radio-option');
  if (first) selectRadio(first);
}

function selectRadio(el) {
  const parent = el.closest('.filter-options, .timer-options, .feedback-options');
  if (!parent) return;
  parent.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

function startSession() {
  if (session.mode === 'study') {
    const sel = document.querySelector('#setup-filter-section .radio-option.selected');
    if (!sel) { alert('Please select a round category.'); return; }
    const filter = sel.dataset.value;
    session.filter = filter;
    let pool = DATA.bankA.filter(q => q.round === filter);
    session.questions = shuffle(pool);
  } else if (session.mode === 'timed') {
    const timerSel = document.querySelector('#setup-timer-section .radio-option.selected');
    session.timerSeconds = timerSel ? parseInt(timerSel.dataset.value) : 7;
    const fbSel = document.querySelector('#setup-feedback-section .radio-option.selected');
    session.showFeedback = fbSel ? fbSel.dataset.value === 'immediate' : true;
    session.questions = shuffle(DATA.bankB).slice(0, 40);
  } else if (session.mode === 'mock') {
    session.questions = shuffle(DATA.bankC).slice(0, 100);
    document.body.classList.add('mock-mode');
  } else if (session.mode === 'round5a') {
    const idx = parseInt(localStorage.getItem(LS.R5A_INDEX) || '0');
    session.current = 0;
    const q = DATA.bankD[idx % DATA.bankD.length];
    session.questions = [q];
  }

  session.score = 0;
  session.current = 0;
  session.wrongAnswers = [];
  session.categoryScores = {};
  renderQuestion();
  showScreen('screen-quiz');
}

// ─────────────────────────────────────────────
// QUIZ ENGINE
// ─────────────────────────────────────────────
function renderQuestion() {
  clearTimer();
  const q = session.questions[session.current];
  if (!q) { endSession(); return; }

  const total = session.questions.length;
  const num = session.current + 1;

  // Header bar
  $('quiz-progress').textContent = `Question ${num} of ${total}`;
  $('quiz-score-display').textContent = `Score: ${session.score}`;
  $('quiz-score-display').style.display = (session.mode === 'timed' && session.showFeedback) || session.mode === 'study' ? '' : 'none';
  $('quiz-timer-display').style.display = session.mode === 'timed' ? '' : 'none';

  // Progress bar
  $('quiz-progress-bar').style.width = `${(session.current / total) * 100}%`;

  // Category label
  $('question-category').textContent = q.round || '';

  // Question text
  $('question-text').textContent = q.question;

  // Options
  const opts = [
    { key: 'A', text: q.optionA },
    { key: 'B', text: q.optionB },
    { key: 'C', text: q.optionC },
    { key: 'D', text: q.optionD },
  ];
  const optList = $('options-list');
  optList.innerHTML = '';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-label">${opt.key}</span><span class="option-text">${escapeHtml(opt.text)}</span>`;
    btn.addEventListener('click', () => handleAnswer(opt.key, btn, q));
    optList.appendChild(btn);
  });

  // Explanation
  $('explanation-box').style.display = 'none';
  $('explanation-box').textContent = '';
  $('btn-next').style.display = 'none';

  // Timer for Timed Mode
  if (session.mode === 'timed') {
    session.timerLeft = session.timerSeconds;
    updateTimerDisplay();
    session.timer = setInterval(() => {
      session.timerLeft--;
      updateTimerDisplay();
      if (session.timerLeft <= 0) {
        clearTimer();
        handleAnswer(null, null, q); // time's up = wrong
      }
    }, 1000);
  }
}

function updateTimerDisplay() {
  const el = $('quiz-timer-display');
  el.textContent = `${session.timerLeft}s`;
  el.classList.toggle('warning', session.timerLeft <= 2);
}

function clearTimer() {
  if (session.timer) { clearInterval(session.timer); session.timer = null; }
}

function handleAnswer(chosen, btnEl, q) {
  clearTimer();
  const isCorrect = chosen === q.correctAnswer;

  // Disable all buttons
  document.querySelectorAll('.option-btn').forEach(b => {
    b.disabled = true;
    const key = b.querySelector('.option-label').textContent;
    if (key === q.correctAnswer) { b.classList.add('correct'); b.classList.add('revealed'); }
    if (chosen && key === chosen && !isCorrect) { b.classList.add('wrong'); b.classList.add('revealed'); }
  });

  // Track score
  if (isCorrect) {
    session.score++;
    const cat = q.round || 'General';
    if (!session.categoryScores[cat]) session.categoryScores[cat] = { correct: 0, total: 0 };
    session.categoryScores[cat].correct++;
  } else {
    session.wrongAnswers.push({
      question: q.question,
      userAnswer: chosen ? `${chosen}: ${q['option' + chosen]}` : '(Time expired)',
      correctAnswer: `${q.correctAnswer}: ${q['option' + q.correctAnswer]}`,
      explanation: q.explanation,
      round: q.round,
    });
  }
  const cat = q.round || 'General';
  if (!session.categoryScores[cat]) session.categoryScores[cat] = { correct: 0, total: 0 };
  session.categoryScores[cat].total++;

  // Feedback
  const showImmediate = session.mode === 'study' ||
    (session.mode === 'timed' && session.showFeedback) ||
    session.mode === 'round5a';

  if (showImmediate) {
    const expBox = $('explanation-box');
    expBox.innerHTML = `<div class="exp-label">${isCorrect ? '✓ Correct!' : '✗ Incorrect'}</div>${escapeHtml(q.explanation)}`;
    expBox.className = 'explanation-box' + (isCorrect ? '' : ' wrong-exp');
    expBox.style.display = 'block';
  }

  // Auto-advance for Mock (no feedback shown) and Timed (when feedback hidden)
  if (session.mode === 'mock' || (session.mode === 'timed' && !session.showFeedback)) {
    setTimeout(() => nextQuestion(), 400);
  } else {
    $('btn-next').style.display = 'block';
    $('btn-next').textContent = session.current < session.questions.length - 1 ? 'Next Question →' : 'See Results';
  }

  $('quiz-score-display').textContent = `Score: ${session.score}`;
}

function nextQuestion() {
  session.current++;
  renderQuestion();
}

// ─────────────────────────────────────────────
// END SESSION / RESULTS
// ─────────────────────────────────────────────
function endSession() {
  clearTimer();
  document.body.classList.remove('mock-mode');

  if (session.mode === 'round5a') {
    showRound5AResult();
    return;
  }

  // Save scores to localStorage
  const scoreData = {
    score: session.score,
    total: session.questions.length,
    pct: Math.round((session.score / session.questions.length) * 100),
    date: new Date().toLocaleDateString(),
  };
  if (session.mode === 'mock') {
    setLSArr(LS.MOCK_SCORES, [scoreData]);
  } else if (session.mode === 'timed') {
    setLSArr(LS.TIMED_SCORES, [scoreData]);
  }

  renderResultScreen();
}

function renderResultScreen() {
  showScreen('screen-result');
  const total = session.questions.length;
  const pct = Math.round((session.score / total) * 100);

  $('result-score-num').textContent = session.score;
  $('result-score-denom').textContent = `/ ${total}`;
  $('result-pct').textContent = `${pct}%`;

  let verdict = pct >= 80 ? '🎉 Excellent Work!' : pct >= 60 ? '👍 Good Effort!' : '📖 Keep Studying!';
  $('result-title').textContent = verdict;
  $('result-subtitle').textContent = `${session.mode === 'mock' ? 'Mock Exam' : session.mode === 'timed' ? 'Timed Mode' : 'Study Mode'} — ${new Date().toLocaleDateString()}`;

  // Breakdown
  const breakdown = $('breakdown-rows');
  breakdown.innerHTML = '';
  Object.entries(session.categoryScores).forEach(([cat, data]) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `<span class="breakdown-cat">${cat}</span><span class="breakdown-score">${data.correct}/${data.total}</span>`;
    breakdown.appendChild(row);
  });
  if (!Object.keys(session.categoryScores).length) {
    breakdown.innerHTML = '<div class="breakdown-row"><span class="breakdown-cat">No data</span></div>';
  }

  $('result-wrong-count').textContent = session.wrongAnswers.length;
  $('btn-review-result').style.display = session.wrongAnswers.length > 0 ? '' : 'none';
}

// ─────────────────────────────────────────────
// REVIEW SCREEN
// ─────────────────────────────────────────────
function showReview() {
  showScreen('screen-review');
  const list = $('review-list');
  list.innerHTML = '';

  if (session.wrongAnswers.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🎯</div><p>No incorrect answers to review!</p></div>';
    return;
  }

  session.wrongAnswers.forEach(wa => {
    const item = document.createElement('div');
    item.className = 'review-item';
    item.innerHTML = `
      <div class="review-cat-badge">${wa.round || 'General'}</div>
      <div class="review-q">${escapeHtml(wa.question)}</div>
      <div class="review-answers">
        <div class="review-your">Your answer: ${escapeHtml(wa.userAnswer)}</div>
        <div class="review-correct">Correct: ${escapeHtml(wa.correctAnswer)}</div>
      </div>
      <div class="review-exp">${escapeHtml(wa.explanation)}</div>
    `;
    list.appendChild(item);
  });
}

// ─────────────────────────────────────────────
// ROUND 5A MODE
// ─────────────────────────────────────────────
function openRound5A() {
  session.mode = 'round5a';
  const idx = parseInt(localStorage.getItem(LS.R5A_INDEX) || '0') % DATA.bankD.length;
  const q = DATA.bankD[idx];

  showScreen('screen-round5a');
  $('r5a-qnum').textContent = `Question ${idx + 1} of ${DATA.bankD.length}`;
  $('r5a-rotation-info').textContent = `Rotation position ${idx + 1}/${DATA.bankD.length} — resets after all 5 have been seen.`;
  $('r5a-qtext').textContent = q.question;

  const opts = [
    { key: 'A', text: q.optionA },
    { key: 'B', text: q.optionB },
    { key: 'C', text: q.optionC },
    { key: 'D', text: q.optionD },
  ];
  const optList = $('r5a-options');
  optList.innerHTML = '';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-label">${opt.key}</span><span class="option-text">${escapeHtml(opt.text)}</span>`;
    btn.addEventListener('click', () => handleR5AAnswer(opt.key, btn, q, idx));
    optList.appendChild(btn);
  });

  $('r5a-result').style.display = 'none';
  $('btn-r5a-next').style.display = 'none';
}

function handleR5AAnswer(chosen, btnEl, q, idx) {
  const isCorrect = chosen === q.correctAnswer;

  document.querySelectorAll('#r5a-options .option-btn').forEach(b => {
    b.disabled = true;
    const key = b.querySelector('.option-label').textContent;
    if (key === q.correctAnswer) b.classList.add('correct');
    if (key === chosen && !isCorrect) b.classList.add('wrong');
  });

  const resultEl = $('r5a-result');
  resultEl.style.display = 'block';
  resultEl.className = 'explanation-box' + (isCorrect ? '' : ' wrong-exp');
  resultEl.innerHTML = `<div class="exp-label">${isCorrect ? '✓ Correct!' : '✗ Incorrect'}</div>${escapeHtml(q.explanation)}`;

  // Advance rotation index
  const nextIdx = (idx + 1) % DATA.bankD.length;
  localStorage.setItem(LS.R5A_INDEX, nextIdx.toString());

  $('btn-r5a-next').style.display = 'block';
}

function showRound5AResult() {
  // Round 5A just goes back home after button click — handled inline
}

// ─────────────────────────────────────────────
// QUOTE PRACTICE MODE
// ─────────────────────────────────────────────
function openQuotePractice() {
  session.mode = 'quote';
  showScreen('screen-quote');
  buildQuoteSelectors();
  $('quote-result').style.display = 'none';
  $('quote-answer-input').value = '';
}

function buildQuoteSelectors() {
  // Get all chapters
  const chapters = [...new Set(DATA.quotes.map(q => q.chapter))].sort((a, b) => a - b);
  const chapSel = $('quote-chapter-sel');
  chapSel.innerHTML = '<option value="">Select Chapter</option>';
  chapters.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = `Chapter ${c}`;
    chapSel.appendChild(opt);
  });

  const verseSel = $('quote-verse-sel');
  verseSel.innerHTML = '<option value="">Select Verse</option>';
  verseSel.disabled = true;

  chapSel.addEventListener('change', () => {
    const ch = parseInt(chapSel.value);
    verseSel.innerHTML = '<option value="">Select Verse</option>';
    if (!ch) { verseSel.disabled = true; return; }
    const verses = DATA.quotes.filter(q => q.chapter === ch).sort((a, b) => a.verse - b.verse);
    verses.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.verse; opt.textContent = `Verse ${v.verse}`;
      verseSel.appendChild(opt);
    });
    verseSel.disabled = false;
    $('quote-result').style.display = 'none';
    $('quote-answer-input').value = '';
  });

  verseSel.addEventListener('change', () => {
    $('quote-result').style.display = 'none';
    $('quote-answer-input').value = '';
  });
}

function submitQuote() {
  const ch = parseInt($('quote-chapter-sel').value);
  const vs = parseInt($('quote-verse-sel').value);
  if (!ch || !vs) { alert('Please select a chapter and verse first.'); return; }

  const verseObj = DATA.quotes.find(q => q.chapter === ch && q.verse === vs);
  if (!verseObj) { alert('Verse not found in database.'); return; }

  const userInput = $('quote-answer-input').value;
  const normalized_user = normalizeText(userInput);
  const normalized_correct = normalizeText(verseObj.text);

  const isCorrect = normalized_user === normalized_correct;

  const resultEl = $('quote-result');
  resultEl.style.display = 'block';
  resultEl.className = 'quote-result ' + (isCorrect ? 'pass' : 'fail');

  const label = isCorrect ? '✓ Correct! Well done!' : '✗ Incorrect';
  const ref = `Matthew ${ch}:${vs}`;

  resultEl.innerHTML = `
    <div class="quote-result-label">${label}</div>
    <div style="font-size:0.82rem;color:var(--gray-600);margin-bottom:8px;">${ref} (NKJV)</div>
    <div class="diff-display">${buildDiff(userInput, verseObj.text)}</div>
    <button class="btn-try-again" onclick="retryQuote()">Try Again</button>
  `;
}

function retryQuote() {
  $('quote-answer-input').value = '';
  $('quote-result').style.display = 'none';
  $('quote-answer-input').focus();
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"()\-—–''""]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDiff(userText, correctText) {
  const userWords = userText.trim().split(/\s+/);
  const correctWords = correctText.trim().split(/\s+/);
  const normalUser = userWords.map(w => normalizeText(w));
  const normalCorrect = correctWords.map(w => normalizeText(w));

  let html = '<span style="font-size:0.8rem;color:var(--gray-600);">Correct verse: </span><br>';
  correctWords.forEach((word, i) => {
    const nc = normalCorrect[i];
    // find matching position in user's input
    const idx = normalUser.indexOf(nc);
    if (idx !== -1) {
      html += `<span class="diff-match">${escapeHtml(word)} </span>`;
    } else {
      html += `<span class="diff-missing">${escapeHtml(word)} </span>`;
    }
  });
  return html;
}

// ─────────────────────────────────────────────
// MOCK MODE WRAPPER
// ─────────────────────────────────────────────
function openMockMode() {
  session.mode = 'mock';
  showScreen('screen-setup');
  $('setup-title').textContent = 'Mock Exam Mode';
  $('setup-info').innerHTML = '<strong>Mock Exam</strong> — 100 questions. No feedback during the session. No score shown until all questions are answered. Simulates competition conditions.';
  $('setup-timer-section').classList.add('hidden');
  $('setup-filter-section').classList.add('hidden');
  $('setup-feedback-section').classList.add('hidden');
  $('btn-setup-start').textContent = 'Begin Exam →';
}

// ─────────────────────────────────────────────
// ESCAPE HTML
// ─────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// EVENT BINDINGS
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();

  // Mode buttons
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'study') openStudySetup();
      else if (mode === 'timed') openTimedSetup();
      else if (mode === 'mock') openMockMode();
      else if (mode === 'round5a') openRound5A();
      else if (mode === 'quote') openQuotePractice();
    });
  });

  // Radio option selection
  document.querySelectorAll('.radio-option').forEach(opt => {
    opt.addEventListener('click', () => selectRadio(opt));
  });

  // Setup → Start button
  $('btn-setup-start').addEventListener('click', startSession);

  // Next question button
  $('btn-next').addEventListener('click', nextQuestion);

  // Back buttons
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', goHome);
  });

  // Results → Review
  $('btn-review-result').addEventListener('click', showReview);

  // Results → Play Again
  $('btn-play-again').addEventListener('click', () => {
    if (session.mode === 'study') openStudySetup();
    else if (session.mode === 'timed') openTimedSetup();
    else if (session.mode === 'mock') openMockMode();
    else goHome();
  });

  // Quote → Submit
  $('btn-submit-quote').addEventListener('click', submitQuote);

  // Round 5A → Next
  $('btn-r5a-next').addEventListener('click', goHome);

  // Show home
  showScreen('screen-home');
});
