// js/editor.js

// This is the main entry point and coordination module.
// It handles DOM ready, initialization, top-level event listeners,
// and coordinating calls between other modules (DataManager, UIRenderer, Validation, PreviewRenderer).

const DOM = UIRenderer.DOM;
// --- AI & Auth Modal Elements ---
const aiGenerateBtn = document.getElementById('aiGenerateBtn');
// AI Modal
const aiModal = document.getElementById('aiModal');
const closeAiModalBtn = document.getElementById('closeAiModalBtn'); // Corrected ID from HTML
const aiGenerationForm = document.getElementById('aiGenerationForm');
const generateQuestionsBtn = document.getElementById('generateQuestionsBtn');
const aiLoadingSpinner = document.getElementById('aiLoadingSpinner');
const aiDocInput = document.getElementById('aiDocInput');
const aiSubject = document.getElementById('aiSubject');
const aiGrade = document.getElementById('aiGrade');
const aiNumQuestions = document.getElementById('aiNumQuestions');
const aiNotes = document.getElementById('aiNotes');
// Auth Modal
const authModal = document.getElementById('authModal');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn'); // Corrected ID from HTML
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const authError = document.getElementById('authError');

// --- Dashboard Elements ---
const dashboardView = document.getElementById('dashboardView');
const quizListContainer = document.getElementById('quizListContainer');
const createNewQuizBtn = document.getElementById('createNewQuizBtn');
const backToDashboardBtn = document.getElementById('backToDashboardBtn');
const logoutBtnDashboard = document.getElementById('logoutBtnDashboard');
const aiGenerateBtnDashboard = document.getElementById('aiGenerateBtnDashboard');

// --- Renamed/Repurposed Elements ---
const saveQuizBtn = document.getElementById('saveQuizBtn');
const quizCodeDisplay = document.getElementById('quizCodeDisplay');

const API_BASE_URL = 'https://quiz-backend-613338700440.us-central1.run.app';

// --- View Management Function ---
function switchView(viewToShow) {
    // Hide all major views
    editorView.style.display = 'none';
    authView.style.display = 'none';
    dashboardView.style.display = 'none';

    // Show the requested view
    if (viewName === 'editor') {
        editorView.style.display = 'block';
    } else if (viewName === 'auth') {
        authView.style.display = 'block';
    } else if (viewName === 'dashboard') {
        dashboardView.style.display = 'block';
    }
}

// --------------- AUTHENTICATION FUNCTIONS ---------------\n
function isLoggedIn() {
    return !!localStorage.getItem('jwt_token');
}

function updateLoginStateUI() {
    if (logoutBtnDashboard) {
        if (isLoggedIn()) {
            logoutBtnDashboard.style.display = 'inline-flex';
        } else {
            logoutBtnDashboard.style.display = 'none';
        }
    }
}

async function handleLogin() {
    // Get email and password from the form
    const email = authEmail.value;
    const password = authPassword.value;
    
    // Clear previous errors
    authError.style.display = 'none';

    // Basic validation
    if (!email || !password) {
        authError.textContent = "Email and password are required.";
        authError.style.display = 'block';
        return;
    }

    try {
        // Step 1: Call the login endpoint
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        // Step 2: Get the JSON response body
        const data = await response.json();

        // Step 3: Check if the request failed
        if (!response.ok) {
            // If it failed, use the message from the server's JSON response
            throw new Error(data.message || 'Invalid credentials');
        }

        // Step 4: CRITICAL - Check if the access_token exists in the successful response
        if (data.access_token) {
            // Step 5: If it exists, save it to localStorage
            localStorage.setItem('jwt_token', data.access_token);
            
            // Step 6: The user is now authenticated. Re-run the initialization logic,
            // which will now detect the login and show the editor.
            initializeApp();
        } else {
            // This is a failsafe for an unexpected server response
            throw new Error('Login succeeded but did not receive a token.');
        }

    } catch (error) {
        // If any step in the 'try' block fails, show the error
        authError.textContent = error.message;
        authError.style.display = 'block';
    }
}

async function handleRegister() {
    console.log("Attempting registration...");
    authError.style.display = 'none';
    const email = authEmail.value;
    const password = authPassword.value;

    if (!email || password.length < 6) {
        authError.textContent = 'Please enter a valid email and a password of at least 6 characters.';
        authError.style.display = 'block';
        console.error("Registration failed: Invalid email or password.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        console.log("Registration response status:", response.status);
        // ALWAYS parse the JSON, even for errors, to get the message
        const data = await response.json(); 
        console.log("Registration response data:", data);

        // NOW check if the response was successful
        if (!response.ok) {
            // Throw an error using the message from the parsed JSON
            throw new Error(data.message || `Registration failed with status: ${response.status}`);
        }
        
        alert('Registration successful! Please log in to continue.');
        
    } catch (error) {
        console.error("Registration fetch/processing error:", error);
        authError.textContent = error.message;
        authError.style.display = 'block';
    }
}

function handleLogout() {
    localStorage.removeItem('jwt_token');
    updateLoginStateUI();
    resetEditorState();
    switchView('auth');
    alert('You have been logged out.');
}

async function loadUserQuizzes() {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        switchView('auth');
        return;
    }
    
    quizListContainer.innerHTML = '<p>Loading your quizzes...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/quizzes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Could not fetch quizzes.');
        }

        const data = await response.json();
        renderQuizList(data.quizzes);

    } catch (error) {
        quizListContainer.innerHTML = `<p style="color: var(--danger);">Error loading quizzes: ${error.message}</p>`;
    }
}

function renderQuizList(quizzes) {
    quizListContainer.innerHTML = ''; // Clear loading message
    if (!quizzes || quizzes.length === 0) {
        quizListContainer.innerHTML = '<p>You haven\'t created any quizzes yet. Click "Create New Quiz" to start!</p>';
        return;
    }

    quizzes.forEach(quiz => {
        const quizItem = document.createElement('div');
        quizItem.className = 'quiz-item';
        quizItem.innerHTML = `
            <div>
                <div class="quiz-item-title">${quiz.title}</div>
                <div class="quiz-item-details">Code: ${quiz.id} | Created: ${new Date(quiz.created_at).toLocaleDateString()}</div>
            </div>
            <div class="quiz-item-actions">
                <button class="load-quiz-btn" data-quiz-id="${quiz.id}"><i class="fas fa-edit"></i> Edit</button>
                <button class="share-quiz-btn" data-quiz-id="${quiz.id}"><i class="fas fa-share-alt"></i> Share</button>
            </div>
        `;
        quizListContainer.appendChild(quizItem);
    });
}

function handleCreateNewQuiz() {
    resetEditorState();
    addQuestion(); // Add a single blank question
    switchView('editor');
    quizCodeDisplay.style.display = 'none'; // Hide the code display for new quizzes
}

async function handleSaveQuiz() {
    if (!Validation.validateAll(DOM.questionsContainer, DOM.quizTitleInput)) {
        alert("Please fix the errors before saving.");
        return;
    }

    saveQuizBtn.disabled = true;
    saveQuizBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const token = localStorage.getItem('jwt_token');
    const quizData = {
        title: DOM.quizTitleInput.value,
        quiz_data: DataManager.getAllQuestions()
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/save-quiz`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(quizData)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Failed to save quiz.');
        }
        
        const result = await response.json();
        quizCodeDisplay.querySelector('strong').textContent = result.quiz_code;
        quizCodeDisplay.style.display = 'block';
        alert(`Quiz saved successfully! Your quiz code is ${result.quiz_code}`);
        
    } catch(error) {
        alert(`Error saving quiz: ${error.message}`);
    } finally {
        saveQuizBtn.disabled = false;
        saveQuizBtn.innerHTML = '<i class="fas fa-save"></i> Save Quiz';
    }
}

// --------------- AI GENERATION FUNCTIONS ---------------\n
function openAiModal() {
    if (!isLoggedIn()) {
        authError.textContent = '';
        authError.style.display = 'none';
        authModal.classList.add('active');
        return;
    }
    aiDocInput.value = '';
    aiGenerationForm.style.display = 'block';
    aiLoadingSpinner.style.display = 'none';
    generateQuestionsBtn.disabled = false;
    aiModal.classList.add('active');
}

function closeAiModal() {
    aiModal.classList.remove('active');
}

function closeAuthModal() {
    authModal.classList.remove('active');
}

async function handleGenerateQuestions() {
    if (aiDocInput.files.length === 0) {
        alert('Please select a PDF or TXT file to upload.');
        return;
    }

    const token = localStorage.getItem('jwt_token');
    if (!token) {
        alert('Your session has expired. Please log in again.');
        openAiModal();
        return;
    }

    generateQuestionsBtn.disabled = true;
    aiGenerationForm.style.display = 'none';
    aiLoadingSpinner.style.display = 'block';

    const formData = new FormData();
    formData.append('document', aiDocInput.files[0]);
    formData.append('subject', aiSubject.value);
    formData.append('grade', aiGrade.value);
    formData.append('num_questions', aiNumQuestions.value);
    formData.append('notes', aiNotes.value);
    const selectedTypes = Array.from(document.querySelectorAll('input[name=\"aiQuestionType\"]:checked')).map(cb => cb.value).join(', ');
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
            authModal.classList.add('active');
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

        // Remove initial blank question
        const currentQuestions = DataManager.getAllQuestions();
        if (currentQuestions.length === 1 && isQuestionEffectivelyBlank(currentQuestions[0])) {
            console.log("Initial blank question found. Removing it before appending new questions.");
            // This removes the single blank question from the data store.
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
        alert(`Successfully added ${newQuestions.length} new question(s)!`);
        closeAiModal();

    } catch (error) {
        console.error('Error generating questions:', error);
        alert(`Failed to generate questions: ${error.message}`);
    } finally {
        generateQuestionsBtn.disabled = false;
        aiGenerationForm.style.display = 'block';
        aiLoadingSpinner.style.display = 'none';
    }
}


// --------------- HELPER FUNCTIONS ---------------\n
function generateFilename() {
    const title = DOM.quizTitleInput.value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]+/g, '') || 'quiz';
    let filename = title.toLowerCase();
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

// --------------- STATE MANAGEMENT & UI UPDATES ---------------\n
function addQuestion() {
    const newQuestionId = DataManager.generateNewId();
    const newQuestionData = { id: newQuestionId, type: 'single', Question: '', Options: [''], answer: null, Rationale: '', hint: '' };
    DataManager.addQuestion(newQuestionData);
    UIRenderer.renderQuestionBlock(newQuestionData);
    updateSaveButtonState();
    updatePreviewSelectDropdown(newQuestionId);
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
    }, 0);
}

function updateSaveButtonState() {
    const allValid = Validation.validateAll(DOM.questionsContainer, DOM.quizTitleInput);
    UIRenderer.updateSaveButtonState(allValid);
}

function handleSaveQuestions() {
    if (!Validation.validateAll(DOM.questionsContainer, DOM.quizTitleInput)) {
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

function resetEditorState() {
    DataManager.setAllQuestions([]);
    DOM.quizTitleInput.value = '';
    DOM.questionsContainer.innerHTML = '';
    
    updatePreviewSelectDropdown();
    updateSaveButtonState();
}

function handleNewQuiz() {
    if (confirm("Are you sure you want to start a new quiz? Any unsaved changes will be lost.")) {
        resetEditorState();
        addQuestion();
    }
}

// --------------- NEW VIEW MANAGEMENT & AUTH LOGIC ---------------\\

// Get references to our two main views
const editorView = document.getElementById('editorView');
const authView = document.getElementById('authView');

/**
 * The main view controller. Hides all views then shows the one requested.
 * @param {'editor' | 'auth'} viewName The name of the view to show.
 */
function switchView(viewName) {
    // 1. Hide all views
    editorView.style.display = 'none';
    authView.style.display = 'none';

    // 2. Show the requested view
    if (viewName === 'editor') {
        editorView.style.display = 'block';
    } else if (viewName === 'auth') {
        authView.style.display = 'block';
    }
}

async function handleLogin() {
    const email = authEmail.value;
    const password = authPassword.value;
    authError.style.display = 'none';

    if (!email || !password) {
        authError.textContent = "Email and password are required.";
        authError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Invalid credentials');
        }

        if (data.access_token) {
            localStorage.setItem('jwt_token', data.access_token);
            initializeApp(); // Re-run initialization to show the correct view
        } else {
            throw new Error('Login succeeded but did not receive a token.');
        }
    } catch (error) {
        authError.textContent = error.message;
        authError.style.display = 'block';
    }
}

function handleLogout() {
    localStorage.removeItem('jwt_token');
    resetEditorState(); // Clear the quiz data
    initializeApp(); // Re-run initialization to show the login screen
    alert('You have been logged out.');
}

// --------------- EVENT LISTENERS ---------------\n
function bindEventListeners() {
    // Original Listeners
    DOM.addQuestionBtn.addEventListener('click', addQuestion);
    const newQuizBtn = document.getElementById('newQuizBtn');
    if(newQuizBtn) newQuizBtn.addEventListener('click', handleNewQuiz);

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
    DOM.quizTitleInput.addEventListener('input', () => { updateSaveButtonState(); });

    saveQuizBtn.addEventListener('click', handleSaveQuiz);
    backToDashboardBtn.addEventListener('click', () => {
        if(confirm("Are you sure? Any unsaved changes will be lost.")) {
            switchView('dashboard');
            loadUserQuizzes(); // Refresh the list
        }
    });

    createNewQuizBtn.addEventListener('click', handleCreateNewQuiz);
    logoutBtnDashboard.addEventListener('click', handleLogout);
    aiGenerateBtnDashboard.addEventListener('click', openAiModal);

    document.body.addEventListener('click', async (event) => {
        if (event.target.closest('.load-quiz-btn')) {
            const quizId = event.target.closest('.load-quiz-btn').dataset.quizId;
            const response = await fetch(`${API_BASE_URL}/api/load-quiz/${quizId}`);
            const data = await response.json();
            if (data.success) {
                resetEditorState();
                // The /api/load-quiz endpoint returns the 'quiz_data' field directly.
                const loadedQuestions = data.quiz; // This is the array of questions
                const quizTitle = DOM.quizTitleInput.value; // The title is not returned by this endpoint, we get it from the list. We need to find it.

                // Let's find the title from the quiz list in the DOM to populate the editor
                const quizItem = event.target.closest('.quiz-item');
                const titleElement = quizItem.querySelector('.quiz-item-title');
                DOM.quizTitleInput.value = titleElement ? titleElement.textContent : 'Loaded Quiz';

                DataManager.setAllQuestions(loadedQuestions);
                // Re-render the editor from the loaded data
                loadedQuestions.forEach(q => {
                    UIRenderer.renderQuestionBlock(q);
                });
                updateSaveButtonState();
                updatePreviewSelectDropdown();
                switchView('editor');
            } else {
                alert('Failed to load quiz.');
            }
        }
    });
    // --- AI & Auth Modal Listeners ---
    if (aiGenerateBtn) aiGenerateBtn.addEventListener('click', openAiModal);
    if (closeAiModalBtn) closeAiModalBtn.addEventListener('click', closeAiModal);
    if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAiModal(); });
    if (generateQuestionsBtn) generateQuestionsBtn.addEventListener('click', handleGenerateQuestions);
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);
}

// --------------- INITIALIZATION ---------------\\

function initializeApp() {
    console.log("Running app initialization...");
    updateLoginStateUI(); // Always update logout button visibility

    if (isLoggedIn()) {
        console.log("User is logged in. Showing editor view.");
        // User is logged in. Show the editor.
        switchView('dashboard');
        loadUserQuizzes();
    } else {
        // User is not logged in. Show the login screen.
        console.log("User is not logged in. Showing auth view.");
        switchView('auth');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Editor DOM fully loaded. Binding event listeners and initializing...");
    bindEventListeners();
    initializeApp(); // Run the main app logic
});