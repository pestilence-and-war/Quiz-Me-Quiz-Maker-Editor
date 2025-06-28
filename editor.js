// js/editor.js (MERGED - Dashboard Aware & AI/File Handling)

// --- GLOBAL STATE & CONSTANTS ---
const API_BASE_URL = 'https://quiz-backend-613338700440.us-central1.run.app';
let currentView = 'auth'; // 'auth', 'dashboard', 'editor'
let currentQuizzes = []; // To store the list of user's quizzes
let currentlyEditingQuizId = null;

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    authView: document.getElementById('authView'),
    dashboardView: document.getElementById('dashboardView'),
    editorView: document.getElementById('editorView'),
    // Auth
    loginBtn: document.getElementById('loginBtn'),
    registerBtn: document.getElementById('registerBtn'),
    authEmail: document.getElementById('authEmail'),
    authPassword: document.getElementById('authPassword'),
    authError: document.getElementById('authError'),
    // Dashboard
    logoutBtn: document.getElementById('logoutBtn'), // Dashboard logout and also used by AI modal context
    createNewQuizBtn: document.getElementById('createNewQuizBtn'),
    quizListContainer: document.getElementById('quizListContainer'),
    // Editor
    backToDashboardBtn: document.getElementById('backToDashboardBtn'),
    logoutBtnEditor: document.getElementById('logoutBtnEditor'), // Editor logout
    editorTitle: document.getElementById('editorTitle'),
    quizTitleInput: document.getElementById('quizTitle'),
    questionsContainer: document.getElementById('questionsContainer'),
    addQuestionBtn: document.getElementById('addQuestionBtn'),
    saveQuizBtn: document.getElementById('saveQuizBtn'), // Save to backend (from original first file)
    quizCodeDisplay: document.getElementById('quizCodeDisplay'),
    previewQuestionSelect: document.getElementById('previewQuestionSelect'),
    questionPreviewArea: document.getElementById('questionPreviewArea'),

    // NEW: AI & Auth Modal Elements (from second file)
    aiGenerateBtn: document.getElementById('aiGenerateBtn'),
    aiModal: document.getElementById('aiModal'),
    closeAiModalBtn: document.getElementById('closeAiModalBtn'),
    aiGenerationForm: document.getElementById('aiGenerationForm'),
    generateQuestionsBtn: document.getElementById('generateQuestionsBtn'),
    aiLoadingSpinner: document.getElementById('aiLoadingSpinner'),
    aiDocInput: document.getElementById('aiDocInput'),
    aiSubject: document.getElementById('aiSubject'),
    aiGrade: document.getElementById('aiGrade'),
    aiNumQuestions: document.getElementById('aiNumQuestions'),
    aiNotes: document.getElementById('aiNotes'),
    authModal: document.getElementById('authModal'),
    closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),

    // NEW: Editor specific elements for file handling/metadata (from second file)
    saveQuestionsBtn: document.getElementById('saveQuestionsBtn'), // Download JSON (from original second file)
    newQuizBtn: document.getElementById('newQuizBtn'),
    loadFileBtn: document.getElementById('loadFileBtn'),
    hiddenFileInput: document.getElementById('hiddenFileInput'),
    subjectInput: document.getElementById('subjectInput'),
    gradeInput: document.getElementById('gradeInput'),
    setNameInput: document.getElementById('setNameInput'),
};

// --- API HELPER FUNCTIONS ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('jwt_token');
    if (!token && endpoint !== '/api/login' && endpoint !== '/api/register') {
        // If no token and not trying to log in, force back to auth view
        showView('auth');
        return null;
    }

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (response.status === 401) { // Token expired or invalid
            handleLogout(); // This will show auth view
            return null;
        }
        const data = await response.json();
        if (!response.ok || (data.success === false)) {
            throw new Error(data.message || 'An API error occurred.');
        }
        return data;
    } catch (error) {
        console.error(`API Error on ${endpoint}:`, error);
        alert(`Error: ${error.message}`);
        return null;
    }
}

// --- VIEW MANAGEMENT ---
function showView(viewName) {
    DOM.authView.style.display = 'none';
    DOM.dashboardView.style.display = 'none';
    DOM.editorView.style.display = 'none';

    if (viewName === 'auth') {
        DOM.authView.style.display = 'block';
    } else if (viewName === 'dashboard') {
        DOM.dashboardView.style.display = 'block';
        loadDashboard(); // Refresh dashboard data when showing it
    } else if (viewName === 'editor') {
        DOM.editorView.style.display = 'block';
    }
    currentView = viewName;
}

// --------------- AUTHENTICATION FUNCTIONS ---------------
function isLoggedIn() {
    return !!localStorage.getItem('jwt_token');
}

function updateLoginStateUI() {
    // This function updates the visibility of the logout button,
    // which is shared between the dashboard and AI modal contexts.
    if (DOM.logoutBtn) { 
        DOM.logoutBtn.style.display = isLoggedIn() ? 'inline-flex' : 'none';
    }
}

async function handleLogin() {
    const email = DOM.authEmail.value;
    const password = DOM.authPassword.value;
    DOM.authError.style.display = 'none';

    if (!email || !password) {
        DOM.authError.textContent = "Email and password are required.";
        DOM.authError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Invalid credentials');

        localStorage.setItem('jwt_token', data.access_token);
        showView('dashboard'); // Main app flow goes to dashboard
        updateLoginStateUI(); // Update any other login-related UI elements
        closeAuthModal(); // Close auth modal if it was open (e.g., from AI flow)
    } catch (error) {
        DOM.authError.textContent = error.message;
        DOM.authError.style.display = 'block';
    }
}

async function handleRegister() {
    DOM.authError.style.display = 'none';
    const email = DOM.authEmail.value;
    const password = DOM.authPassword.value;

    if (!email || password.length < 6) {
        DOM.authError.textContent = 'Please enter a valid email and a password of at least 6 characters.';
        DOM.authError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json(); 
        if (!response.ok) {
            throw new Error(data.message || `Registration failed with status: ${response.status}`);
        }

        alert('Registration successful! Please log in.');
        // Optionally clear fields or switch to login mode
    } catch (error) {
        DOM.authError.textContent = error.message;
        DOM.authError.style.display = 'block';
    }
}

function handleLogout() {
    localStorage.removeItem('jwt_token');
    showView('auth');
    updateLoginStateUI(); // Update any other login-related UI elements
    alert('You have been logged out.'); 
}

function openAuthModal() {
    DOM.authError.textContent = '';
    DOM.authError.style.display = 'none';
    DOM.authModal.classList.add('active');
}

function closeAuthModal() {
    DOM.authModal.classList.remove('active');
}

// --- DASHBOARD LOGIC ---
async function loadDashboard() {
    DOM.quizListContainer.innerHTML = '<p>Loading your quizzes...</p>';
    const data = await apiCall('/api/quizzes');
    if (data && data.quizzes) {
        currentQuizzes = data.quizzes;
        renderDashboard();
    }
}

function renderDashboard() {
    if (currentQuizzes.length === 0) {
        DOM.quizListContainer.innerHTML = '<p>You haven\'t created any quizzes yet. Click "Create New Quiz" to start!</p>';
        return;
    }
    DOM.quizListContainer.innerHTML = '';
    currentQuizzes.forEach(quiz => {
        const quizEl = document.createElement('div');
        quizEl.className = 'quiz-item';
        quizEl.innerHTML = `
            <div>
                <div class="quiz-item-title">${quiz.title}</div>
                <div class="quiz-item-meta">Created: ${new Date(quiz.created_at).toLocaleDateString()}</div>
            </div>
            <div class="quiz-item-actions">
                <button class="edit-quiz-btn" data-id="${quiz.id}"><i class="fas fa-edit"></i> Edit</button>
                <button class="get-code-btn" data-id="${quiz.id}"><i class="fas fa-key"></i> Get Code</button>
            </div>
        `;
        DOM.quizListContainer.appendChild(quizEl);
    });
}

// --- EDITOR LOGIC ---
function openEditorForNewQuiz() {
    currentlyEditingQuizId = null;
    DOM.editorTitle.textContent = "Create New Quiz";
    DOM.quizTitleInput.value = "";
    DOM.quizCodeDisplay.style.display = 'none';
    resetEditorState(); // Use the full resetEditorState
    showView('editor');
}

async function openEditorForExistingQuiz(quizId) {
    const data = await apiCall(`/api/load-quiz/${quizId}`);
    if (data && data.quiz) {
        currentlyEditingQuizId = quizId;
        const quizData = data.quiz;
        // Find the title from the dashboard list
        const quizInfo = currentQuizzes.find(q => q.id === quizId);
        DOM.editorTitle.textContent = `Editing: ${quizInfo.title}`;
        DOM.quizTitleInput.value = quizInfo.title;

        // Load the quiz data into the editor using the full resetEditorState
        resetEditorState({ questions: quizData });

        showView('editor');
    }
}

async function handleSaveQuiz() { // This saves to the backend
    const title = DOM.quizTitleInput.value.trim();
    if (!title) {
        alert("Please enter a title for your quiz.");
        return;
    }

    // Use your existing logic to get questions from the editor UI
    const questions = DataManager.getAllQuestions();

    const endpoint = currentlyEditingQuizId ? `/api/update-quiz/${currentlyEditingQuizId}` : '/api/save-quiz';
    const method = currentlyEditingQuizId ? 'PUT' : 'POST';
    const body = { title: title, quiz_data: questions };

    const result = await apiCall(endpoint, method, body);
    if (result && result.success) {
        alert(`Quiz saved successfully! Shareable Code: ${result.quiz_code}`);
        DOM.quizCodeDisplay.innerHTML = `<strong>Share Code:</strong> ${result.quiz_code}`;
        DOM.quizCodeDisplay.style.display = 'block';
        currentlyEditingQuizId = result.quiz_id || currentlyEditingQuizId; // Update ID if new quiz
        // After saving, we could redirect to the dashboard
        // showView('dashboard'); 
    }
}

// --------------- AI GENERATION FUNCTIONS ---------------
function openAiModal() {
    if (!isLoggedIn()) {
        openAuthModal(); 
        return;
    }
    DOM.aiDocInput.value = '';
    DOM.aiGenerationForm.style.display = 'block';
    DOM.aiLoadingSpinner.style.display = 'none';
    DOM.generateQuestionsBtn.disabled = false;
    DOM.aiModal.classList.add('active');
}

function closeAiModal() {
    DOM.aiModal.classList.remove('active');
}

async function handleGenerateQuestions() {
    if (DOM.aiDocInput.files.length === 0) {
        alert('Please select a PDF or TXT file to upload.');
        return;
    }

    const token = localStorage.getItem('jwt_token');
    if (!token) {
        alert('Your session has expired. Please log in again.');
        openAuthModal(); 
        return;
    }

    DOM.generateQuestionsBtn.disabled = true;
    DOM.aiGenerationForm.style.display = 'none';
    DOM.aiLoadingSpinner.style.display = 'block';

    const formData = new FormData();
    formData.append('document', DOM.aiDocInput.files[0]);
    formData.append('subject', DOM.aiSubject.value);
    formData.append('grade', DOM.aiGrade.value);
    formData.append('num_questions', DOM.aiNumQuestions.value);
    formData.append('notes', DOM.aiNotes.value);
    const selectedTypes = Array.from(document.querySelectorAll('input[name="aiQuestionType"]:checked')).map(cb => cb.value).join(', ');
    formData.append('question_types', selectedTypes);

    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-questions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const result = await response.json();

        if (response.status === 401) {
            handleLogout();
            alert("Your session has expired. Please log in again.");
            closeAiModal();
            openAuthModal(); 
            return;
        }

        if (!response.ok || !result.success) {
            if (response.headers.get("content-type") && response.headers.get("content-type").indexOf("application/json") === -1) {
                throw new Error("The server returned a non-JSON error page. Check the backend logs for a Python crash.");
            }
            throw new Error(result.message || 'An unknown error occurred.');
        }

        const newQuestions = result.questions;
        if (!newQuestions || !Array.isArray(newQuestions) || newQuestions.length === 0) {
            throw new Error('The AI did not return any valid questions.');
        }

        // Remove initial blank question if it exists and is truly blank
        const currentQuestions = DataManager.getAllQuestions();
        if (currentQuestions.length === 1 && isQuestionEffectivelyBlank(currentQuestions[0])) {
            DataManager.removeQuestion(currentQuestions[0].id);
        }

        // Step 1: Add all new questions to the data manager first.
        newQuestions.forEach(q => {
            const newQuestionId = DataManager.generateNewId();
            const questionData = { ...q, id: newQuestionId };
            DataManager.addQuestion(questionData);
        });

        // Step 2: Clear the entire UI container.
        DOM.questionsContainer.innerHTML = '';

        // Step 3: Re-render the UI from the single source of truth (DataManager).
        const allQuestions = DataManager.getAllQuestions();
        allQuestions.forEach(q => {
            const newBlock = UIRenderer.renderQuestionBlock(q);
            UIRenderer.updateRemoveOptionButtons(newBlock);
        });

        // Step 4: Update the rest of the UI
        updateSaveButtonState();
        updatePreviewSelectDropdown();
        saveEditorStateToLocalStorage();
        alert(`Successfully added ${newQuestions.length} new question(s)!`);
        closeAiModal();

    } catch (error) {
        console.error('Error generating questions:', error);
        alert(`Failed to generate questions: ${error.message}`);
    } finally {
        DOM.generateQuestionsBtn.disabled = false;
        DOM.aiGenerationForm.style.display = 'block';
        DOM.aiLoadingSpinner.style.display = 'none';
    }
}


// --------------- HELPER FUNCTIONS ---------------\n
function generateFilename() {
    const subject = DOM.subjectInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '-') || 'subject';
    const grade = DOM.gradeInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '') || 'grade';
    const identifier = DOM.setNameInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '-') || 'set';
    let filenameParts = [subject];
    if (grade && grade.toLowerCase() !== 'unknown') {
        filenameParts.push(`grade${grade}`);
    }
    if (identifier && identifier.toLowerCase() !== 'unknown' && identifier.toLowerCase() !== 'set') {
        filenameParts.push(identifier);
    }
    let filename = filenameParts.filter(Boolean).join('_') || 'questions';
    filename = filename.replace(/_+$/, '');
    filename = filename.toLowerCase();
    return `${filename}.json`;
}

/**
 * Checks if a question object is effectively empty/untouched.
 * @param {object} q - The question object from DataManager.
 * @returns {boolean} - True if the question is blank, false otherwise.
 */
function isQuestionEffectivelyBlank(q) {
    if (!q) return false;

    const isTextBlank = q.Question.trim() === '';
    // Checks if the Options array exists and if every option inside it is an empty string.
    const areOptionsBlank = !q.Options || (Array.isArray(q.Options) && q.Options.every(opt => opt.trim() === ''));
    // Checks if the answer is null, undefined, or an empty array.
    const isAnswerBlank = !q.answer || (Array.isArray(q.answer) && q.answer.length === 0);
    const isRationaleBlank = !q.Rationale || q.Rationale.trim() === '';
    const isHintBlank = !q.hint || q.hint.trim() === '';

    return isTextBlank && areOptionsBlank && isAnswerBlank && isRationaleBlank && isHintBlank;
}

// --------------- FILE HANDLING FUNCTIONS ---------------\n
async function handleFileLoad(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    if (!confirm(`Are you sure you want to load ${files.length} file(s)? This will replace the current editor content.`)) {
         DOM.hiddenFileInput.value = '';
         return;
    }
    const fileReadPromises = files.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    const questions = Array.isArray(data) ? data : (data.questions || []);
                    resolve({ questions, metadata: data.metadata || {}, filename: file.name });
                } catch (error) {
                    console.error(`Error parsing ${file.name}:`, error);
                    resolve(null);
                }
            };
            reader.onerror = error => reject(error);
            reader.readAsText(file);
        });
    });

    const results = await Promise.allSettled(fileReadPromises);
    const compiledQuestions = [];
    let firstFileMetadata = null;
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            compiledQuestions.push(...result.value.questions);
            if (!firstFileMetadata) firstFileMetadata = result.value.metadata;
        }
    });

    if (compiledQuestions.length === 0) {
        alert("No valid questions found in the selected file(s).");
        DOM.hiddenFileInput.value = '';
        return;
    }

    const questionsWithNewIds = compiledQuestions.map(q => ({ ...q, id: DataManager.generateNewId() }));
    resetEditorState({ metadata: firstFileMetadata || {}, questions: questionsWithNewIds });
    alert(`Successfully loaded and compiled ${questionsWithNewIds.length} question(s).`);
    DOM.hiddenFileInput.value = '';
}


// --------------- STATE MANAGEMENT & UI UPDATES ---------------\n
function addQuestion() {
    const newQuestionId = DataManager.generateNewId();
    const newQuestionData = { id: newQuestionId, type: 'single', Question: '', Options: [''], answer: null, Rationale: '', hint: '' };
    DataManager.addQuestion(newQuestionData);
    UIRenderer.renderQuestionBlock(newQuestionData);
    updateSaveButtonState();
    updatePreviewSelectDropdown(newQuestionId);
    saveEditorStateToLocalStorage();
}

function removeQuestion(button) {
    const questionBlock = button.closest('.question-block');
    if (DOM.questionsContainer.querySelectorAll('.question-block').length > 1) {
        if (confirm("Are you sure you want to remove this question?")) {
            const questionId = questionBlock.dataset.questionId;
            DataManager.removeQuestion(questionId);
            UIRenderer.removeQuestionBlock(questionBlock);
            updateSaveButtonState();
            updatePreviewSelectDropdown(questionId);
            saveEditorStateToLocalStorage();
        }
    } else {
        alert("You must have at least one question.");
    }
}

function addOption(button) {
    const questionBlock = button.closest('.question-block');
    const questionId = questionBlock.dataset.questionId;
    const questionData = DataManager.getQuestionById(questionId);
    if (!questionData || !['single', 'multi-select', 'ordering'].includes(questionData.type)) return;
    questionData.Options = questionData.Options || [];
    questionData.Options.push('');
    DataManager.updateQuestion(questionId, questionData);
    UIRenderer.renderOptionInputs(questionBlock, questionData.Options);
    UIRenderer.updateAnswerUI(questionBlock, questionData.answer);
    updateSaveButtonState();
    if (DOM.previewQuestionSelect.value === questionId) updateQuestionPreview(questionId);
    saveEditorStateToLocalStorage();
}

function removeOption(button) {
    const questionBlock = button.closest('.question-block');
    const questionId = questionBlock.dataset.questionId;
    const questionData = DataManager.getQuestionById(questionId);
    const optionItem = button.closest('.option-item');
    const index = Array.from(optionItem.parentNode.children).indexOf(optionItem);
    if (index === -1 || !questionData || !questionData.Options || questionData.Options.length <= 1) return;

    questionData.Options.splice(index, 1);
    // Basic answer cleanup
    if (questionData.type === 'single' || questionData.type === 'multi-select' || questionData.type === 'ordering') {
        questionData.answer = (questionData.type === 'multi-select' || questionData.type === 'ordering') ? [] : null;
    }
    DataManager.updateQuestion(questionId, questionData);
    UIRenderer.renderOptionInputs(questionBlock, questionData.Options);
    UIRenderer.updateAnswerUI(questionBlock, questionData.answer);
    updateSaveButtonState();
    if (DOM.previewQuestionSelect.value === questionId) updateQuestionPreview(questionId);
    saveEditorStateToLocalStorage();
}

function handleQuestionTypeChange(event) {
    const questionBlock = event.target.closest('.question-block');
    const questionId = questionBlock.dataset.questionId;
    const newType = event.target.value;
    const questionData = DataManager.getQuestionById(questionId);
    if (!questionData) return;
    questionData.type = newType;
    if (['single', 'multi-select', 'ordering'].includes(newType)) {
        questionData.Options = Array.isArray(questionData.Options) ? questionData.Options : [''];
        questionData.answer = (newType === 'multi-select' || newType === 'ordering') ? [] : null;
    } else {
        questionData.Options = undefined;
        questionData.answer = ''; // For fill-in
    }
    DataManager.updateQuestion(questionId, questionData);
    UIRenderer.renderOptionInputs(questionBlock, questionData.Options);
    UIRenderer.updateAnswerUI(questionBlock, questionData.answer);
    UIRenderer.updateRemoveOptionButtons(questionBlock);
    updateSaveButtonState();
    if (DOM.previewQuestionSelect.value === questionId) updateQuestionPreview(questionId);
    saveEditorStateToLocalStorage();
}

function handleQuestionBlockInput(event) {
    const questionBlock = event.target.closest('.question-block');
    if (!questionBlock) return;
    const questionId = questionBlock.dataset.questionId;
    setTimeout(() => {
        const updatedData = UIRenderer.getQuestionDataFromBlock(questionBlock);
        DataManager.updateQuestion(questionId, updatedData);
        if (event.target.classList.contains('option-input')) {
            UIRenderer.renderAnswerOptions(questionBlock, updatedData.answer);
            UIRenderer.renderOrderOptions(questionBlock, updatedData.answer);
        }
        updateSaveButtonState();
        if (DOM.previewQuestionSelect.value === questionId) updateQuestionPreview(questionId);
        saveEditorStateToLocalStorage();
    }, 0);
}

function updateSaveButtonState() {
    // Ensure DOM.subjectInput and DOM.gradeInput exist before passing them
    const allValid = Validation.validateAll(DOM.questionsContainer, DOM.subjectInput, DOM.gradeInput);
    UIRenderer.updateSaveButtonState(allValid);
}

function handleSaveQuestions() { // This downloads a JSON file
    if (!Validation.validateAll(DOM.questionsContainer, DOM.subjectInput, DOM.gradeInput)) {
        alert("Please fix the errors before saving.");
        return;
    }
    const questionsToSave = DataManager.getAllQuestions();
    const filename = generateFilename();
    const blob = new Blob([JSON.stringify(questionsToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function updatePreviewSelectDropdown(selectedQuestionId = null) {
    const questions = DataManager.getAllQuestions();
    const questionIdToPreview = UIRenderer.updatePreviewSelect(questions, selectedQuestionId);
    if (questionIdToPreview) {
        updateQuestionPreview(questionIdToPreview);
    } else {
        DOM.questionPreviewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Add a question to see the preview.</p>';
    }
}

function updateQuestionPreview(questionId = null) {
    const selectedId = questionId || DOM.previewQuestionSelect.value;
    if (!selectedId) {
        DOM.questionPreviewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Select a question to see the preview.</p>';
        return;
    }
    const questionData = DataManager.getQuestionById(selectedId);
    if (questionData) {
        PreviewRenderer.renderPreview(questionData, DOM.questionPreviewArea);
    }
}

function resetEditorState(newState = null) {
    localStorage.removeItem('quizEditorState_v1'); // Clear old state
    if (newState && newState.questions) {
        DataManager.setAllQuestions(newState.questions);
        DOM.subjectInput.value = newState.metadata.subject || '';
        DOM.gradeInput.value = newState.metadata.grade || '';
        DOM.setNameInput.value = newState.metadata.setName || '';
    } else {
        DataManager.setAllQuestions([]);
        DOM.subjectInput.value = '';
        DOM.gradeInput.value = '';
        DOM.setNameInput.value = '';
    }
    DOM.questionsContainer.innerHTML = '';
    const currentQuestions = DataManager.getAllQuestions();
    if (currentQuestions.length === 0) {
        addQuestion();
    } else {
        currentQuestions.forEach(q => {
            const block = UIRenderer.renderQuestionBlock(q);
            UIRenderer.updateRemoveOptionButtons(block);
        });
    }
    updatePreviewSelectDropdown();
    updateSaveButtonState();
    saveEditorStateToLocalStorage();
}

function handleNewQuiz() {
    if (confirm("Are you sure you want to start a new quiz? Any unsaved changes will be lost.")) {
        resetEditorState();
    }
}

function saveEditorStateToLocalStorage() {
    try {
        const stateToSave = {
            version: 1,
            metadata: { subject: DOM.subjectInput.value, grade: DOM.gradeInput.value, setName: DOM.setNameInput.value },
            questions: DataManager.getAllQuestions()
        };
        localStorage.setItem('quizEditorState_v1', JSON.stringify(stateToSave));
    } catch (e) {
        console.error("Failed to save state to localStorage:", e);
    }
}


// --- EVENT LISTENERS ---
function bindEventListeners() {
    // Auth
    DOM.loginBtn.addEventListener('click', handleLogin);
    DOM.registerBtn.addEventListener('click', handleRegister);

    // Dashboard
    DOM.logoutBtn.addEventListener('click', handleLogout); // Dashboard logout
    DOM.createNewQuizBtn.addEventListener('click', openEditorForNewQuiz);
    DOM.quizListContainer.addEventListener('click', (e) => {
        if (e.target.closest('.edit-quiz-btn')) {
            const id = e.target.closest('.edit-quiz-btn').dataset.id;
            openEditorForExistingQuiz(id);
        }
        if (e.target.closest('.get-code-btn')) {
            const id = e.target.closest('.get-code-btn').dataset.id;
            alert(`Share this code with players: ${id}`);
        }
    });

    // Editor
    DOM.backToDashboardBtn.addEventListener('click', () => showView('dashboard'));
    DOM.logoutBtnEditor.addEventListener('click', handleLogout); // Editor logout
    DOM.saveQuizBtn.addEventListener('click', handleSaveQuiz); // Save to backend
    DOM.addQuestionBtn.addEventListener('click', addQuestion);

    // NEW: Editor specific event listeners (from second file)
    if (DOM.saveQuestionsBtn) DOM.saveQuestionsBtn.addEventListener('click', handleSaveQuestions); // Download JSON
    if (DOM.newQuizBtn) DOM.newQuizBtn.addEventListener('click', handleNewQuiz);
    if (DOM.loadFileBtn && DOM.hiddenFileInput) {
        DOM.loadFileBtn.addEventListener('click', () => DOM.hiddenFileInput.click());
        DOM.hiddenFileInput.addEventListener('change', handleFileLoad);
    }
    DOM.previewQuestionSelect.addEventListener('change', () => updateQuestionPreview());
    DOM.questionsContainer.addEventListener('click', (event) => {
        if (event.target.closest('.remove-question-btn')) removeQuestion(event.target.closest('.remove-question-btn'));
        if (event.target.closest('.add-option-btn')) addOption(event.target.closest('.add-option-btn'));
        if (event.target.closest('.remove-option-btn')) removeOption(event.target.closest('.remove-option-btn'));
    });
    DOM.questionsContainer.addEventListener('change', (event) => {
        if (event.target.classList.contains('questionType')) handleQuestionTypeChange(event);
    });
    DOM.questionsContainer.addEventListener('input', (event) => {
        if (event.target.closest('.question-block')) handleQuestionBlockInput(event);
    });
    // Ensure these elements exist before adding listeners
    if (DOM.subjectInput) DOM.subjectInput.addEventListener('input', () => { updateSaveButtonState(); saveEditorStateToLocalStorage(); });
    if (DOM.gradeInput) DOM.gradeInput.addEventListener('input', () => { updateSaveButtonState(); saveEditorStateToLocalStorage(); });
    if (DOM.setNameInput) DOM.setNameInput.addEventListener('input', () => { saveEditorStateToLocalStorage(); });

    // NEW: AI & Auth Modal Listeners (from second file)
    if (DOM.aiGenerateBtn) DOM.aiGenerateBtn.addEventListener('click', openAiModal);
    if (DOM.closeAiModalBtn) DOM.closeAiModalBtn.addEventListener('click', closeAiModal);
    if (DOM.aiModal) DOM.aiModal.addEventListener('click', (e) => { if (e.target === DOM.aiModal) closeAiModal(); });
    if (DOM.generateQuestionsBtn) DOM.generateQuestionsBtn.addEventListener('click', handleGenerateQuestions);

    // Auth modal listeners (these are for the modal that pops up when AI generation requires login)
    if (DOM.closeAuthModalBtn) DOM.closeAuthModalBtn.addEventListener('click', closeAuthModal);
    if (DOM.authModal) DOM.authModal.addEventListener('click', (e) => { if (e.target === DOM.authModal) closeAuthModal(); });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Editor DOM fully loaded. Initializing...");
    bindEventListeners();

    // Check for JWT token and show appropriate view (Dashboard or Auth)
    const token = localStorage.getItem('jwt_token');
    if (token) {
        showView('dashboard');
    } else {
        showView('auth');
    }

    // Initialize editor state from localStorage or add a new question
    const savedState = localStorage.getItem('quizEditorState_v1');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state && state.questions) {
                resetEditorState(state);
            } else {
                addQuestion(); // If state is malformed or empty questions, start fresh
            }
        } catch (e) {
            console.error("Failed to parse localStorage data:", e);
            addQuestion(); // On parse error, start fresh
        }
    } else {
        addQuestion(); // No saved state, start fresh
    }

    updateSaveButtonState();
    updatePreviewSelectDropdown();
    updateLoginStateUI(); // Ensure AI modal's logout button state is correct
});
