// js/editor.js

// This is the main entry point and coordination module.
// It handles DOM ready, initialization, top-level event listeners,
// and coordinating calls between other modules (DataManager, UIRenderer, Validation, PreviewRenderer).

const DOM = UIRenderer.DOM;

// --- AI & Auth Modal Elements ---
const aiGenerateBtn = document.getElementById('aiGenerateBtn');
const logoutBtn = document.getElementById('logoutBtn');
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

const API_BASE_URL = 'http://localhost:5000';

// --------------- AUTHENTICATION FUNCTIONS ---------------
function isLoggedIn() {
    return !!localStorage.getItem('jwt_token');
}

function updateLoginStateUI() {
    if (isLoggedIn()) {
        logoutBtn.style.display = 'inline-flex';
    } else {
        logoutBtn.style.display = 'none';
    }
}

async function handleLogin() {
    console.log("Attempting login...");
    authError.style.display = 'none';
    const email = authEmail.value;
    const password = authPassword.value;

    if (!email || !password) {
        authError.textContent = 'Email and password are required.';
        authError.style.display = 'block';
        console.error("Login failed: Missing email or password.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        console.log("Login response status:", response.status);
        const data = await response.json();
        console.log("Login response data:", data);

        if (!response.ok) {
            throw new Error(data.message || `Login failed with status: ${response.status}`);
        }

        // --- CRUCIAL PART ---
        if (data.access_token) {
            console.log("Access token found in response. Saving to localStorage...");
            localStorage.setItem('jwt_token', data.access_token);
            console.log("Token saved. Current value:", localStorage.getItem('jwt_token'));
            
            // Now, update UI and proceed
            authModal.classList.remove('active');
            updateLoginStateUI();
            openAiModal(); // This will now succeed because isLoggedIn() will be true
        } else {
            // This case handles if the server sends a 200 OK but no token, which is unlikely but good to guard against.
            throw new Error("Login successful, but no access token was provided by the server.");
        }
        
    } catch (error) {
        console.error("Login fetch/processing error:", error);
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
    alert('You have been logged out.');
}

// --------------- AI GENERATION FUNCTIONS ---------------
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
    const selectedTypes = Array.from(document.querySelectorAll('input[name="aiQuestionType"]:checked')).map(cb => cb.value).join(', ');
    formData.append('question_types', selectedTypes);

    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-questions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const result = await response.json();

        if (response.status === 401 || response.status === 422) {
            handleLogout();
            alert("Your session has expired. Please log in again.");
            closeAiModal();
            authModal.classList.add('active');
            return;
        }

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'An unknown error occurred.');
        }

        const newQuestions = result.questions;
        if (!newQuestions || !Array.isArray(newQuestions) || newQuestions.length === 0) {
            throw new Error('The AI did not return any valid questions.');
        }

        newQuestions.forEach(q => {
            const newQuestionId = DataManager.generateNewId();
            const questionData = { ...q, id: newQuestionId };
            DataManager.addQuestion(questionData);
            const newBlock = UIRenderer.renderQuestionBlock(questionData);
            UIRenderer.updateRemoveOptionButtons(newBlock);
        });

        updateSaveButtonState();
        updatePreviewSelectDropdown();
        saveEditorStateToLocalStorage();
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


// --------------- ORIGINAL EDITOR HELPER FUNCTIONS ---------------\n
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
    const allValid = Validation.validateAll(DOM.questionsContainer, DOM.subjectInput, DOM.gradeInput);
    UIRenderer.updateSaveButtonState(allValid);
}

function handleSaveQuestions() {
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
    localStorage.removeItem('quizEditorState_v1');
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


// --------------- EVENT LISTENERS ---------------\n
function bindEventListeners() {
    // Original Listeners
    DOM.addQuestionBtn.addEventListener('click', addQuestion);
    DOM.saveQuestionsBtn.addEventListener('click', handleSaveQuestions);
    const newQuizBtn = document.getElementById('newQuizBtn');
    if(newQuizBtn) newQuizBtn.addEventListener('click', handleNewQuiz);
    const loadFileBtn = document.getElementById('loadFileBtn');
    const hiddenFileInput = document.getElementById('hiddenFileInput');
    if(loadFileBtn && hiddenFileInput) {
        loadFileBtn.addEventListener('click', () => hiddenFileInput.click());
        hiddenFileInput.addEventListener('change', handleFileLoad);
        DOM.hiddenFileInput = hiddenFileInput; // Make sure it's available
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
    DOM.subjectInput.addEventListener('input', () => { updateSaveButtonState(); saveEditorStateToLocalStorage(); });
    DOM.gradeInput.addEventListener('input', () => { updateSaveButtonState(); saveEditorStateToLocalStorage(); });
    DOM.setNameInput.addEventListener('input', () => { saveEditorStateToLocalStorage(); });

    // --- NEW: AI & Auth Modal Listeners ---
    if (aiGenerateBtn) aiGenerateBtn.addEventListener('click', openAiModal);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (closeAiModalBtn) closeAiModalBtn.addEventListener('click', closeAiModal);
    if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAiModal(); });
    if (generateQuestionsBtn) generateQuestionsBtn.addEventListener('click', handleGenerateQuestions);
    
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);
    if (closeAuthModalBtn) closeAuthModalBtn.addEventListener('click', closeAuthModal);
    if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });
}

// --------------- INITIALIZATION ---------------\n
document.addEventListener('DOMContentLoaded', () => {
    console.log("Editor DOM fully loaded. Initializing...");
    bindEventListeners();
    const savedState = localStorage.getItem('quizEditorState_v1');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state && state.questions) {
                resetEditorState(state);
            } else {
                addQuestion();
            }
        } catch (e) {
            console.error("Failed to parse localStorage data:", e);
            addQuestion();
        }
    } else {
        addQuestion();
    }
    updateSaveButtonState();
    updatePreviewSelectDropdown();
    updateLoginStateUI();
});