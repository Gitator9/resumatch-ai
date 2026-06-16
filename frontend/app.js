document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('analyzer-form');
  const jobDescInput = document.getElementById('job-desc');
  const fileInput = document.getElementById('resume-file');
  const dropZone = document.getElementById('drop-zone');
  const fileInfo = document.getElementById('file-info');
  const fileNameDisplay = fileInfo.querySelector('.file-name');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const loader = submitBtn.querySelector('.loader');
  
  const resultsCard = document.getElementById('results-card');
  const emptyResults = resultsCard.querySelector('.empty-results');
  const resultsContent = resultsCard.querySelector('.results-content');
  
  const scoreNum = document.getElementById('score-num');
  const scoreRing = document.getElementById('score-ring-progress');
  const matchBadge = document.getElementById('match-badge');
  const matchSummary = document.getElementById('match-summary');
  
  const matchedSkillsContainer = document.getElementById('matched-skills-container');
  const missingSkillsContainer = document.getElementById('missing-skills-container');
  const suggestionsContainer = document.getElementById('suggestions-container');
  const questionsContainer = document.getElementById('questions-container');
  
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  let selectedFile = null;
  const CIRCUMFERENCE = 2 * Math.PI * 50; // 314.159

  // --- Error Toast ---
  const errorToast = document.getElementById('error-toast');
  const errorToastMsg = document.getElementById('error-toast-msg');
  const errorToastClose = document.getElementById('error-toast-close');

  function showError(message) {
    errorToastMsg.textContent = message;
    errorToast.classList.remove('hidden');
    errorToast.classList.add('visible');
    // Auto-hide after 10 seconds
    setTimeout(() => hideError(), 10000);
  }

  function hideError() {
    errorToast.classList.remove('visible');
    setTimeout(() => errorToast.classList.add('hidden'), 400);
  }

  errorToastClose.addEventListener('click', hideError);

  // 1. Drag and Drop File Handlers
  dropZone.addEventListener('click', () => {
    if (!selectedFile) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropZone.addEventListener(type, () => {
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  function handleFiles(files) {
    if (files.length === 0) return;
    const file = files[0];

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file.');
      return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    
    // UI adjustment: hide drop text, show file info bar
    dropZone.querySelector('.drop-icon').classList.add('hidden');
    dropZone.querySelector('.drop-text').classList.add('hidden');
    fileInfo.classList.remove('hidden');
  }

  // Clear selected file
  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering input click
    clearFileSelection();
  });

  function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    dropZone.querySelector('.drop-icon').classList.remove('hidden');
    dropZone.querySelector('.drop-text').classList.remove('hidden');
    fileInfo.classList.add('hidden');
  }

  // 2. Tab Navigation
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // Update buttons active status
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update panes active status
      tabPanes.forEach(pane => {
        if (pane.id === targetTab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });

  // 3. Form Submission (Calling Backend API)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Please upload a PDF resume first.');
      return;
    }

    // Set Loading State
    submitBtn.disabled = true;
    btnText.textContent = 'Analyzing...';
    loader.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('job_description', jobDescInput.value);

    try {
      // Dynamically select backend API URL based on environment
      const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000/api/analyze'
        : '/api/analyze'; // Relative path works on unified Vercel deployment

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Failed to complete analysis.' }));
        const status = response.status;
        if (status === 429) {
          throw new Error('⏳ API quota reached. The free Gemini AI limit was hit. Please wait a few minutes and try again.');
        }
        throw new Error(errData.detail || 'Failed to complete analysis.');
      }

      const result = await response.json();
      displayResults(result);

    } catch (error) {
      console.error(error);
      showError(error.message);
    } finally {
      // Clear Loading State
      submitBtn.disabled = false;
      btnText.textContent = 'Analyze Compatibility';
      loader.classList.add('hidden');
    }
  });

  // 4. Render Results
  function displayResults(data) {
    // Show results element, hide empty state
    resultsCard.classList.remove('empty-state');
    emptyResults.classList.add('hidden');
    resultsContent.classList.remove('hidden');

    // Set score and animate circle progress
    const score = data.match_score || 0;
    animateScore(score);

    // Set match level badge styling
    const level = (data.match_level || 'Medium').toLowerCase();
    matchBadge.textContent = `${level.toUpperCase()} MATCH`;
    matchBadge.className = 'match-level-badge'; // reset
    if (level === 'high') {
      matchBadge.classList.add('match-level-high');
    } else if (level === 'low') {
      matchBadge.classList.add('match-level-low');
    } else {
      matchBadge.classList.add('match-level-medium');
    }

    // Set summary explanation
    matchSummary.textContent = data.summary || 'Compatibility analysis complete.';

    // Populate matched skills
    matchedSkillsContainer.innerHTML = '';
    if (data.matched_skills && data.matched_skills.length > 0) {
      data.matched_skills.forEach(skill => {
        const badge = document.createElement('span');
        badge.className = 'skill-badge skill-matched';
        badge.textContent = skill;
        matchedSkillsContainer.appendChild(badge);
      });
    } else {
      matchedSkillsContainer.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">No direct matches found.</span>';
    }

    // Populate missing skills
    missingSkillsContainer.innerHTML = '';
    if (data.missing_skills && data.missing_skills.length > 0) {
      data.missing_skills.forEach(skill => {
        const badge = document.createElement('span');
        badge.className = 'skill-badge skill-missing';
        badge.textContent = skill;
        missingSkillsContainer.appendChild(badge);
      });
    } else {
      missingSkillsContainer.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">None (Excellent alignment!)</span>';
    }

    // Populate suggestions list
    suggestionsContainer.innerHTML = '';
    if (data.suggestions && data.suggestions.length > 0) {
      data.suggestions.forEach(suggestion => {
        const item = document.createElement('li');
        item.textContent = suggestion;
        suggestionsContainer.appendChild(item);
      });
    } else {
      suggestionsContainer.innerHTML = '<li>No significant changes suggested. Your resume is well-tailored!</li>';
    }

    // Populate interview questions
    questionsContainer.innerHTML = '';
    if (data.interview_prep && data.interview_prep.length > 0) {
      data.interview_prep.forEach(item => {
        const qCard = document.createElement('div');
        qCard.className = 'question-card';

        const qText = document.createElement('div');
        qText.className = 'question-text';
        qText.textContent = `Q: ${item.question}`;

        const gText = document.createElement('div');
        gText.className = 'guideline-text';
        gText.textContent = item.guideline;

        qCard.appendChild(qText);
        qCard.appendChild(gText);
        questionsContainer.appendChild(qCard);
      });
    } else {
      questionsContainer.innerHTML = '<p class="text-muted" style="font-size: 0.9rem;">No dynamic interview preparation guidelines generated.</p>';
    }

    // Scroll results card into view for mobile screens
    resultsCard.scrollIntoView({ behavior: 'smooth' });
  }

  function animateScore(targetScore) {
    // 1. Text number count up animation
    let currentScore = 0;
    const duration = 1000; // 1 second
    const stepTime = Math.abs(Math.floor(duration / targetScore)) || 10;
    
    const timer = setInterval(() => {
      currentScore += 1;
      scoreNum.textContent = currentScore;
      if (currentScore >= targetScore) {
        scoreNum.textContent = targetScore;
        clearInterval(timer);
      }
    }, stepTime);

    // 2. SVG Ring Dashoffset animation
    const offset = CIRCUMFERENCE - (targetScore / 100) * CIRCUMFERENCE;
    scoreRing.style.strokeDashoffset = offset;
  }
});
