// js/editor.js

// This is the main entry point and coordination module.
// It handles DOM ready, initialization, top-level event listeners,
// and coordinating calls between other modules (DataManager, UIRenderer, Validation, PreviewRenderer).

// Get references to key DOM elements from UIRenderer (which exposes them)
const DOM = UIRenderer.DOM;

// --- AI GENERATION MODAL ELEMENTS ---
const aiGenerateBtn = document.getElementById('aiGenerateBtn');
const aiModal = document.getElementById('aiModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const aiGenerationForm = document.getElementById('aiGenerationForm');
const generateQuestionsBtn = document.getElementById('generateQuestionsBtn');
const aiLoadingSpinner = document.getElementById('aiLoadingSpinner');
const aiDocInput = document.getElementById('aiDocInput');
// Add other AI form inputs if needed for validation, e.g.,
const aiSubject = document.getElementById('aiSubject');
const aiGrade = document.getElementById('aiGrade');
const aiNumQuestions = document.getElementById('aiNumQuestions');
const aiNotes = document.getElementById('aiNotes');

// --------------- HELPER FUNCTIONS ---------------

// Generates the filename based on metadata inputs
function generateFilename() {
    const subject = DOM.subjectInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '-') || 'subject';
    const grade = DOM.gradeInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '') || 'grade';
    // Using setName for the identifier part of the filename
    const identifier = DOM.setNameInput.value.trim().replace(/[^a-zA-Z0-9]+/g, '-') || 'set';

    // Construct filename like: subject_gradeX_identifier.json
    let filenameParts = [subject];
    // Only add grade if it's provided and not 'Unknown' (case-insensitive check)
    if (grade && grade.toLowerCase() !== 'unknown') {
        // Ensure grade part starts with 'grade' + the cleaned number/text
        filenameParts.push(`grade${grade}`);
    }
    // Only add identifier if it's provided and not a default placeholder
    if (identifier && identifier.toLowerCase() !== 'unknown' && identifier.toLowerCase() !== 'set') {
        filenameParts.push(identifier);
    }

    let filename = filenameParts.filter(Boolean).join('_') || 'questions'; // Join non-empty parts
    filename = filename.replace(/_+$/, ''); // Remove trailing underscores
    filename = filename.toLowerCase(); // Use lowercase for consistency with parser
    return `${filename}.json`;
}

// --------------- FILE HANDLING FUNCTIONS ---------------

// Handles the change event of the hidden file input
async function handleFileLoad(event) {
    const files = event.target.files; // Get the selected files

    if (files.length === 0) {
        return; // No files selected
    }

    // TODO: Add check for unsaved changes before proceeding
    if (!confirm(`Are you sure you want to load ${files.length} file(s)? This will replace the current editor content.`)) {
         // Clear the file input value so selecting the same file again triggers the change event
         DOM.hiddenFileInput.value = '';
         return; // User cancelled
    }


    const loadedQuestions = [];
    const fileReadPromises = [];

    // Iterate through selected files and read them
    for (const file of files) {
        const promise = new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const fileContent = e.target.result;
                    const parsedData = JSON.parse(fileContent);

                    // Basic validation: expect an array of questions or an object with a 'questions' array
                    let questionsArray = [];
                    let metadata = {};

                    if (Array.isArray(parsedData)) {
                         // Assume the file is just an array of questions
                         questionsArray = parsedData;
                         // No metadata found in this simple case
                    } else if (parsedData && Array.isArray(parsedData.questions)) {
                         // Assume the file is an object with metadata and a questions array
                         questionsArray = parsedData.questions;
                         metadata = parsedData.metadata || {}; // Include metadata if present
                    } else {
                        console.warn(`Skipping file \"${file.name}\": Does not contain a valid array of questions.`);
                        resolve(null); // Resolve with null to indicate skipping
                        return;
                    }

                    // Basic validation of question structure (optional but good practice)
                    const validQuestions = questionsArray.filter(q => {
                         // Check for basic properties like id, type, Question
                         const isValid = q && typeof q === 'object' && typeof q.Question === 'string' && typeof q.type === 'string';
                         if (!isValid) {
                              console.warn(`Skipping invalid question found in file \"${file.name}\".`, q);
                         }
                         return isValid;
                    });


                    console.log(`Successfully read and validated ${validQuestions.length} questions from \"${file.name}\".`);
                    resolve({ questions: validQuestions, metadata: metadata, filename: file.name }); // Resolve with valid questions and metadata
                } catch (error) {
                    console.error(`Error parsing JSON from file \"${file.name}\":`, error);
                    resolve(null); // Resolve with null to indicate error
                }
            };

            reader.onerror = (error) => {
                console.error(`Error reading file \"${file.name}\":`, error);
                reject(error); // Reject the promise on read error
            };

            reader.readAsText(file); // Read the file as text
        });

        fileReadPromises.push(promise);
    }

    // Wait for all file reads and parsing to complete
    const results = await Promise.allSettled(fileReadPromises);

    let totalQuestionsLoaded = 0;
    let firstFileMetadata = null; // Store metadata from the first successfully loaded file
    const compiledQuestions = []; // Array to hold questions from all files

    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value !== null) {
            // Result.value is { questions: [...], metadata: {...}, filename: '...' }
            // Add questions to our temporary compilation array
            compiledQuestions.push(...result.value.questions);
            totalQuestionsLoaded += result.value.questions.length;

            // Keep metadata from the first file, or merge?\n            // For simplicity now, let's just take metadata from the first successful file
            if (!firstFileMetadata) {
                 firstFileMetadata = result.value.metadata;
            }
            // Note: A more advanced version might prompt the user about metadata conflicts
            // or require them to enter new metadata for the compiled set.
        }
        // Errors/skipped files are already logged in the promise handler
    });

    if (totalQuestionsLoaded === 0) {
        alert("No valid questions were found in the selected file(s).");
         // Clear the file input value so selecting the same file again triggers the change event
         DOM.hiddenFileInput.value = '';
        return; // Nothing to load
    }

    console.log(`Total questions compiled from selected files: ${totalQuestionsLoaded}`);

    // --- Prepare data for resetEditorState ---
    // Assign NEW unique IDs to all questions before setting the state
    // Use DataManager.generateNewId() to get a new, unique ID for each question sequentially
    const questionsWithNewIds = compiledQuestions.map(q => {
         return { ...q, id: DataManager.generateNewId() }; // Assign a new ID
    });

    const compiledState = {
        metadata: firstFileMetadata || {}, // Use first file's metadata or empty
        questions: questionsWithNewIds // Use the questions with newly assigned unique IDs
    };


    // Use the shared reset function to update the editor state and UI
    resetEditorState(compiledState);

    alert(`Successfully loaded and compiled ${totalQuestionsLoaded} question(s).`);

    // Clear the file input value so selecting the same file again triggers the change event
    DOM.hiddenFileInput.value = '';
}


// --------------- STATE MANAGEMENT & UI UPDATES ---------------

// Function to add a new question block (Data -> UI -> Validation -> Preview)
function addQuestion() {
    const newQuestionId = DataManager.generateNewId(); // Get a unique ID from DataManager
    const newQuestionData = { // Create a basic data object
        id: newQuestionId,
        type: 'single', // Default type
        Question: '',
        Options: [''], // Start with one empty option input
        answer: null, // Default answer state
        Rationale: '',
        hint: ''
    };

    DataManager.addQuestion(newQuestionData); // Add to data manager
    const newBlockElement = UIRenderer.renderQuestionBlock(newQuestionData); // Render UI for this new question

    // Re-validate all questions and update save button state
    updateSaveButtonState();
    // Update the preview select dropdown and set selection to the new question
    updatePreviewSelectDropdown(newQuestionId);
    saveEditorStateToLocalStorage()
}

// Function to remove a question block (UI -> Data -> Validation -> Preview)
function removeQuestion(button) {
    const questionBlockElement = button.closest('.question-block');
    const removedBlockId = questionBlockElement.dataset.questionId;

    const questionBlocks = DOM.questionsContainer.querySelectorAll('.question-block');

    if (questionBlocks.length > 1) {
        if (confirm("Are you sure you want to remove this question?")) {
            DataManager.removeQuestion(removedBlockId); // Remove from data manager
            UIRenderer.removeQuestionBlock(questionBlockElement); // Remove from UI

            // Re-validate all questions and update save button state
            updateSaveButtonState();
            // Update preview dropdown, potentially selecting a new question
            updatePreviewSelectDropdown(removedBlockId); // Pass removed ID to hint UIRenderer
            saveEditorStateToLocalStorage()
        }
    } else {
        alert("You must have at least one question.");
    }
}

// Function to add an option input field (UI -> Data Update -> UI Update -> Validation -> Preview)
function addOption(button) {
    const questionBlockElement = button.closest('.question-block');
    const questionId = questionBlockElement.dataset.questionId;
    const questionData = DataManager.getQuestionById(questionId);

    if (!questionData || !['single', 'multi-select', 'ordering'].includes(questionData.type)) {
        console.warn(`Attempted to add option to a ${questionData ? questionData.type : 'unknown'} question.`);
        return;
    }

    // Add an empty option to the data
    questionData.Options = questionData.Options || [];
    questionData.Options.push(''); // Add a new empty option to the data

    // Update the data manager
    DataManager.updateQuestion(questionId, questionData);

    // Re-render the options UI and update answer UI based on the updated data
    // This ensures the new option appears and the answer selection/ordering UI is updated
    UIRenderer.renderOptionInputs(questionBlockElement, questionData.Options);
    UIRenderer.updateAnswerUI(questionBlockElement, questionData.answer); // Pass existing answer to preserve selections/order

    // Re-validate the block and update overall save state
    updateSaveButtonState();
    // Update preview if this block is currently previewed
    if (DOM.previewQuestionSelect.value === questionId) {
         updateQuestionPreview(questionId);
    }
    saveEditorStateToLocalStorage()
}

// Function to remove an option input field (UI -> Data Update -> UI Update -> Validation -> Preview)
function removeOption(button) {
    const optionsList = button.closest('.optionsList');
    const questionBlockElement = button.closest('.question-block');
    const questionId = questionBlockElement.dataset.questionId;
    const questionData = DataManager.getQuestionById(questionId);

    // Get current options from UI to find the one to remove
    const optionItemToRemove = button.closest('.option-item'); // The parent option item div
    const optionsItems = Array.from(optionsList.querySelectorAll('.option-item'));
    const indexToRemove = optionsItems.indexOf(optionItemToRemove);

    if (indexToRemove === -1) {
         console.error("Could not find option item element to remove in the list.");
         return;
    }


    if (!questionData || !questionData.Options || questionData.Options.length <= 1) {
        alert("You need at least one option.");
        return;
    }

    // Remove the option from the data array
    const removedOptionValue = questionData.Options[indexToRemove]; // Get value before removing
    questionData.Options.splice(indexToRemove, 1);

    // Update the answer data to remove references to the old option value
    if (questionData.type === 'single') {
        if (questionData.answer === removedOptionValue) {
            questionData.answer = null; // Deselect if the removed option was the answer
        }
    } else if (questionData.type === 'multi-select') {
        if (Array.isArray(questionData.answer)) {
            questionData.answer = questionData.answer.filter(a => a !== removedOptionValue);
        }
    } else if (questionData.type === 'ordering') {
         if (Array.isArray(questionData.answer)) {
             questionData.answer = questionData.answer.filter(a => a !== removedOptionValue);
         }
         // Note: The order numbers in the UI's .order-options will need re-syncing/re-sorting
         // This is handled by updateAnswerUI/renderOrderOptions/sortOrderOptions
     }

    // Update the data manager
    DataManager.updateQuestion(questionId, questionData);

    // Re-render the options UI and update answer UI based on the updated data
    UIRenderer.renderOptionInputs(questionBlockElement, questionData.Options);
    UIRenderer.updateAnswerUI(questionBlockElement, questionData.answer); // Pass updated answer data

    // Re-validate the block and update overall save state
    updateSaveButtonState();
    // Update preview if this block is currently previewed
    if (DOM.previewQuestionSelect.value === questionId) {
         updateQuestionPreview(questionId);
    }
    saveEditorStateToLocalStorage()
}


// Handles changes to question type select
function handleQuestionTypeChange(event) {
    const selectElement = event.target;
    const questionBlockElement = selectElement.closest('.question-block');
    const questionId = questionBlockElement.dataset.questionId;
    const newType = selectElement.value;

    const questionData = DataManager.getQuestionById(questionId);
    if (!questionData) return;

    // Update the type in the data object
    questionData.type = newType;
    // When type changes, the answer structure might be incompatible.
    // Resetting answer and options here is a safe default.
    // More advanced logic could attempt to preserve compatible data.
    if (!['single', 'multi-select', 'ordering'].includes(newType)) {
         questionData.Options = undefined; // Clear options if not needed
         questionData.answer = undefined; // Clear answer
    } else {
         // If changing TO an options type, ensure Options is an array (might be undefined from fill-in)
         questionData.Options = Array.isArray(questionData.Options) ? questionData.Options : [''];
         // Reset answer as structure likely changed (e.g., single to multi)
         questionData.answer = (newType === 'multi-select' || newType === 'ordering') ? [] : null;
    }


    // Update the data manager with the type and possibly reset data
    DataManager.updateQuestion(questionId, questionData);

    // Update the UI's options and answer section based on the updated data
    UIRenderer.renderOptionInputs(questionBlockElement, questionData.Options); // Re-render options inputs based on data
    UIRenderer.updateAnswerUI(questionBlockElement, questionData.answer); // Re-render answer UI based on type and data

    // Ensure remove option buttons visibility is correct for the new type
    UIRenderer.updateRemoveOptionButtons(questionBlockElement);

    // Re-validate the block and update overall save state
    updateSaveButtonState();
    // Update preview if this block is currently previewed
    if (DOM.previewQuestionSelect.value === questionId) {
         updateQuestionPreview(questionId);
    }
    saveEditorStateToLocalStorage()
}


// Handles input changes on various fields within a question block
function handleQuestionBlockInput(event) {
    const target = event.target;
    const questionBlockElement = target.closest('.question-block');
    if (!questionBlockElement) return;

    const questionId = questionBlockElement.dataset.questionId;

    // Use a small timeout to allow the input value to update in the DOM before reading
    setTimeout(() => {
        // Read the updated state of the entire block from the UI
        const updatedData = UIRenderer.getQuestionDataFromBlock(questionBlockElement);

        // Update the question data object in the DataManager
        DataManager.updateQuestion(questionId, updatedData);

        // Trigger necessary UI updates that depend on input values
        // (e.g., re-rendering answer options when option text changes)
        if (target.classList.contains('option-input')) {
             // Options text changed, need to re-render answer options (radio/checkbox)
             // and ordering items text.
             UIRenderer.renderAnswerOptions(questionBlockElement, updatedData.answer); // Update radio/checkbox options
             UIRenderer.renderOrderOptions(questionBlockElement, updatedData.answer); // Update ordering options list (updates text and sorts)
             // Note: sortOrderOptions is called internally by renderOrderOptions
        } else if (target.classList.contains('order-input')) {
             // Order input number changed, need to re-sort ordering items visually
             // and update the data manager with the new order.
             // Sorting is handled by UIRenderer via delegated input listener, which calls sortOrderOptions.
             // The data update is handled by getQuestionDataFromBlock reading the new order after sort.
        } else if (target.closest('.answerOptions')) {
            // Radio or Checkbox selection changed.
            // Data is updated by getQuestionDataFromBlock.
            // No UI re-render needed here, just validation and preview.
        } else if (target.classList.contains('correctAnswer')) {
             // Fill-in answer changed.
             // Data is updated by getQuestionDataFromBlock.
             // No UI re-render needed here, just validation and preview.
        }
        // For other inputs (text, rationale, hint), only validation and preview are needed,
        // which are handled below.


        // Re-validate the block and update overall save state
        updateSaveButtonState();
        // Update preview if this block is currently previewed
        if (DOM.previewQuestionSelect.value === questionId) {
             updateQuestionPreview(questionId);
        }
        saveEditorStateToLocalStorage()
    }, 0);
}


// Updates the overall save button state based on validation
function updateSaveButtonState() {
     const allValid = Validation.validateAll(DOM.questionsContainer, DOM.subjectInput, DOM.gradeInput);
     UIRenderer.updateSaveButtonState(allValid);
}

// Handles the save button click
function handleSaveQuestions() {
    // Re-run validation just in case (button should be disabled if invalid)
    if (!Validation.validateAll(DOM.questionsContainer, DOM.subjectInput, DOM.gradeInput)) {
         alert("Please fix the errors in the form before saving."); // Provide user feedback
         return;
    }

    const questionsToSave = DataManager.getAllQuestions(); // Get data from the manager
    const filename = generateFilename(); // Use metadata to generate filename

    // Create and download JSON
    const jsonString = JSON.stringify(questionsToSave, null, 2);
    const blob = new Blob([jsonString], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    // Clean up
    URL.revokeObjectURL(url);

    console.log(`Successfully saved ${questionsToSave.length} question(s) to ${filename}`);
    alert(`Successfully saved ${questionsToSave.length} question(s)`); // Use alert for user feedback
}


// Updates the preview select dropdown options
function updatePreviewSelectDropdown(selectedQuestionId = null) {
     const questions = DataManager.getAllQuestions();
     // UIRenderer.updatePreviewSelect updates the dropdown and returns the ID
     // of the question that should now be selected/previewed.
     const questionIdToPreview = UIRenderer.updatePreviewSelect(questions, selectedQuestionId);

     // Trigger the preview render for the determined question ID
     if (questionIdToPreview) {
          updateQuestionPreview(questionIdToPreview);
     } else {
         // Clear the preview area if no question is selected/available
         DOM.questionPreviewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Select a question above to see how it looks in the quiz app.</p>';
     }
}

// Renders the preview for the currently selected question in the dropdown
function updateQuestionPreview(questionId = null) {
    const selectedBlockId = questionId || DOM.previewQuestionSelect.value;
    const previewArea = DOM.questionPreviewArea;

    if (!selectedBlockId || DOM.previewQuestionSelect.disabled) {
        previewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Select a question above to see how it looks in the quiz app.</p>';
        return;
    }

    // Get the question data object from the DataManager
    const questionData = DataManager.getQuestionById(selectedBlockId);

    if (questionData) {
        // Use the PreviewRenderer to render the data object into the preview area
        PreviewRenderer.renderPreview(questionData, previewArea);
    } else {
        console.error(`Could not find question data with ID: ${selectedBlockId} for preview.`);
        previewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Error finding question data for preview.</p>';
    }
}

// --- AI GENERATION FUNCTIONS ---

function openAiModal() {
    // Reset the form in case it was used before
    aiDocInput.value = ''; 
    aiGenerationForm.style.display = 'block';
    aiLoadingSpinner.style.display = 'none';
    generateQuestionsBtn.disabled = false;
    aiModal.classList.add('active');
}

function closeAiModal() {
    aiModal.classList.remove('active');
}

async function handleGenerateQuestions() {
    // 1. Validate input
    if (aiDocInput.files.length === 0) {
        alert('Please select a PDF or TXT file to upload.');
        return;
    }

    // 2. Prepare for API call
    generateQuestionsBtn.disabled = true;
    aiGenerationForm.style.display = 'none';
    aiLoadingSpinner.style.display = 'block';

    // 3. Collect data into FormData
    const formData = new FormData();
    formData.append('document', aiDocInput.files[0]);
    formData.append('subject', aiSubject.value);
    formData.append('grade', aiGrade.value);
    formData.append('num_questions', aiNumQuestions.value);
    formData.append('notes', aiNotes.value);
    
    // Collect selected checkbox values
    const selectedTypes = Array.from(document.querySelectorAll('input[name="aiQuestionType"]:checked'))
        .map(cb => cb.value)
        .join(', ');
    formData.append('question_types', selectedTypes);

    // 4. Make the fetch call to the backend
    try {
        const response = await fetch('http://localhost:5000/api/generate-questions', {
            method: 'POST',
            body: formData,
            // For file uploads with FormData, DO NOT set the 'Content-Type' header.
            // The browser will set it automatically with the correct boundary.
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            // Handle backend errors (e.g., bad file, AI error)
            throw new Error(result.message || 'An unknown error occurred.');
        }

        // 5. Process successful response (append questions)
        const newQuestions = result.questions;
        if (!newQuestions || !Array.isArray(newQuestions) || newQuestions.length === 0) {
            throw new Error('The AI did not return any questions.');
        }

        newQuestions.forEach(q => {
            // Assign a new, unique frontend ID to each question from the AI
            const newQuestionId = DataManager.generateNewId();
            const questionData = { ...q, id: newQuestionId };
            
            // Use existing functions to add the data and render the UI
            DataManager.addQuestion(questionData);
            const newBlock = UIRenderer.renderQuestionBlock(questionData);
            UIRenderer.updateRemoveOptionButtons(newBlock);
        });
        
        // Refresh the entire UI state
        updateSaveButtonState();
        updatePreviewSelectDropdown();
        saveEditorStateToLocalStorage(); // Save the new appended state
        
        alert(`Successfully added ${newQuestions.length} new question(s)!`);
        closeAiModal();

    } catch (error) {
        console.error('Error generating questions:', error);
        alert(`Failed to generate questions: ${error.message}`);
    } finally {
        // 6. Reset the modal UI regardless of success or failure
        generateQuestionsBtn.disabled = false;
        aiGenerationForm.style.display = 'block';
        aiLoadingSpinner.style.display = 'none';
    }
}

// --------------- STATE RESET / LOAD HANDLER ---------------

// Resets the editor to a clean state, optionally loading provided data
// This function handles clearing the UI, updating DataManager, and re-rendering
// It is used by 'New Quiz' and 'Load from File' features
function resetEditorState(newState = null) {
    // Clear localStorage autosave first, as we are explicitly changing state
    localStorage.removeItem('quizEditorState_v1');
    console.log("localStorage autosave cleared.");

    if (newState && Array.isArray(newState.questions) && newState.metadata) {
         console.log(`Loading ${newState.questions.length} questions into editor.`);
         DataManager.setAllQuestions(newState.questions); // Load questions into DataManager

         // Populate metadata fields
         DOM.subjectInput.value = newState.metadata.subject || '';
         DOM.gradeInput.value = newState.metadata.grade || '';
         DOM.setNameInput.value = newState.metadata.setName || '';

    } else {
        console.log("Resetting editor to initial state (no data loaded).");
        DataManager.setAllQuestions([]); // Clear DataManager
        // Reset metadata fields
        DOM.subjectInput.value = '';
        DOM.gradeInput.value = '';
        DOM.setNameInput.value = '';
    }

    // Clear and re-render UI based on the new state in DataManager
    DOM.questionsContainer.innerHTML = ''; // Clear existing content

    const currentQuestions = DataManager.getAllQuestions();
    if (currentQuestions.length === 0) {
        // If no questions were loaded (or after 'New Quiz'), add the initial empty one
         addQuestion(); // This function adds to DataManager and renders UI
    } else {
         // If questions were loaded, render them
         currentQuestions.forEach((q, index) => {
              const blockElement = UIRenderer.renderQuestionBlock(q);
              UIRenderer.updateRemoveOptionButtons(blockElement); // Ensure remove button visibility is correct
         });
         // Manually re-number questions if they were loaded (addQuestion does this automatically)
         DOM.questionsContainer.querySelectorAll('.question-block').forEach((block, index) => {
             block.querySelector('.question-number').textContent = `Question #${index + 1}`;
         });
    }


    // Update preview dropdown and render preview for the first question (if any)
    updatePreviewSelectDropdown();

    // Re-validate and update save button state based on the new state
    updateSaveButtonState();

    // Save the new state (empty or loaded) to localStorage immediately after reset
    saveEditorStateToLocalStorage();
}

// Handles the "New Quiz" button click
function handleNewQuiz() {
    // TODO: Add check for unsaved changes before confirming
    if (confirm("Are you sure you want to start a new quiz? Any unsaved changes will be lost.")) {
        resetEditorState(); // Call the reset function with no data
    }
}


// --------------- PERSISTENCE FUNCTIONS ---------------

// Saves the current editor state (metadata + questions) to localStorage
function saveEditorStateToLocalStorage() {
    try {
        const stateToSave = {
            version: 1, // Include a version number for future compatibility
            metadata: {
                subject: DOM.subjectInput.value.trim(),
                grade: DOM.gradeInput.value.trim(),
                setName: DOM.setNameInput.value.trim(),
            },
            questions: DataManager.getAllQuestions() // Get the current state from DataManager
        };
        const jsonString = JSON.stringify(stateToSave);
        localStorage.setItem('quizEditorState_v1', jsonString); // Use the same versioned key
        // console.log("Editor state saved to localStorage."); // Optional: log saves
    } catch (e) {
        console.error("Failed to save state to localStorage:", e);
        // Optionally inform the user if saving fails repeatedly due to storage limits
    }
}


// --------------- EVENT LISTENERS ---------------

function bindEventListeners() {
    // Add Question Button
    DOM.addQuestionBtn.addEventListener('click', addQuestion);

    // Save Button (for file export)
    DOM.saveQuestionsBtn.addEventListener('click', handleSaveQuestions);

    // New Quiz Button
    const newQuizBtn = document.getElementById('newQuizBtn');
    if (newQuizBtn) {
        newQuizBtn.addEventListener('click', handleNewQuiz);
    } else {
        console.error("New Quiz button not found!");
    }

    // Load File Button & Hidden Input
    const loadFileBtn = document.getElementById('loadFileBtn');
    const hiddenFileInput = document.getElementById('hiddenFileInput');
    if (loadFileBtn && hiddenFileInput) {
        loadFileBtn.addEventListener('click', () => {
            hiddenFileInput.click(); // Programmatically click the hidden file input
        });
        hiddenFileInput.addEventListener('change', handleFileLoad); // Listen for file selection
        // Expose hiddenFileInput to DOM object for use in handleFileLoad
        DOM.hiddenFileInput = hiddenFileInput;
    } else {
        console.error("Load File button or hidden input not found!");
    }


    // Preview Select Dropdown
    DOM.previewQuestionSelect.addEventListener('change', () => updateQuestionPreview()); // Call preview update for the new selection

    // Use event delegation on questionsContainer for clicks on buttons
    DOM.questionsContainer.addEventListener('click', (event) => {
        const target = event.target;

        // Handle remove question button clicks
        const removeQuestionBtn = target.closest('.remove-question-btn');
        if (removeQuestionBtn) {
            removeQuestion(removeQuestionBtn);
            return; // Stop processing this click
        }
        // Handle add option button clicks
        const addOptionBtn = target.closest('.add-option-btn');
        if (addOptionBtn) {
            addOption(addOptionBtn);
            return; // Stop processing this click
        }
        // Handle remove option button clicks
        const removeOptionBtn = target.closest('.remove-option-btn');
        if (removeOptionBtn) {
            removeOption(removeOptionBtn);
            return; // Stop processing this click
        }
    });

    // Use event delegation on questionsContainer for change events on select elements
    DOM.questionsContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (target.classList.contains('questionType')) {
             handleQuestionTypeChange(event);
        }
        // Add other change listeners here if needed
    });

    // Use event delegation on questionsContainer for input events on input/textarea elements
    DOM.questionsContainer.addEventListener('input', (event) => {
        const target = event.target;
        // Check if the input is within a question block and is one of the editable fields
        // Use a timeout to allow the DOM value to update before reading it
        setTimeout(() => {
             const questionBlockElement = target.closest('.question-block');
             if (!questionBlockElement) return; // Ensure we are inside a question block

             // Check specific classes that trigger data update and related UI renders
             if (target.classList.contains('questionText') ||
                 target.classList.contains('rationale') ||
                 target.classList.contains('hint') ||
                 target.classList.contains('option-input') ||
                 target.classList.contains('correctAnswer') || // Fill-in answer
                 target.closest('.answerOptions') || // Radio/Checkbox change (input event fires on the input)
                 target.classList.contains('order-input') // Order input change
                )
             {
                  handleQuestionBlockInput(event);
             }
        }, 0);
    });


    // Add input listeners for metadata fields to trigger validation state update AND save to localStorage
    DOM.subjectInput.addEventListener('input', () => {
        updateSaveButtonState();
        saveEditorStateToLocalStorage();
    });
    DOM.gradeInput.addEventListener('input', () => {
        updateSaveButtonState();
        saveEditorStateToLocalStorage();
    });
    DOM.setNameInput.addEventListener('input', () => {
        updateSaveButtonState();
        saveEditorStateToLocalStorage();
    });

    // --- AI MODAL LISTENERS ---
    if (aiGenerateBtn) {
    aiGenerateBtn.addEventListener('click', openAiModal);
    }
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAiModal);
    }
    if (aiModal) {
        // Close modal if user clicks on the dark overlay
        aiModal.addEventListener('click', (event) => {
            if (event.target === aiModal) {
                closeAiModal();
            }
        });
    }
    if (generateQuestionsBtn) {
        generateQuestionsBtn.addEventListener('click', handleGenerateQuestions);
    }

}


// --------------- INITIALIZATION ---------------

// Initial setup when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("Editor DOM fully loaded. Initializing...");

    // Bind event listeners
    bindEventListeners();

    // --- Persistence: Attempt to load state from localStorage ---
    const savedState = localStorage.getItem('quizEditorState_v1'); // Use a versioned key

    if (savedState) {
        try {
            const state = JSON.parse(savedState);

            // Basic validation of loaded structure
            if (state && Array.isArray(state.questions) && state.metadata) {
                console.log("Attempting to load state from localStorage...");
                DataManager.setAllQuestions(state.questions); // Load questions into DataManager

                // Populate metadata fields
                DOM.subjectInput.value = state.metadata.subject || '';
                DOM.gradeInput.value = state.metadata.grade || '';
                DOM.setNameInput.value = state.metadata.setName || '';

                // Render the UI based on the loaded questions
                DOM.questionsContainer.innerHTML = ''; // Clear any initial content
                DataManager.getAllQuestions().forEach((q, index) => {
                     const blockElement = UIRenderer.renderQuestionBlock(q);
                     // Ensure the remove button visibility is correct after rendering
                     UIRenderer.updateRemoveOptionButtons(blockElement);
                });

                console.log(`Loaded ${state.questions.length} question(s) from localStorage.`);

            } else {
                console.warn("localStorage data found but format is invalid. Starting fresh.");
                // If data is invalid, proceed to add the initial question
                addQuestion();
            }
        } catch (e) {
            console.error("Failed to parse localStorage data. Starting fresh.", e);
            // If parsing fails, proceed to add the initial question
            addQuestion();
        }
    } else {
        console.log("No localStorage data found. Starting with an initial question.");
        // If no data in localStorage, add the initial empty question block
        addQuestion();
    }

    // After loading or starting fresh, ensure UI state is correct
    updateSaveButtonState(); // Validate and update save button
    updatePreviewSelectDropdown(); // Populate preview dropdown and render initial preview

});
